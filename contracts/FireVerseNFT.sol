// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract FireVerseNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 private _tokenIds;
    uint96 public defaultFeeNumerator;

    event MintFireVerseNFT(uint256 indexed tokenId, address indexed recipient, string tokenURI);

    constructor(string memory name_, string memory symbol_, uint96 feeNumerator_) ERC721(name_, symbol_) {
        defaultFeeNumerator = feeNumerator_;
    }

    function mint(address recipient, string memory tokenURI_) external onlyOwner {
        _tokenIds += 1;
        uint256 newTokenId = _tokenIds;

        _mint(recipient, newTokenId);
        _setTokenURI(newTokenId, tokenURI_);
        _setTokenRoyalty(newTokenId, recipient, defaultFeeNumerator);

        emit MintFireVerseNFT(newTokenId, recipient, tokenURI_);
    }

    function batchMint(address[] calldata recipients, string[] calldata tokenURIs) external onlyOwner {
        uint256 length = recipients.length;
        require(tokenURIs.length == length, "FireVerseNFT: array length mismatch");

        for (uint256 i = 0; i < length; i++) {
            _tokenIds += 1;
            uint256 newTokenId = _tokenIds;

            _mint(recipients[i], newTokenId);
            _setTokenURI(newTokenId, tokenURIs[i]);
            _setTokenRoyalty(newTokenId, recipients[i], defaultFeeNumerator);
            emit MintFireVerseNFT(newTokenId, recipients[i], tokenURIs[i]);
        }
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    function setDefaultFeeNumerator(uint96 feeNumerator) external onlyOwner {
        defaultFeeNumerator = feeNumerator;
    }

    function burn(uint256 tokenId) public virtual {
        //solhint-disable-next-line max-line-length
        require(_isApprovedOrOwner(_msgSender(), tokenId), "FireVerseNFT: caller is not token owner or approved");
        _burn(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
