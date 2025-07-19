import { parseUnits } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { FireVerseNFT } from '../typechain'
import { sendTxn } from '../utils/helper'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FireVerseNFT deploy script')
  const { deploy } = deployments

  const { deployer, ownership, nftMintSigner } = await getNamedAccounts()
  console.log('Deployer:', deployer)
  console.log('ownership:', ownership)
  console.log('nftMintSigner:', nftMintSigner)

  const { address } = await deploy('FireVerseNFT', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    waitConfirmations: 5,
    args: ['FireVerse NFT', 'FireVerseNFT', 100, nftMintSigner],
  })

  console.log('FireVerseNFT deployed at ', address)

    const nft = (await ethers.getContract('FireVerseNFT')) as FireVerseNFT

    await sendTxn(nft.transferOwnership(ownership), 'Nft transferOwnership')
}

export default deployFunction

deployFunction.dependencies = []

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['FireVerseNFT']
