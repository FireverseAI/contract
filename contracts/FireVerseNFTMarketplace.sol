// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FireVerseNFTMarketplace is EIP712, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;
    using Address for address payable;

    string private constant SIGNING_DOMAIN = "FireVerseNFTMarketplace";
    string private constant SIGNATURE_VERSION = "1";

    struct Order {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 price;
        address paymentToken;
        uint256 nonce;
        uint256 expiry;
    }

    bytes32 private constant ORDER_TYPEHASH =
        keccak256(
            "Order(address seller,address nft,uint256 tokenId,uint256 price,address paymentToken,uint256 nonce,uint256 expiry)"
        );

    mapping(address => bool) public allowedNFTs;
    mapping(address => bool) public allowedPaymentTokens;

    mapping(address => mapping(address => mapping(uint256 => uint256))) public nonces;

    address public platformFeeRecipient;
    uint96 public platformFeeBps = 100;

    event OrderExecuted(
        address indexed buyer,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 price,
        address paymentToken
    );
    event OrderCancelled(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 nonce);
    event NFTAllowed(address nft, bool allowed);
    event PaymentTokenAllowed(address token, bool allowed);
    event PlatformFeeUpdated(address recipient, uint96 feeBps);

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
        platformFeeRecipient = msg.sender;
    }

    function allowNFT(address nft, bool allowed) external onlyOwner {
        allowedNFTs[nft] = allowed;
        emit NFTAllowed(nft, allowed);
    }

    function allowPaymentToken(address token, bool allowed) external onlyOwner {
        allowedPaymentTokens[token] = allowed;
        emit PaymentTokenAllowed(token, allowed);
    }

    function setPlatformFee(address recipient, uint96 feeBps) external onlyOwner {
        require(feeBps <= 10000, "Over 100%");
        platformFeeRecipient = recipient;
        platformFeeBps = feeBps;
        emit PlatformFeeUpdated(recipient, feeBps);
    }

    function verify(Order calldata order, bytes calldata signature) public view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.seller,
                order.nft,
                order.tokenId,
                order.price,
                order.paymentToken,
                order.nonce,
                order.expiry
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        return digest.recover(signature) == order.seller;
    }

    function buy(Order calldata order, bytes calldata signature) external payable nonReentrant {
        require(block.timestamp <= order.expiry, "Order expired");
        require(allowedNFTs[order.nft], "NFT not allowed");
        require(allowedPaymentTokens[order.paymentToken], "Token not allowed");
        require(order.nonce == nonces[order.seller][order.nft][order.tokenId], "Invalid nonce");
        require(verify(order, signature), "Invalid signature");

        nonces[order.seller][order.nft][order.tokenId]++;

        IERC721 nft = IERC721(order.nft);
        require(nft.ownerOf(order.tokenId) == order.seller, "Seller not NFT owner");
        require(
            nft.getApproved(order.tokenId) == address(this) || nft.isApprovedForAll(order.seller, address(this)),
            "Marketplace not approved"
        );

        (address royaltyRecipient, uint256 royaltyAmount) = _getRoyalty(order.nft, order.tokenId, order.price);
        uint256 platformFee = (order.price * platformFeeBps) / 10_000;
        uint256 sellerAmount = order.price - royaltyAmount - platformFee;

        if (order.paymentToken == address(0)) {
            // Native Token
            require(msg.value == order.price, "Incorrect Native Token amount");
            if (royaltyAmount > 0) payable(royaltyRecipient).sendValue(royaltyAmount);
            if (platformFee > 0) payable(platformFeeRecipient).sendValue(platformFee);
            payable(order.seller).sendValue(sellerAmount);
        } else {
            // ERC20
            IERC20 token = IERC20(order.paymentToken);
            if (royaltyAmount > 0) token.safeTransferFrom(msg.sender, royaltyRecipient, royaltyAmount);
            if (platformFee > 0) token.safeTransferFrom(msg.sender, platformFeeRecipient, platformFee);
            token.safeTransferFrom(msg.sender, order.seller, sellerAmount);
        }

        nft.safeTransferFrom(order.seller, msg.sender, order.tokenId);

        emit OrderExecuted(msg.sender, order.seller, order.nft, order.tokenId, order.price, order.paymentToken);
    }

    function batchCancelOrder(
        address[] calldata nftContracts,
        uint256[] calldata tokenIds,
        uint256[] calldata nonces_
    ) external {
        require(nftContracts.length == tokenIds.length, "Array length mismatch");
        for (uint256 i = 0; i < nftContracts.length; i++) {
            require(nonces_[i] == nonces[msg.sender][nftContracts[i]][tokenIds[i]], "Invalid nonce to cancel");

            nonces[msg.sender][nftContracts[i]][tokenIds[i]]++;

            emit OrderCancelled(msg.sender, nftContracts[i], tokenIds[i], nonces_[i]);
        }
    }

    function cancelOrder(address nft, uint256 tokenId, uint256 nonce) external {
        require(nonce == nonces[msg.sender][nft][tokenId], "Invalid nonce to cancel");

        nonces[msg.sender][nft][tokenId]++;

        emit OrderCancelled(msg.sender, nft, tokenId, nonce);
    }

    function _getRoyalty(address nft, uint256 tokenId, uint256 salePrice) internal view returns (address, uint256) {
        if (IERC165(nft).supportsInterface(type(IERC2981).interfaceId)) {
            try IERC2981(nft).royaltyInfo(tokenId, salePrice) returns (address receiver, uint256 amount) {
                return (receiver, amount);
            } catch {}
        }
        return (address(0), 0);
    }
}
