import { parseUnits } from 'ethers/lib/utils'
import { getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running Test Vbox NFT deploy script')
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const { address } = await deploy('TestERC721', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: ['VBox', 'VBOX'],
  })

  console.log('VboxNFT deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.skip = async () => {
  return Promise.resolve(true)
}

deployFunction.tags = ['VboxNFT']
