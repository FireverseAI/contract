import { expect } from 'chai'
import { ethers } from 'hardhat'
import { formatUnits, keccak256, parseEther, parseUnits, solidityPack } from 'ethers/lib/utils'
import { time, takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers'
import { deployContract } from './utils/contracts'
import { getWalletWithEther } from './utils/impersonate'
import { BigNumber, Wallet } from 'ethers'
import MerkleTree from 'merkletreejs'

import { FirVerseStake2, FIR, TestERC721 } from '../typechain'

describe('FirVerseStake2', function () {
  let owner: any, user0: Wallet, user1: Wallet, user2: Wallet
  let fir: FIR, nft: TestERC721, staking: FirVerseStake2
  let snapshot: SnapshotRestorer

  before(async () => {
    owner = await ethers.getNamedSigner('deployer')
    user0 = await getWalletWithEther()
    user1 = await getWalletWithEther()
    user2 = await getWalletWithEther()

    fir = (await deployContract('FIR', ['FIR Token', 'FIR', parseEther('1000000000'), owner.address])) as FIR
    nft = (await deployContract('TestERC721', ['VBox', 'VBOX'])) as TestERC721

    await nft.connect(user0).mint(1)
    await nft.connect(user0).mint(2)

    const minStakeAmount = parseEther('100')
    staking = (await deployContract('FirVerseStake2', [nft.address, fir.address, minStakeAmount])) as FirVerseStake2

    await fir.transfer(user0.address, parseEther('10000'))
    await fir.connect(user0).approve(staking.address, ethers.constants.MaxUint256)
    await nft.connect(user0).setApprovalForAll(staking.address, true)

    snapshot = await takeSnapshot()
  })

  beforeEach(async () => {
    await snapshot.restore()
  })

  it(`Stake`, async () => {
    await expect(staking.connect(user0).stakeToken(parseEther('1'))).revertedWith("Below minimum stake amount")
    
    await staking.connect(user0).stakeToken(parseEther('1000'))
    await staking.connect(user0).stakeNft(1)
    
    expect(await fir.balanceOf(staking.address)).to.equal(parseEther('1000'))
    expect(await fir.balanceOf(user0.address)).to.equal(parseEther('10000').sub(parseEther('1000')))

    console.log('stakeInfo', await staking.stakes(user0.address))
  })

  it('Redeem stake', async () => {
    await staking.connect(user0).stakeToken(parseEther('1000'))
    await staking.connect(user0).stakeNft(1)

    await staking.connect(user0).redeemNft()
    await staking.connect(user0).redeemToken()

    await expect(staking.connect(user0).redeemNft()).to.be.revertedWith('Already redeemed')
    await expect(staking.connect(user0).redeemToken()).to.be.revertedWith('Already redeemed')

    const bal = await fir.balanceOf(user0.address)
    expect(bal).to.equal(parseEther('10000'))
    
    console.log('stakeInfo', await staking.stakes(user0.address))
  })
})
