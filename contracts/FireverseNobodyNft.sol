// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title Standard BSC NFT ERC-721 Contract
 * @dev This is a basic ERC-721 compliant NFT contract for Binance Smart Chain (BSC).
 * It includes minting functionality, URI storage for metadata, and ownership control.
 * Deployable on BSC as it's EVM-compatible.
 */
contract FireverseNobodyNft is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Event for minting
    event NFTMinted(uint256 indexed tokenId, address indexed recipient, string tokenURI);

    /**
     * @dev Constructor to initialize the NFT name and symbol.
     * @param name_ The name of the NFT collection.
     * @param symbol_ The symbol of the NFT collection.
     */
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    /**
     * @dev Mint a new NFT to a recipient with a given tokenURI.
     * Only the owner can mint.
     * @param recipient The address to receive the NFT.
     * @param tokenURI_ The metadata URI for the NFT.
     * @return The new token ID.
     */
    function mint(address recipient, string memory tokenURI_) external onlyOwner returns (uint256) {
        _tokenIdCounter.increment();
        uint256 newTokenId = _tokenIdCounter.current();

        _safeMint(recipient, newTokenId);
        _setTokenURI(newTokenId, tokenURI_);

        emit NFTMinted(newTokenId, recipient, tokenURI_);

        return newTokenId;
    }

    /**
     * @dev Batch mint multiple NFTs to recipients.
     * Only the owner can batch mint.
     * @param recipients Array of addresses to receive NFTs.
     * @param tokenURIs Array of metadata URIs corresponding to each NFT.
     */
    function batchMint(address[] calldata recipients, string[] calldata tokenURIs) external onlyOwner {
        require(recipients.length == tokenURIs.length, "StandardBSCNFT: Array lengths mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            _tokenIdCounter.increment();
            uint256 newTokenId = _tokenIdCounter.current();

            _safeMint(recipients[i], newTokenId);
            _setTokenURI(newTokenId, tokenURIs[i]);

            emit NFTMinted(newTokenId, recipients[i], tokenURIs[i]);
        }
    }

    /**
     * @dev Burn an NFT. Can only be called by the owner or approved operator.
     * @param tokenId The ID of the token to burn.
     */
    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "StandardBSCNFT: Caller is not owner or approved");
        _burn(tokenId);
    }

    /**
     * @dev Override supportsInterface to support both ERC721 and ERC721URIStorage.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}