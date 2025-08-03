import { expect } from 'chai'
import { formatBytes32String, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { getWalletWithEther } from './utils/impersonate'
import { takeSnapshot, SnapshotRestorer, time } from '@nomicfoundation/hardhat-network-helpers'
import { Wallet } from 'ethers'
import { deployContract } from './utils/contracts'

import { FIR, FireVerseNFT, VestingWallet } from '../typechain'

describe('fireVesting', async function () {
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
    let vestingWallet: VestingWallet
    const start = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

    before('', async function () {
      fir = (await deployContract('FIR', ['FIR', 'FIR', parseUnits('1000000000'), owner.address])) as FIR
      
      vestingWallet = (await deployContract('VestingWallet', [user0.address, start, 1])) as VestingWallet

      await fir.transfer(vestingWallet.address, parseUnits('250000000'))
      snapshot = await takeSnapshot()
    })
    beforeEach(async () => {
      await snapshot.restore()
    })
    after(async () => {
      await snapshot.restore()
    })

    it('inits', async () => {
      expect(await vestingWallet.beneficiary()).equal(user0.address)
    })

    it('claim', async () => {
      expect(await vestingWallet['releasable(address)'](fir.address)).equal(0)
      await vestingWallet.connect(user0)['release(address)'](fir.address)
      expect(await fir.balanceOf(user0.address)).equal(0)

      await time.setNextBlockTimestamp(start + 1)
      await vestingWallet.connect(user0)['release(address)'](fir.address)
      expect(await fir.balanceOf(user0.address)).equal(parseUnits('250000000'))
    })
  })
})
