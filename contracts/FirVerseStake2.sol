// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract FirVerseStake2 is ERC721Holder, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable firToken;
    IERC721 public immutable vboxNFT;

    uint256 public minStakeAmount;

    struct StakeInfo {
        uint256 nftId;
        uint256 amount;
        uint256 nftStakeTimestamp;
        uint256 tokenStakeTimestamp;
        bool nftRedeemed;
        bool tokenRedeemed;
    }

    mapping(address => StakeInfo) public stakes;

    event NftStaked(address indexed user, uint256 indexed nftId);
    event NftRedeemed(address indexed user, uint256 indexed nftId);
    
    event TokenStaked(address indexed user, uint256 amount);
    event TokenRedeemed(address indexed user, uint256 amount);

    constructor(address vboxNFT_, address firToken_, uint256 minStakeAmount_) {
        vboxNFT = IERC721(vboxNFT_);
        firToken = IERC20(firToken_);
        minStakeAmount = minStakeAmount_;
    }

    function setMinStakeAmount(uint256 minAmount) external onlyOwner {
        minStakeAmount = minAmount;
    }

    function stakeNft(uint256 nftId) external nonReentrant {
        _stakeNft(msg.sender, nftId);
    }

    function stakeToken(uint256 amount) external nonReentrant {
        _stakeToken(msg.sender, amount);
    }

    function _stakeNft(address user, uint256 nftId) internal {
        StakeInfo memory s = stakes[user];
        require(s.nftStakeTimestamp == 0, "Already staked");
        require(vboxNFT.ownerOf(nftId) == user, "Not NFT owner");

        s.nftId = nftId;
        s.nftStakeTimestamp = block.timestamp;
        stakes[user] = s;

        vboxNFT.safeTransferFrom(user, address(this), nftId);

        emit NftStaked(user, nftId);
    }

    function _stakeToken(address user, uint256 amount) internal {
        StakeInfo memory s = stakes[user];
        require(amount >= minStakeAmount, "Below minimum stake amount");
        require(!s.tokenRedeemed, "Can not stake");

        s.amount = s.amount + amount;
        s.tokenStakeTimestamp = block.timestamp;
        stakes[user] = s;

        firToken.safeTransferFrom(user, address(this), amount);

        emit TokenStaked(user, amount);
    }

    function redeemNft() external nonReentrant {
        _redeemNft(msg.sender);
    }

    function redeemToken() external nonReentrant {
        _redeemToken(msg.sender);
    }

    function _redeemNft(address user) internal {
        StakeInfo memory s = stakes[user];
        require(!s.nftRedeemed, "Already redeemed");

        vboxNFT.safeTransferFrom(address(this), user, s.nftId);
        
        s.nftRedeemed = true;
        s.nftId = 0;
        stakes[user] = s;

        emit NftRedeemed(user, s.nftId);
    }

    function _redeemToken(address user) internal {
        StakeInfo memory s = stakes[user];
        require(!s.tokenRedeemed, "Already redeemed");

        firToken.safeTransfer(user, s.amount);

        s.tokenRedeemed = true;
        s.amount = 0;
        stakes[user] = s;

        emit TokenRedeemed(user, s.amount);
    }
}
