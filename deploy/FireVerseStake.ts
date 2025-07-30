import { parseUnits } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { FIR } from '../typechain'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FirVerseStake deploy script')
  const { deploy } = deployments

  const { deployer, vboxNFT } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  // 2025-07-31 00:00:00 UTC0
  const startTimestamp = 1753920000
  const totalReward = parseUnits("3000000")

  const firToken = (await ethers.getContract('FIR')) as FIR
  
  const { address } = await deploy('FirVerseStake', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [vboxNFT, firToken.address, startTimestamp, totalReward],
  })

  console.log('FirVerseStake deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = ["FIR"]

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['FirVerseStake']
