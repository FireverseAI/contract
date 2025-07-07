import { parseUnits } from 'ethers/lib/utils'
import { getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running WBNB deploy script')
  const { deploy } = deployments

  const { deployer, tokenHolder } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const { address } = await deploy('WBNB', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [],
  })

  console.log('WBNB deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = []

deployFunction.skip = async () => {
  return Promise.resolve(true)
}

deployFunction.tags = ['WBNB']
