import { parseUnits } from 'ethers/lib/utils'
import { getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running VestingWallet deploy script')
  const { deploy } = deployments

  const { deployer, vestingBeneficiary } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const start = Number(process.env.VESTING_START)
  if (start == 0) {
    throw new Error("start time error")
  }
  console.log('start', start)

  const { address } = await deploy('VestingWallet', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [vestingBeneficiary, start, 1],
  })

  console.log('VestingWallet deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = []

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['VestingWallet']
