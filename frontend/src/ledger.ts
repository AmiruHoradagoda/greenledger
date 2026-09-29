import { BaseError, ContractFunctionRevertedError, createPublicClient, http, isAddress, zeroAddress } from 'viem'
import { hardhat } from 'viem/chains'
import { greenLedgerAbi } from './greenLedgerAbi'

export const chain = hardhat
export const rpcUrl = 'http://127.0.0.1:8545'
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 10_000, retryCount: 0 }) })
export const abi = greenLedgerAbi
const configuredAddress = import.meta.env.VITE_GREENLEDGER_ADDRESS?.trim() ?? ''
export const address = isAddress(configuredAddress) && configuredAddress !== zeroAddress ? configuredAddress : undefined

export function positiveInteger(value: string, label: string) {
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error(`${label} must be a positive whole number within uint256 range.`)
  return BigInt(value)
}

export function ownerAddress(value: string) {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error('Enter a valid, non-zero Ethereum owner address.')
  return value
}

export async function readyContract() {
  if (!address) throw new Error('Set VITE_GREENLEDGER_ADDRESS in frontend/.env.local and restart Vite.')
  if (await publicClient.getChainId() !== chain.id) throw new Error('The local RPC must use Hardhat chain ID 31337.')
  const code = await publicClient.getCode({ address })
  if (!code || code === '0x') throw new Error('No contract at the configured address. Deploy GreenLedger and update .env.local.')
  return address
}

export async function readCertificate(id: bigint) {
  return publicClient.readContract({ address: await readyContract(), abi, functionName: 'getCertificate', args: [id] })
}
export type Certificate = Awaited<ReturnType<typeof readCertificate>>

export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) return `Contract rejected: ${reverted.reason || reverted.shortMessage}`
    if (/rejected|denied/i.test(error.message)) return 'Request cancelled in MetaMask. No new transaction was confirmed.'
    if (/fetch|HTTP request|connect|timeout/i.test(error.message)) return 'Cannot reach the local node. Start Hardhat at http://127.0.0.1:8545 and retry.'
    return error.shortMessage
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 4001) return 'Request cancelled in MetaMask.'
  return error instanceof Error ? error.message : 'The request failed. Check MetaMask and the local node, then retry.'
}
