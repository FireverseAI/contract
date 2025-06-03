import { task } from 'hardhat/config'
import { Wallet } from 'ethers'

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('gen-account', 'Gen Account', async (_, { ethers }) => {
  const deployer = await ethers.getNamedSigner('deployer')
  console.log('deployer.address', deployer.address)
  const provider = ethers.provider
  const wallet = Wallet.createRandom()
  console.log('privateKey', wallet.privateKey)
  console.log('Account', wallet.address)
})
