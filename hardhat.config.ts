import 'dotenv/config'
import 'hardhat-spdx-license-identifier'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const privateKey = process.env.PRIVATE_KEY
const mnemonic = 'test test test test test test test test test test test junk'
let accounts
if (privateKey) {
  accounts = [privateKey]
} else {
  accounts = {
    mnemonic,
  }
}

const namedAccounts = {
  deployer: {
    hardhat: 0,
    localhost: 0,
    dev_bsc_test: 0,
    bsc_mainnet: ""
  },
  signer: {
    default: 0,
  },
}

export type Signers = { [name in keyof typeof namedAccounts]: SignerWithAddress }

import './tasks'

import { HardhatUserConfig } from 'hardhat/config'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.16',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  namedAccounts,
  networks: {
    hardhat: {
      // forking: {
      //   url: 'https://bsc-dataseed.binance.org/',
      // },
    },
    dev_bsc_test: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
      accounts,
      verify: {
        etherscan: {
          apiKey: process.env.BSC_SCAN_KEY ? process.env.BSC_SCAN_KEY : '',
        },
      },
      gasPrice: 10e9,
    },
    bsc_mainnet: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts,
      verify: {
        etherscan: {
          apiKey: process.env.BSC_SCAN_KEY ? process.env.BSC_SCAN_KEY : '',
        },
      },
    },
    localhost: {
      url: `http://localhost:8545`,
      accounts,
      timeout: 60 * 60 * 1000,
    },
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
  },
}

export default config
