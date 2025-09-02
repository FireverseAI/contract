import { parseEther, parseUnits } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { FIR } from '../typechain'

const deployFunction: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log('Running FirVerseStake2 deploy script')
  const { deploy } = deployments

  const { deployer, vboxNFT } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const firToken = (await ethers.getContract('FIR')) as FIR
  const minStakeAmount = parseEther('100')
  
  const { address } = await deploy('FirVerseStake2', {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    skipIfAlreadyDeployed: false,
    // waitConfirmations: 5,
    args: [vboxNFT, firToken.address, minStakeAmount],
  })

  console.log('FirVerseStake2 deployed at ', address)
}

export default deployFunction

deployFunction.dependencies = ["FIR"]

// deployFunction.skip = async () => {
//   return Promise.resolve(true)
// }

deployFunction.tags = ['FirVerseStake2']
