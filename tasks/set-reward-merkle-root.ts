import { task } from 'hardhat/config'
import { FirVerseStake } from '../typechain'
import { waitTx } from '../utils/helper'

task('set-white-list', 'Set Reward Merkle Root')
  .addParam('day', 'Reward Day')
  .addParam('root', 'Reward Merkle Root')
  .setAction(async function ({ day, root }, { ethers: { getContract }, getNamedAccounts }) {
    const { deployer } = await getNamedAccounts()
    console.log('Deployer:', deployer)

    const staking = (await getContract('FirVerseStake', deployer)) as FirVerseStake
    console.log('FirVerseStake Address:', staking.address)

    console.log('Set Reward Merkle Root...')
    const tx = await staking.setMerkleRoot(day, root)
    await waitTx(tx)
    console.log('Set successfully')
  })
