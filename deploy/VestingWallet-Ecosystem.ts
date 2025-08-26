import { parseUnits } from 'ethers/lib/utils'
import { getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running VestingWallet-Ecosystem deploy script')
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  // UTC 2026-03-01 00:00:00
  const start = 1772323200
  console.log('start', start)
  const vestingBeneficiary = '0xdAaB253aaB077743fAAd3De7dA8AF6f8fa80A794'
  console.log('vestingBeneficiary', vestingBeneficiary)

  const { address } = await deploy('VestingWallet-Ecosystem', {
    contract: 'VestingWallet',
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [vestingBeneficiary, start, 1],
  })

  console.log('VestingWallet-Ecosystem deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = []

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['VestingWallet']
