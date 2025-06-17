import { parseUnits } from 'ethers/lib/utils'
import { getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FireVerseNFT deploy script')
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const { address } = await deploy('FireVerseNFT', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    waitConfirmations: 5,
    args: ['FireVerse NFT', 'FireVerseNFT', 100],
  })

  console.log('FireVerseNFT deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = []

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['FireVerseNFT']
