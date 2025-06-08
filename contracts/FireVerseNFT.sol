// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract FireVerseNFT is ERC721URIStorage, ERC2981, Ownable {
    uint96 public defaultFeeNumerator;

    event MintFireVerseNFT(uint256 indexed tokenId, address indexed recipient, string tokenURI);
    event UpdateDefaultFeeNumerator(uint96 newDefaultFeeNumerator);

    constructor(string memory name_, string memory symbol_, uint96 feeNumerator_) ERC721(name_, symbol_) {
        defaultFeeNumerator = feeNumerator_;
    }

    function mint(uint256 tokenId, string memory tokenURI_) external {
        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        _setTokenRoyalty(tokenId, msg.sender, defaultFeeNumerator);

        emit MintFireVerseNFT(tokenId, msg.sender, tokenURI_);
    }

    function batchMint(uint256[] calldata tokenIds, string[] calldata tokenURIs) external {
        uint256 length = tokenIds.length;

        require(tokenURIs.length == length, "FireVerseNFT: array length mismatch");

        for (uint256 i = 0; i < length; i++) {
            _mint(msg.sender, tokenIds[i]);
            _setTokenURI(tokenIds[i], tokenURIs[i]);
            _setTokenRoyalty(tokenIds[i], msg.sender, defaultFeeNumerator);
            emit MintFireVerseNFT(tokenIds[i], msg.sender, tokenURIs[i]);
        }
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    function setDefaultFeeNumerator(uint96 feeNumerator) external onlyOwner {
        defaultFeeNumerator = feeNumerator;
        emit UpdateDefaultFeeNumerator(feeNumerator);
    }

    function burn(uint256 tokenId) public virtual {
        //solhint-disable-next-line max-line-length
        require(_isApprovedOrOwner(_msgSender(), tokenId), "FireVerseNFT: caller is not token owner or approved");
        _burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
