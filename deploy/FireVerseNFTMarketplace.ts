import { parseUnits } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { FIR, FireVerseNFT, FireVerseNFTMarketplace } from '../typechain'
import { sendTxn } from '../utils/helper'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FireVerseNFTMarketplace deploy script')
  const { deploy } = deployments

  const { deployer, ownership, wbnb } = await getNamedAccounts()
  console.log('Deployer:', deployer)
  console.log('ownership:', ownership)

  const { address } = await deploy('FireVerseNFTMarketplace', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    waitConfirmations: 5,
    args: [],
  })

  console.log('FireVerseNFTMarketplace deployed at ', address)

  // const firToken = (await ethers.getContract('FIR')) as FIR
  const nft = (await ethers.getContract('FireVerseNFT')) as FireVerseNFT
  const market = (await ethers.getContract('FireVerseNFTMarketplace')) as FireVerseNFTMarketplace
  await sendTxn(market.allowNFT(nft.address, true), 'allowNFT')
  await sendTxn(market.allowPaymentToken(ethers.constants.AddressZero, true), 'allow payment native token')
  await sendTxn(market.allowPaymentToken(wbnb, true), 'allow WBNB')
  // await sendTxn(market.allowPaymentToken(firToken.address, true), "allow payment FIR token ")

  // await sendTxn(nft.transferOwnership(ownership), 'Nft transferOwnership')
}

export default deployFunction

deployFunction.dependencies = ['FireVerseNFT']

deployFunction.skip = async () => {
  return Promise.resolve(true)
}

deployFunction.tags = ['FireVerseNFTMarketplace']
