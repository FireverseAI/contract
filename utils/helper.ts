import { BigNumber, BigNumberish, ContractTransaction } from 'ethers'

export const sendTxn = async (txnPromise: any, label: any) => {
  const txn = await txnPromise
  console.info(`Sending ${label} ${txn.hash} ...`)
  await txn.wait()
  console.info(`... Sent! ${txn.hash}`)
  return txn
}

export async function waitTx(tx: ContractTransaction) {
  console.log('Hash =>', tx.hash)
  const txResult = await tx.wait()
  if (txResult.events) {
    txResult.events.forEach((event) => {
      console.log('Event Index =>', event.logIndex)
      console.log('Event Name =>', event.event)
      console.log('Args =>', event.args)
      console.log('Args String =>', event.args?.toString())
      console.log('Topics =>', event.topics)
      console.log('Topics String =>', event.topics?.toString())
      console.log('data =>', BigNumber.from(event.data))
      console.log('data String =>', BigNumber.from(event.data)?.toString())
      console.log('------------------------------------------------------------------------------------------')
    })
  }
}

export function expandDecimals(n: any, decimals: BigNumberish) {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(decimals))
}

export function toUsd(value: number) {
  const normalizedValue = parseInt((value * Math.pow(10, 5)).toString())
  return BigNumber.from(normalizedValue).mul(BigNumber.from(10).pow(25))
}

export const toNormalizedPrice = toUsd
