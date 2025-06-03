import { expect } from 'chai'
import { formatBytes32String, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { getWalletWithEther } from './utils/impersonate'
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers'
import { Wallet } from 'ethers'
import { deployContract } from './utils/contracts'

import { FireVerseNFT } from '../typechain'

describe('FireVerseNFT', async function () {
  let owner: any

  let user0: Wallet
  let user1: Wallet

  const { provider } = ethers
  before('', async function () {
    owner = await ethers.getNamedSigner('deployer')
    // console.log('owner', owner.address)

    user0 = await getWalletWithEther()
    user1 = await getWalletWithEther()
  })

  describe('', function () {
    let snapshot: SnapshotRestorer

    let fireVerseNFT: FireVerseNFT

    before('', async function () {
      fireVerseNFT = (await deployContract('FireVerseNFT', ['FireVerse NFT', 'FireVerseNFT', 100])) as FireVerseNFT

      snapshot = await takeSnapshot()
    })
    // beforeEach(async () => {
    //   await snapshot.restore()
    // })
    // after(async () => {
    //   await snapshot.restore()
    // })

    it('inits', async () => {
      expect(await fireVerseNFT.name()).equal('FireVerse NFT')
      expect(await fireVerseNFT.symbol()).equal('FireVerseNFT')
    })

    it('mint', async () => {
      const uri = 'http://example.com/1'
      await expect(fireVerseNFT.connect(user0).mint(user0.address, uri)).revertedWith("Ownable: caller is not the owner")
      await fireVerseNFT.connect(owner).mint(user0.address, uri)
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
      const uri1 = 'http://example.com/2'
      const uri2 = 'http://example.com/3'
      await fireVerseNFT.connect(owner).batchMint([user0.address,user1.address], [uri1, uri2])
      expect(await fireVerseNFT.ownerOf(2)).equals(user0.address)
      expect(await fireVerseNFT.balanceOf(user0.address)).equal(2)
      expect(await fireVerseNFT.tokenURI(2)).equal(uri1)
      expect(await fireVerseNFT.ownerOf(3)).equals(user1.address)
      expect(await fireVerseNFT.balanceOf(user1.address)).equal(1)
      expect(await fireVerseNFT.tokenURI(3)).equal(uri2)
      expect(await fireVerseNFT.royaltyInfo(2, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.2')])
      expect(await fireVerseNFT.royaltyInfo(3, parseUnits('10'))).to.deep.equal([user1.address, parseUnits('0.2')])
    })

    it('setTokenRoyalty', async () => {
      const uri = 'http://example.com/1'
      // await expect(fireVerseNFT.connect(user0).mint(user0.address, uri)).revertedWith("Ownable: caller is not the owner")
      await fireVerseNFT.connect(owner).setTokenRoyalty(2, user0.address, 300)
      expect(await fireVerseNFT.royaltyInfo(2, parseUnits('10'))).to.deep.equal([user0.address, parseUnits('0.3')])
    })
  })
})
