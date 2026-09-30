import { BaseError, getAddress, encodeAbiParameters, keccak256, type Address, type Hash, ContractFunctionRevertedError, createPublicClient, http, isAddress, zeroAddress } from 'viem'
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

export type HistoryEvent = { kind: 'Issued' | 'Transferred' | 'Retired' | 'Revoked'; id: bigint; block: bigint; hash: Hash; detail: string; actor?: Address; from?: Address; recordId?: string; generator?: string }

export async function ledgerLogs() {
  const contract = await readyContract()
  const [issued, transferred, retired, revoked] = await Promise.all([
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateIssued', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateTransferred', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateRetired', fromBlock: deployBlock }),
    publicClient.getContractEvents({ address: contract, abi, eventName: 'CertificateRevoked', fromBlock: deployBlock }),
  ])
  const events: HistoryEvent[] = [
    ...issued.map((l) => ({ kind: 'Issued' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.owner, recordId: l.args.generationRecordId, generator: l.args.generatorName, detail: `Issued to ${l.args.owner} · ${l.args.energyMWh} MWh` })),
    ...transferred.map((l) => ({ kind: 'Transferred' as const, id: l.args.certificateId!, block: l.blockNumber, hash: l.transactionHash, actor: l.args.to, from: l.args.from, detail: `${l.args.from} → ${l.args.to}` })),
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

export const ZERO_HASH = `0x${'0'.repeat(64)}` as const

// Must match GreenLedger.computeFingerprint: keccak256(abi.encode(details, previousFingerprint)).
export function fingerprintOf(c: Pick<Certificate, 'generatorName' | 'energySource' | 'energyMWh' | 'generationPeriod' | 'generationRecordId' | 'previousFingerprint'>) {
  return keccak256(encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'uint256' }, { type: 'string' }, { type: 'string' }, { type: 'bytes32' }],
    [c.generatorName, c.energySource, c.energyMWh, c.generationPeriod, c.generationRecordId, c.previousFingerprint],
  ))
}

export type ChainLink = { certificate: Certificate; hashOk: boolean; linkOk: boolean }
export type Check = { title: string; what: string; expected: string; actual: string; ok: boolean }
export type Validation = { checks: Check[]; chain: ChainLink[]; gaps: string[]; verdict: 'valid' | 'retired' | 'revoked' | 'invalid' }

// Automated validation from a certificate ID alone: every check reads the chain, nothing is typed in by hand.
export async function validateCertificate(certificate: Certificate): Promise<Validation> {
  const contract = await readyContract()
  const events = await ledgerLogs()
  const mine = events.filter((event) => event.id === certificate.id)
  const issue = mine.find((event) => event.kind === 'Issued')
  const checks: Check[] = []

  // 1. Integrity: rebuild the fingerprint from the stored fields and compare with the fingerprint fixed at issuance.
  const recomputed = fingerprintOf(certificate)
  const onChainOk = await publicClient.readContract({ address: contract, abi, functionName: 'verifyFingerprint', args: [certificate.id, recomputed] })
  checks.push({ title: 'Details are unaltered', what: 'Hash the certificate fields now (generator, source, MWh, period, record ID, previous link) and compare with the fingerprint stored when it was issued.', expected: certificate.fingerprint, actual: recomputed, ok: onChainOk && recomputed === certificate.fingerprint })

  // 2. Issued by the authorised issuer at that time.
  const rotations = (await publicClient.getContractEvents({ address: contract, abi, eventName: 'IssuerTransferred', fromBlock: deployBlock }))
  const currentIssuer = await publicClient.readContract({ address: contract, abi, functionName: 'issuer' })
  let sender: Address | undefined
  let issuerAtTime: Address = rotations[0]?.args.previousIssuer ?? currentIssuer
  if (issue) {
    sender = getAddress((await publicClient.getTransaction({ hash: issue.hash })).from)
    for (const rotation of rotations) if (rotation.blockNumber <= issue.block) issuerAtTime = rotation.args.newIssuer!
  }
  checks.push({ title: 'Issued by the authorised issuer', what: 'The account that sent the issuing transaction must be the registry issuer at that block.', expected: issuerAtTime, actual: sender ?? 'No issuing transaction found', ok: !!sender && sender.toLowerCase() === issuerAtTime.toLowerCase() })

  // 3. Record ID used only once (no double counting).
  const sameRecord = events.filter((event) => event.kind === 'Issued' && event.recordId === certificate.generationRecordId).length
  checks.push({ title: 'Energy record counted once', what: `Count certificates ever issued for generation record “${certificate.generationRecordId}”.`, expected: '1 certificate', actual: `${sameRecord} certificate${sameRecord === 1 ? '' : 's'}`, ok: sameRecord === 1 })

  // 4. Ownership chain: replay issue + transfers and compare with the current owner.
  let replayed = issue?.actor
  for (const event of mine) if (event.kind === 'Transferred') replayed = event.actor
  const transfers = mine.filter((event) => event.kind === 'Transferred').length
  checks.push({ title: 'Ownership trail is consistent', what: `Replay the issue and ${transfers} transfer${transfers === 1 ? '' : 's'} and compare with the current owner.`, expected: certificate.owner, actual: replayed ?? 'No issue event found', ok: !!replayed && replayed.toLowerCase() === certificate.owner.toLowerCase() })

  // 5. Provenance chain: every certificate of this generator links to the previous one's fingerprint.
  const chainIds = events.filter((event) => event.kind === 'Issued' && event.generator === certificate.generatorName).map((event) => event.id)
  const chainCerts = await Promise.all(chainIds.map((chainId) => readCertificate(chainId)))
  const chain: ChainLink[] = chainCerts.map((item, index) => ({
    certificate: item,
    hashOk: fingerprintOf(item) === item.fingerprint,
    linkOk: item.previousFingerprint === (index === 0 ? ZERO_HASH : chainCerts[index - 1].fingerprint),
  }))
  const brokenAt = chain.find((link) => !link.hashOk || !link.linkOk)
  checks.push({ title: 'Provenance chain is unbroken', what: `Re-hash all ${chain.length} certificate${chain.length === 1 ? '' : 's'} of “${certificate.generatorName}” and confirm each one points to the fingerprint of the one before it. No record can be inserted, removed or edited without breaking every later link.`, expected: `${chain.length} of ${chain.length} links valid`, actual: brokenAt ? `Broken at certificate #${brokenAt.certificate.id} (${!brokenAt.hashOk ? 'hash mismatch' : 'wrong previous link'})` : `${chain.length} of ${chain.length} links valid`, ok: !brokenAt })

  // Informational: missing months between consecutive periods (YYYY-MM).
  const months = chain.map((link) => link.certificate.generationPeriod).filter((period) => /^\d{4}-\d{2}$/.test(period)).map((period) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1).sort((a, b) => a - b)
  const gaps: string[] = []
  for (let i = 1; i < months.length; i++) for (let m = months[i - 1] + 1; m < months[i]; m++) gaps.push(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`)

  // 6. Status.
  const status = certificate.revoked ? 'Revoked' : certificate.retired ? 'Retired' : 'Active'
  checks.push({ title: 'Not revoked or already used', what: 'A valid certificate is neither revoked by the issuer nor retired (already claimed).', expected: 'Active', actual: status, ok: status === 'Active' })

  const integrity = checks.slice(0, 5).every((check) => check.ok)
  const verdict = !integrity ? 'invalid' : certificate.revoked ? 'revoked' : certificate.retired ? 'retired' : 'valid'
  return { checks, chain, gaps, verdict }
}
