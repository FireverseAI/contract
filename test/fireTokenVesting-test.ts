import { expect } from 'chai'
import { formatBytes32String, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { getWalletWithEther } from './utils/impersonate'
import { takeSnapshot, SnapshotRestorer, time } from '@nomicfoundation/hardhat-network-helpers'
import { Wallet } from 'ethers'
import { deployContract } from './utils/contracts'

import { FIR, FireVerseNFT, FirTokenVesting } from '../typechain'

describe('FirTokenVesting', async function () {
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

    let fir: FIR
    let firTokenVesting: FirTokenVesting
    const ONE_DAY = 24 * 60 * 60
    const start = Math.floor(Date.now() / 1000) + 30 * ONE_DAY

    before('', async function () {
      fir = (await deployContract('FIR', ['FIR', 'FIR', parseUnits('1000000000'), owner.address])) as FIR
      
      firTokenVesting = (await deployContract('FirTokenVesting', [fir.address, user0.address, start])) as FirTokenVesting
      snapshot = await takeSnapshot()
    })
    beforeEach(async () => {
      await snapshot.restore()
    })
    after(async () => {
      await snapshot.restore()
    })

    it('inits', async () => {
      expect(await firTokenVesting.beneficiary()).equal(user0.address)
    })

    it('claim', async () => {
      expect(await firTokenVesting.claimableAmount()).equal(0)
      await expect(firTokenVesting.connect(user0).claim()).revertedWith("Nothing to claim")
      expect(await fir.balanceOf(user0.address)).equal(0)

      await time.setNextBlockTimestamp(start + 1)
      await expect(firTokenVesting.connect(user0).claim()).revertedWith("Nothing to claim")

      await fir.transfer(firTokenVesting.address, parseUnits('10000'))
      await firTokenVesting.connect(user0).claim()
      expect(await fir.balanceOf(user0.address)).equal(parseUnits('10000'))

      await fir.transfer(firTokenVesting.address, parseUnits('10000'))
      await firTokenVesting.connect(user0).claim()
      expect(await fir.balanceOf(user0.address)).equal(parseUnits('20000'))
      
      await fir.transfer(firTokenVesting.address, parseUnits('25000000'))
      await firTokenVesting.connect(user0).claim()
      expect(await fir.balanceOf(user0.address)).equal(parseUnits('25000000'))
      expect(await fir.balanceOf(firTokenVesting.address)).equal(parseUnits('20000'))

      
      await time.setNextBlockTimestamp(start + 30 * ONE_DAY)
      await fir.transfer(firTokenVesting.address, parseUnits('25000000'))
      await firTokenVesting.connect(user0).claim()
      expect(await fir.balanceOf(user0.address)).equal(parseUnits('50000000'))
    })
  })
})
