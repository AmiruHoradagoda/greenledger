import { BaseError, type Address, type Hash, ContractFunctionRevertedError, createPublicClient, http, isAddress, zeroAddress } from 'viem'
import { hardhat, sepolia } from 'viem/chains'
import { greenLedgerAbi } from './greenLedgerAbi'

// VITE_NETWORK=sepolia targets the public testnet; anything else uses the local Hardhat node.
const useSepolia = import.meta.env.VITE_NETWORK === 'sepolia'
export const chain = useSepolia ? sepolia : hardhat
export const chainLabel = useSepolia ? 'Sepolia testnet' : 'Hardhat Local'
export const rpcUrl = import.meta.env.VITE_RPC_URL?.trim() || (useSepolia ? sepolia.rpcUrls.default.http[0] : 'http://127.0.0.1:8545')
export const explorerUrl = useSepolia ? 'https://sepolia.etherscan.io' : undefined
const deployBlock = /^\d+$/.test(import.meta.env.VITE_DEPLOY_BLOCK ?? '') ? BigInt(import.meta.env.VITE_DEPLOY_BLOCK) : 0n
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
  if (await publicClient.getChainId() !== chain.id) throw new Error(`The RPC must use chain ID ${chain.id} (${chainLabel}).`)
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

export type HistoryEvent = { kind: 'Issued' | 'Transferred' | 'Retired' | 'Revoked'; id: bigint; block: bigint; hash: Hash; detail: string; actor?: Address }

async function ledgerLogs() {
  const contract = await readyContract()
  const [issued, transferred, retired, revoked] = await Promise.all([
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateIssued', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateTransferred', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateRetired', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateRevoked', fromBlock: deployBlock }),
  ])
  const events: HistoryEvent[] = [
    ...issued.map((l) => ({ kind: 'Issued' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.owner, detail: `Issued to ${l.args.owner} · ${l.args.energyMWh} MWh` })),
    ...transferred.map((l) => ({ kind: 'Transferred' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.to, detail: `${l.args.from} → ${l.args.to}` })),
    ...retired.map((l) => ({ kind: 'Retired' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.owner, detail: `Retired by ${l.args.owner}` })),
    ...revoked.map((l) => ({ kind: 'Revoked' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.revokedBy, detail: `Revoked by issuer: ${l.args.reason}` })),
  ]
  return events.sort((a, b) => (a.block === b.block ? 0 : a.block < b.block ? -1 : 1))
}

export async function readHistory(id: bigint) {
  return (await ledgerLogs()).filter((event) => event.id === id)
}

// Replays the event log to find certificates currently owned by an account.
export async function readOwnedIds(account: Address) {
  const owners = new Map<bigint, string>()
  for (const event of await ledgerLogs()) if (event.kind === 'Issued' || event.kind === 'Transferred') owners.set(event.id, event.actor!.toLowerCase())
  return [...owners].filter(([, owner]) => owner === account.toLowerCase()).map(([id]) => id).sort((a, b) => (a < b ? -1 : 1))
}

export function verifyLink(id: bigint) {
  return `${window.location.origin}${window.location.pathname}?id=${id}`
}
