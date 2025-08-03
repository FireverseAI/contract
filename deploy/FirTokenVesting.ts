import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { FIR } from '../typechain'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FirTokenVesting deploy script')
  const { deploy } = deployments

  const { deployer, vestingBeneficiary } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  // 2025-11-01 00:00:00 UTC
  const start = 1761955200
  console.log('start', start)

  const firToken = (await ethers.getContract('FIR')) as FIR

  const { address } = await deploy('FirTokenVesting', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [firToken.address, vestingBeneficiary, start],
  })

  console.log('FirTokenVesting deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = ['FIR']

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['FirTokenVesting']
