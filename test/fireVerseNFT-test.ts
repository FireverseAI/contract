import { expect } from 'chai'
import { formatBytes32String, keccak256, parseUnits, solidityPack } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { getWalletWithEther } from './utils/impersonate'
import { takeSnapshot, SnapshotRestorer, time } from '@nomicfoundation/hardhat-network-helpers'
import { Wallet } from 'ethers'
import { deployContract } from './utils/contracts'

import { FireVerseNFT } from '../typechain'

describe('FireVerseNFT', async function () {
  let owner: any

  let signer: Wallet
  let user0: Wallet
  let user1: Wallet

  const { provider } = ethers
  before('', async function () {
    owner = await ethers.getNamedSigner('deployer')
    // console.log('owner', owner.address)

    signer = await getWalletWithEther()
    user0 = await getWalletWithEther()
    user1 = await getWalletWithEther()
  })

  describe('', function () {
    let snapshot: SnapshotRestorer

    let fireVerseNFT: FireVerseNFT

    before('', async function () {
      fireVerseNFT = (await deployContract('FireVerseNFT', ['FireVerse NFT', 'FireVerseNFT', 100, signer.address])) as FireVerseNFT

      snapshot = await takeSnapshot()
    })
    beforeEach(async () => {
      await snapshot.restore()
    })
    after(async () => {
      await snapshot.restore()
    })

    it('inits', async () => {
      expect(await fireVerseNFT.name()).equal('FireVerse NFT')
      expect(await fireVerseNFT.symbol()).equal('FireVerseNFT')
    })

    it('mint', async () => {
      const uri = 'http://example.com/1'
      const expiry = await time.latest() + 10
      const hash = keccak256(solidityPack(['uint256', 'address', 'address', 'uint256', 'string', 'uint256'], [await getChainId(), fireVerseNFT.address, user0.address, 1, uri, expiry]))
      const signature = signer.signMessage(ethers.utils.arrayify(hash))
      await fireVerseNFT.connect(user0).mint(1, uri, expiry, signature)
      expect(await fireVerseNFT.ownerOf(1)).equals(user0.address)
      expect(await fireVerseNFT.balanceOf(user0.address)).equal(1)
      expect(await fireVerseNFT.tokenURI(1)).equal(uri)
      expect(await fireVerseNFT.royaltyInfo(1, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.1')])
    })

    it('setDefaultFeeNumerator', async function () {
      await fireVerseNFT.connect(owner).setDefaultFeeNumerator(200)
      expect(await fireVerseNFT.defaultFeeNumerator()).equals(200)
    })
    it('batchMint', async () => {
      await fireVerseNFT.connect(owner).setDefaultFeeNumerator(200)
      const uri1 = 'http://example.com/1'
      const uri2 = 'http://example.com/2'
      await fireVerseNFT.connect(owner).batchMint([1, 2], [user0.address, user0.address], [uri1, uri2])
      expect(await fireVerseNFT.balanceOf(user0.address)).equal(2)
      expect(await fireVerseNFT.ownerOf(1)).equals(user0.address)
      expect(await fireVerseNFT.tokenURI(1)).equal(uri1)
      expect(await fireVerseNFT.ownerOf(2)).equals(user0.address)
      expect(await fireVerseNFT.tokenURI(2)).equal(uri2)
      expect(await fireVerseNFT.royaltyInfo(1, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.2')])
      expect(await fireVerseNFT.royaltyInfo(2, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.2')])
    })

    it('setTokenRoyalty', async () => {
      const uri = 'http://example.com/1'
      // await expect(fireVerseNFT.connect(user0).mint(user0.address, uri)).revertedWith("Ownable: caller is not the owner")
      await fireVerseNFT.connect(owner).setTokenRoyalty(2, user0.address, 300)
      expect(await fireVerseNFT.royaltyInfo(2, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.3')])
    })
  })
})
