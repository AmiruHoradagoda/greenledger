import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseEventLogs, type Address, type Hash } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { abi, address, chain, chainLabel, errorMessage, explorerUrl, ownerAddress, positiveInteger, publicClient, readCertificate, readHistory, readOwnedIds, readyContract, verifyLink, type Certificate, type HistoryEvent } from './ledger'
import { useWallet } from './useWallet'
import './App.css'

type Notice = { kind: 'success' | 'error' | 'loading'; text: string; hash?: Hash }
const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function App() {
  const wallet = useWallet()
  const [issuer, setIssuer] = useState<Address>()
  const [connectionError, setConnectionError] = useState('')
  const [id, setId] = useState(() => { const q = new URLSearchParams(window.location.search).get('id'); return q && /^[1-9]\d*$/.test(q) ? q : '1' })
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [owned, setOwned] = useState<bigint[]>([])
  const [copied, setCopied] = useState(false)
  const [certificate, setCertificate] = useState<Certificate>()
  const [readError, setReadError] = useState('')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  const [recipient, setRecipient] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const readVersion = useRef(0)
  const pending = useRef(false)
  const correctNetwork = wallet.chainId === chain.id
  const isIssuer = sameAddress(wallet.account, issuer)
  const isOwner = sameAddress(wallet.account, certificate?.owner)

  useEffect(() => {
    let active = true
    async function loadIssuer() {
      try {
        const result = await publicClient.readContract({ address: await readyContract(), abi, functionName: 'issuer' })
        if (active) { setIssuer(result); setConnectionError('') }
      } catch (error) { if (active) { setIssuer(undefined); setConnectionError(errorMessage(error)) } }
    }
    void loadIssuer()
    const timer = window.setInterval(() => void loadIssuer(), 10_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  async function load(rawId: string) {
    const version = ++readVersion.current
    setReading(true); setReadError(''); setCertificate(undefined); setHistory([])
    try {
      const certId = positiveInteger(rawId.trim(), 'Certificate ID')
      const result = await readCertificate(certId)
      const events = await readHistory(certId).catch(() => [])
      if (version === readVersion.current) { setCertificate(result); setHistory(events); window.history.replaceState(null, '', `?id=${certId}`) }
    } catch (error) { if (version === readVersion.current) setReadError(errorMessage(error)) }
    finally { if (version === readVersion.current) setReading(false) }
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void load(id)
  }

  // A shared link (?id=N) verifies automatically, with no wallet needed.
  useEffect(() => {
    if (address && new URLSearchParams(window.location.search).has("id")) void Promise.resolve().then(() => load(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    if (wallet.account && address) readOwnedIds(wallet.account).then((ids) => { if (active) setOwned(ids) }).catch(() => undefined)
    return () => { active = false }
  }, [wallet.account, certificate])

  async function copyLink() {
    if (!certificate) return
    try { await navigator.clipboard.writeText(verifyLink(certificate.id)); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
  }

  async function walletAction(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true; setBusy(true)
    setNotice({ kind: 'loading', text: 'Continue in MetaMask…' })
    try { await action(); setNotice({ kind: 'success', text: 'Wallet connected. Use Hardhat Local to send transactions.' }) }
    catch (error) { setNotice({ kind: 'error', text: errorMessage(error) }) }
    finally { pending.current = false; setBusy(false) }
  }

  async function write(action: 'issue' | 'transfer' | 'retire' | 'revoke', form?: FormData) {
    if (pending.current) return
    pending.current = true; setBusy(true)
    let hash: Hash | undefined
    let confirmed = false
    setNotice({ kind: 'loading', text: 'Checking transaction…' })
    try {
      const contract = await readyContract()
      const { wallet: signer, account } = await wallet.signingWallet()
      let selectedId = certificate?.id
      const base = { address: contract, abi, account }
      if (action === 'issue') {
        const field = (key: string) => String(form?.get(key) ?? '').trim()
        if (!field('generator') || !field('source') || !field('period') || !field('record')) throw new Error('Complete every certificate field, including the generation record ID.')
        const { request } = await publicClient.simulateContract({ ...base, functionName: 'issueCertificate', args: [field('generator'), field('source'), positiveInteger(field('mwh'), 'MWh'), field('period'), ownerAddress(field('owner')), field('record')] })
        setNotice({ kind: 'loading', text: 'Confirm issuance in MetaMask…' })
        hash = await signer.writeContract(request)
      } else {
        if (selectedId === undefined) throw new Error('Verify a certificate first.')
        if (action === 'transfer') {
          const { request } = await publicClient.simulateContract({ ...base, functionName: 'transferCertificate', args: [selectedId, ownerAddress(recipient.trim())] })
          setNotice({ kind: 'loading', text: 'Confirm transfer in MetaMask…' })
          hash = await signer.writeContract(request)
        } else if (action === 'revoke') {
          const reason = revokeReason.trim()
          if (!reason) throw new Error('Enter a reason for revoking this certificate.')
          const { request } = await publicClient.simulateContract({ ...base, functionName: 'revokeCertificate', args: [selectedId, reason] })
          setNotice({ kind: 'loading', text: 'Confirm revocation in MetaMask…' })
          hash = await signer.writeContract(request)
        } else {
          const { request } = await publicClient.simulateContract({ ...base, functionName: 'retireCertificate', args: [selectedId] })
          setNotice({ kind: 'loading', text: 'Confirm retirement in MetaMask…' })
          hash = await signer.writeContract(request)
        }
      }
      setNotice({ kind: 'loading', text: 'Transaction submitted. Waiting for confirmation…', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
      if (receipt.status !== 'success') throw new Error('The transaction reverted on-chain. No certificate change was applied.')
      confirmed = true
      if (action === 'issue') {
        const [event] = parseEventLogs({ abi, logs: receipt.logs.filter((log) => sameAddress(log.address, contract)), eventName: 'CertificateIssued' })
        selectedId = event?.args.certificateId
      }
      setNotice({ kind: 'success', text: `Certificate ${action === 'issue' ? 'issued' : action === 'transfer' ? 'transferred' : action === 'revoke' ? 'revoked' : 'retired'} successfully.`, hash })
      if (selectedId !== undefined) {
        ++readVersion.current
        setReading(false); setReadError(''); setCertificate(undefined); setId(selectedId.toString())
        setCertificate(await readCertificate(selectedId))
        setHistory(await readHistory(selectedId).catch(() => []))
      }
    } catch (error) {
      setNotice({ kind: confirmed ? 'success' : 'error', text: confirmed ? `Transaction confirmed, but the certificate could not refresh: ${errorMessage(error)}` : `${errorMessage(error)}${hash ? ' A transaction was submitted; check its receipt before retrying.' : ''}`, hash })
    } finally { pending.current = false; setBusy(false) }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark" aria-hidden="true">G</span>GreenLedger</a>
        <span className="network-label"><span className="dot" /> {chainLabel} · {chain.id}</span>
      </header>
      <main>
        <section className="intro">
          <div><p className="eyebrow">RENEWABLE ENERGY CERTIFICATES</p><h1>Energy recorded.<br /><span>Ownership made clear.</span></h1><p className="lede">Verify a certificate, follow its ownership, and retire it after use. One record. One certificate.</p></div>
          <aside className="wallet-card"><p className="eyebrow">YOUR WALLET</p>
            <p className="wallet-address">{wallet.account ?? 'No wallet connected'}</p>
            <p className="muted">{wallet.account ? (isIssuer ? 'Issuer account' : 'Connected account') : 'Verification is public. Connect to issue, transfer, or retire.'}</p>
            <button disabled={busy} onClick={() => void walletAction(wallet.account && !correctNetwork ? wallet.switchNetwork : wallet.connect)}>{wallet.account && !correctNetwork ? `Switch to ${chainLabel}` : wallet.account ? 'Reconnect MetaMask' : 'Connect MetaMask'} <span aria-hidden="true">↗</span></button>
            {wallet.account && !correctNetwork && <p className="error-text" role="alert">Wrong network: select {chainLabel} ({chain.id}). Writes are disabled.</p>}
          </aside>
        </section>
        {connectionError && <div className="notice error" role="alert">{connectionError}</div>}
        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><strong>{notice.text}</strong>{notice.hash && <div className="hash">Transaction hash <code>{notice.hash}</code></div>}</div>}
        <div className="workspace">
          <section className="panel verification" aria-labelledby="verify-title">
            <div className="section-heading"><span className="step">01</span><div><h2 id="verify-title">Verify a certificate</h2><p className="muted">Read directly from the blockchain. No wallet needed.</p></div></div>
            <form className="lookup" onSubmit={(event) => void verify(event)}><label>Certificate ID<input inputMode="numeric" value={id} onChange={(event) => { setId(event.target.value); setCertificate(undefined); setReadError(''); ++readVersion.current; setReading(false) }} placeholder="e.g. 1" required disabled={busy} /></label><button disabled={reading || busy || !address}>{reading ? 'Reading…' : 'Verify'} <span aria-hidden="true">→</span></button></form>
            {readError && <p className="notice error" role="alert">{readError}</p>}
            {certificate ? <article className="certificate">
              <div className="certificate-top"><p className="eyebrow">CERTIFICATE #{certificate.id.toString()}</p><span className={`badge ${certificate.retired || certificate.revoked ? 'retired' : ''}`}>{certificate.revoked ? 'Revoked' : certificate.retired ? 'Retired' : 'Active'}</span></div>
              <h3>{certificate.generatorName}</h3>
              <div className="energy"><strong>{certificate.energyMWh.toString()}</strong><span>MWh of renewable energy</span></div>
              <dl><div><dt>Energy source</dt><dd>{certificate.energySource}</dd></div><div><dt>Generation period</dt><dd>{certificate.generationPeriod}</dd></div><div className="full"><dt>Generation record ID</dt><dd>{certificate.generationRecordId}</dd></div><div className="full"><dt>Current owner</dt><dd className="mono">{certificate.owner}</dd></div></dl>
              <p className="certificate-note">{certificate.revoked ? 'Revoked by the issuer. This certificate is invalid and cannot be transferred or retired.' : certificate.retired ? 'Retired permanently. This certificate cannot be transferred or retired again.' : 'Active and available for transfer or retirement by its current owner.'}</p>
              <div className="share"><div><p className="eyebrow">SHARE VERIFICATION</p><p className="muted">Anyone can scan or open this link to verify, no wallet needed.</p><button type="button" className="secondary" onClick={() => void copyLink()}>{copied ? 'Copied ✓' : 'Copy verify link'}</button></div><QRCodeSVG value={verifyLink(certificate.id)} size={92} /></div>
              <div className="history"><p className="eyebrow">AUDIT TRAIL</p>{history.length === 0 ? <p className="muted">No events found.</p> : <ol>{history.map((event) => <li key={event.hash + event.kind}><span className={`kind ${event.kind.toLowerCase()}`}>{event.kind}</span><span className="mono">{event.detail}</span><span className="mono muted">block {event.block.toString()} · {explorerUrl ? <a href={`${explorerUrl}/tx/${event.hash}`} target="_blank" rel="noreferrer">{event.hash.slice(0, 12)}…</a> : `${event.hash.slice(0, 12)}…`}</span></li>)}</ol>}</div>
            </article> : <div className="empty-state"><span aria-hidden="true">↗</span><h3>A clear view of every record.</h3><p>Enter an issued certificate ID to see its energy details, current owner, and status.</p></div>}
            <div className="owner-section"><div className="section-heading"><span className="step">03</span><div><h2>Owner actions</h2><p className="muted">Applies to the certificate displayed above.</p></div></div>
              <p className="muted">{!certificate ? 'Verify a certificate to continue.' : certificate.revoked ? 'This certificate was revoked. No further actions are available.' : certificate.retired ? 'This certificate is retired. No further owner actions are available.' : !isOwner ? 'Connect the current owner’s account to transfer or retire.' : 'You own this certificate.'}</p>
              <form onSubmit={(event) => { event.preventDefault(); void write('transfer') }}><fieldset disabled={busy || !correctNetwork || !isOwner || !certificate || certificate.retired || certificate.revoked}><label>New owner address<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" required /></label><div className="action-row"><button type="submit" className="secondary">Transfer certificate</button><button type="button" className="retire-button" onClick={() => { if (window.confirm(`Permanently retire certificate #${certificate?.id}? It cannot be transferred or retired again.`)) void write('retire') }}>Retire permanently</button></div></fieldset></form>
            </div>
          </section>
          <section className="panel issuance" aria-labelledby="issue-title"><div className="section-heading"><span className="step">02</span><div><h2 id="issue-title">Issue a certificate</h2><p className="muted">Register one external energy generation record.</p></div></div>
            <p className="access-note">{isIssuer ? 'Issuer account connected.' : 'Only the contract issuer can issue certificates.'}</p>
            <form onSubmit={(event) => { event.preventDefault(); void write('issue', new FormData(event.currentTarget)) }}>
              <fieldset disabled={busy || !correctNetwork || !isIssuer || !address}>
                <label>Generator name<input name="generator" defaultValue="Hambantota Solar Farm" required /></label>
                <div className="form-grid"><label>Energy source<input name="source" defaultValue="Solar" required /></label><label>Energy (MWh)<input name="mwh" defaultValue="1" inputMode="numeric" pattern="[1-9][0-9]*" required /></label></div>
                <label>Generation period<input name="period" type="month" defaultValue="2026-09" required /></label>
                <label>Generation record ID<input name="record" placeholder="HAMBANTOTA-SOLAR-2026-09-002" required /><span className="field-hint">Required and unique. IDs are case-sensitive.</span></label>
                <label>Initial owner address<input name="owner" placeholder="0x…" required /></label>
                <button className="issue-button" type="submit">Issue certificate <span aria-hidden="true">↗</span></button>
              </fieldset>
            </form>
            <div className="revoke-box"><p className="eyebrow">REVOKE (ISSUER ONLY)</p><p className="muted">Invalidate the certificate shown on the left if it was issued in error.</p>
              <form onSubmit={(event) => { event.preventDefault(); void write('revoke') }}><fieldset disabled={busy || !correctNetwork || !isIssuer || !certificate || certificate.retired || certificate.revoked}><label>Reason<input value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="e.g. Meter reading error" required /></label><button type="submit" className="retire-button">Revoke certificate</button></fieldset></form></div>
            {wallet.account && <div className="mine"><p className="eyebrow">MY CERTIFICATES</p>{owned.length === 0 ? <p className="muted">This account owns no certificates.</p> : <div className="chips">{owned.map((ownedId) => <button key={ownedId.toString()} type="button" className="secondary" disabled={busy} onClick={() => { setId(ownedId.toString()); void load(ownedId.toString()) }}>#{ownedId.toString()}</button>)}</div>}</div>}
            <div className="issuer-info"><span className="eyebrow">CONTRACT ISSUER</span><p className="mono">{issuer ?? 'Waiting for local contract…'}</p></div>
          </section>
        </div>
        <footer><p>GreenLedger <span>·</span> EC8204 Blockchain and Cyber Security</p><p>Local demo. Record IDs prevent reuse; energy measurements are not independently verified.</p><p className="mono">Contract: {address ?? 'Not configured'}</p></footer>
      </main>
    </div>
  )
}
export default App
