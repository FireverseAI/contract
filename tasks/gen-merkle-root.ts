import { keccak256, solidityPack } from 'ethers/lib/utils'
import { MerkleTree } from 'merkletreejs'
import { task } from 'hardhat/config'
import whiteList from './data/whitelist.json'

task('gen-merkle-root', 'Generate WhiteList Merkle Root').setAction(async function (_, { ethers, getNamedAccounts }) {
  const { deployer } = await getNamedAccounts()
  console.log('Deployer:', deployer)

  const leafNodes = whiteList.map((x) => keccak256(solidityPack(['address', 'uint256'], [x.address, x.dailyTotalReward])))
  const tree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })
  const root = tree.getHexRoot()
  console.log('merkleRoot', root)
})
