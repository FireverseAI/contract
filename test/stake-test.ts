import { expect } from 'chai'
import { ethers } from 'hardhat'
import { formatUnits, keccak256, parseEther, parseUnits, solidityPack } from 'ethers/lib/utils'
import { time, takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers'
import { deployContract } from './utils/contracts'
import { getWalletWithEther } from './utils/impersonate'
import { BigNumber, Wallet } from 'ethers'
import MerkleTree from 'merkletreejs'

import { FirVerseStake, FIR, TestERC721 } from '../typechain'

const ONE_DAY = 86400

function toUTC0(ts: number): number {
  return Math.floor(ts / ONE_DAY) * ONE_DAY
}

async function moveToDay(startTs: number, day: number) {
  const target = startTs + (day) * ONE_DAY + 1000
  await time.setNextBlockTimestamp(target)
}

describe('FirVerseStake', function () {
  let owner: any, user0: Wallet, user1: Wallet, user2: Wallet
  let fir: FIR, nft: TestERC721, staking: FirVerseStake
  let snapshot: SnapshotRestorer
  
  let whitelisted: Wallet[] = []
  let unWhitelisted: Wallet[] = []

  const totalReward = parseEther('360')
  const dailyReward = totalReward.div(BigNumber.from(360))
  const lockDays = 15
  const arpBps = 2500 // 25%
  let startTimestamp: number

  before(async () => {
    owner = await ethers.getNamedSigner('deployer')
    user0 = await getWalletWithEther()
    user1 = await getWalletWithEther()
    user2 = await getWalletWithEther()

    whitelisted.push(user0)
    whitelisted.push(user1)
    
    unWhitelisted.push(user2)

    fir = (await deployContract('FIR', ['FIR Token', 'FIR', parseEther('1000000000'), owner.address])) as FIR
    nft = (await deployContract('TestERC721', ['VBox', 'VBOX'])) as TestERC721

    await nft.connect(user0).mint(1)
    await nft.connect(user0).mint(2)

    const now = await time.latest()
    startTimestamp = toUTC0(now) + ONE_DAY

    staking = (await deployContract('FirVerseStake', [nft.address, fir.address, startTimestamp, totalReward])) as FirVerseStake

    await staking.connect(owner).addStakeType(lockDays, arpBps)

    await fir.transfer(user0.address, parseEther('10000'))
    await fir.transfer(staking.address, totalReward)
    await fir.connect(user0).approve(staking.address, ethers.constants.MaxUint256)
    await nft.connect(user0).setApprovalForAll(staking.address, true)

    snapshot = await takeSnapshot()
  })

  beforeEach(async () => {
    await snapshot.restore()
  })

  it(`Stake limit amount`, async () => {
    await moveToDay(startTimestamp, 1)
    await expect(staking.connect(user0).stake(1, 0, parseEther('0.99'))).revertedWith("Below minimum stake amount")
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    await expect(staking.connect(user0).stake(1, 0, parseEther('1000.1'))).revertedWith("Exceeds NFT stake limit")
    await staking.connect(owner).setStakeAmountLimits(parseEther('0.5'), parseEther('2100'))
    await staking.connect(user0).stake(1, 0, parseEther('0.99'))
    await staking.connect(user0).stake(1, 0, parseEther('1000.1'))
  })

  it(`Stake`, async () => {
    await expect(staking.connect(user0).stake(1, 0, parseEther('1000'))).to.be.revertedWith("Not start")
    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    const stakeIds = await staking.getUserStakeIds(user0.address)
    
    await moveToDay(startTimestamp, 361)
    await expect(staking.connect(user0).stake(1, 0, parseEther('1000'))).to.be.revertedWith("Stake end")

    expect(stakeIds.length).to.eq(1)
    expect(await nft.ownerOf(1)).eq(staking.address)
    expect(await fir.balanceOf(user0.address)).eq(parseEther('9000'))
    expect(await fir.balanceOf(staking.address)).eq(totalReward.add(parseEther('1000')))
  })

  it(`Batch Stake`, async () => {
    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).batchStake([1, 2], [0, 1], [parseEther('1000'), parseEther('100')])
    const userStakes = await staking.getUserStakes(user0.address)
    
    expect(userStakes.length).to.eq(2)
    expect(await nft.ownerOf(1)).eq(staking.address)
    expect(await fir.balanceOf(user0.address)).eq(parseEther('8900'))
    expect(await fir.balanceOf(staking.address)).eq(totalReward.add(parseEther('1100')))
  })

  it(`Stake and claim full reward`, async () => {
    await moveToDay(startTimestamp, 0)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    const stakeIds = await staking.getUserStakeIds(user0.address)
    expect(stakeIds.length).to.eq(1)
    
    const leafNodes = whitelisted.map((x) => keccak256(solidityPack(['address', 'uint256'], [x.address, parseUnits("1")])))
    const tree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })
    const root = tree.getHexRoot()
    await staking.connect(owner).setMerkleRoot(1, root)

    const leaf = keccak256(solidityPack(['address', 'uint256'], [whitelisted[0].address, parseUnits('1')]))
    const proof = tree.getHexProof(leaf)

    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).claim(parseUnits('1'), proof)
    
    const expectedReward = parseUnits('1')
    const actual = await fir.balanceOf(user0.address)
    const base = parseEther('9000')

    expect(actual).equal(base.add(expectedReward))
    
    expect(await fir.balanceOf(staking.address)).eq(totalReward.add(parseEther('1000')).sub(expectedReward))

    expect(await staking.lastBurnedDay()).eq(0)
  })

  it(`Stake and claim not enough reward`, async () => {
    await moveToDay(startTimestamp, 0)
    await staking.connect(user0).stake(1, 0, parseEther('1500'))
    const stakeIds = await staking.getUserStakeIds(user0.address)
    expect(stakeIds.length).to.eq(1)

    const leafNodes = whitelisted.map((x) => keccak256(solidityPack(['address', 'uint256'], [x.address, parseUnits("2.1")])))
    const tree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })
    const root = tree.getHexRoot()
    await staking.connect(owner).setMerkleRoot(1, root)

    const leaf = keccak256(solidityPack(['address', 'uint256'], [whitelisted[0].address, parseUnits('2.1')]))
    const proof = tree.getHexProof(leaf)

    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).claim(parseUnits('2.1'), proof)
    
    expect(await fir.balanceOf(staking.address)).eq(totalReward.add(parseEther('1500')).sub(dailyReward))

    await moveToDay(startTimestamp, 361)
    await staking.connect(owner).setMerkleRoot(361, root)
    await staking.connect(user0).claim(parseUnits('2'), proof)

    const expectedReward = dailyReward.mul(1)
    const actual = await fir.balanceOf(user0.address)
    const base = parseEther('8500')

    expect(actual).equal(base.add(expectedReward))
    
    expect(await fir.balanceOf(staking.address)).eq(totalReward.add(parseEther('1500')).sub(parseEther('360')))
  })

  it('Redeem stake', async () => {
    await moveToDay(startTimestamp, 0)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    const [id] = await staking.getUserStakeIds(user0.address)

    await moveToDay(startTimestamp, lockDays)
    await expect(staking.connect(user0).redeem(id)).to.be.revertedWith('Stake not matured')

    await moveToDay(startTimestamp, 1 + lockDays)
    await staking.connect(user0).redeem(id)

    await expect(staking.connect(user0).redeem(id)).to.be.revertedWith('Already redeemed')

    const bal = await fir.balanceOf(user0.address)
    expect(bal).to.equal(parseEther('10000'))
  })

  it('Only one day rewards for claiming multiple times a day', async () => {
    await moveToDay(startTimestamp, 0)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))

    const before = await fir.balanceOf(user0.address)
    
    const leafNodes = whitelisted.map((x) => keccak256(solidityPack(['address', 'uint256'], [x.address, parseUnits("1")])))
    const tree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })
    const root = tree.getHexRoot()
    await staking.connect(owner).setMerkleRoot(1, root)

    const leaf = keccak256(solidityPack(['address', 'uint256'], [whitelisted[0].address, parseUnits('1')]))
    const proof = tree.getHexProof(leaf)

    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).claim(parseUnits('1'), proof)

    const afterFirst = await fir.balanceOf(user0.address)
    expect(afterFirst).to.be.gt(before)

    await staking.connect(user0).claim(parseUnits('1'), proof)
    const afterSecond = await fir.balanceOf(user0.address)
    expect(afterSecond.sub(afterFirst)).to.eq(0)
  })

  it('NFT is allow withdraw after full redemption', async () => {
    await moveToDay(startTimestamp, 0)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    const [id] = await staking.getUserStakeIds(user0.address)

    await moveToDay(startTimestamp, 1 + lockDays)
    await staking.connect(user0).redeem(id)
    await staking.connect(user0).withdrawNFT(1)

    expect(await nft.ownerOf(1)).to.eq(user0.address)
  })

  it('NFTs in staking cannot be withdrawn', async () => {
    await moveToDay(startTimestamp, 1)
    await staking.connect(user0).stake(1, 0, parseEther('1000'))
    await expect(staking.connect(user0).withdrawNFT(1)).to.be.revertedWith('NFT still in use')
  })
})
