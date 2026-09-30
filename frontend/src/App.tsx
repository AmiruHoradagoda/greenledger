import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseEventLogs, type Address, type Hash } from 'viem'
import { ValidationReport } from './ValidationReport'
import { QRCodeSVG } from 'qrcode.react'
import { abi, address, chain, chainLabel, errorMessage, explorerUrl, ownerAddress, positiveInteger, publicClient, readCertificate, readChainHead, readGenerators, readHistory, readOwnedIds, readPaused, readyContract, recordDomain, recordTypes, verifyLink, type Certificate, type Generator, type HistoryEvent } from './ledger'
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
  const [generators, setGenerators] = useState<Generator[]>([])
  const [paused, setPaused] = useState(false)
  const [draft, setDraft] = useState({ generatorId: '', source: 'Solar', mwh: '1', period: '2026-09', record: '', owner: '' })
  const [signed, setSigned] = useState<{ signature: `0x${string}`; key: string }>()
  const [regName, setRegName] = useState('')
  const [regWallet, setRegWallet] = useState('')
  const [tab, setTab] = useState<'share' | 'audit'>()
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
  const draftGeneratorId = draft.generatorId || generators.find((item) => item.active)?.id.toString() || ''
  const draftGenerator = generators.find((item) => item.id.toString() === draftGeneratorId)
  const draftKey = JSON.stringify([draftGeneratorId, draft.source.trim(), draft.mwh.trim(), draft.period, draft.record.trim()])
  const isDraftGenerator = sameAddress(wallet.account, draftGenerator?.wallet)
  const hasValidSignature = signed?.key.startsWith(draftKey)
  const editDraft = (patch: Partial<typeof draft>) => { setDraft({ ...draft, ...patch }); setSigned(undefined) }

  useEffect(() => {
    let active = true
    async function loadIssuer() {
      try {
        const [result, list, isPaused] = await Promise.all([publicClient.readContract({ address: await readyContract(), abi, functionName: 'issuer' }), readGenerators(), readPaused()])
        if (active) { setIssuer(result); setGenerators(list); setPaused(isPaused); setConnectionError('') }
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

  async function signRecord() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    setNotice({ kind: 'loading', text: 'Generator: sign the record in MetaMask (no gas, no transaction)…' })
    try {
      const contract = await readyContract()
      if (!draftGenerator) throw new Error('Choose a registered generator.')
      if (!draft.source.trim() || !draft.period || !draft.record.trim()) throw new Error('Complete every certificate field before signing.')
      const { wallet: signer, account } = await wallet.signingWallet()
      if (!sameAddress(account, draftGenerator.wallet)) throw new Error(`Switch MetaMask to the generator’s wallet ${draftGenerator.wallet} to sign.`)
      const previousFingerprint = await readChainHead(draftGenerator.id)
      const signature = await signer.signTypedData({ account, domain: recordDomain(contract), types: recordTypes, primaryType: 'GenerationRecord', message: { generatorId: draftGenerator.id, energySource: draft.source.trim(), energyMWh: positiveInteger(draft.mwh.trim(), 'MWh'), generationPeriod: draft.period, generationRecordId: draft.record.trim(), previousFingerprint } })
      setSigned({ signature, key: draftKey + previousFingerprint })
      setNotice({ kind: 'success', text: 'Record signed by the generator. Now switch to the issuer account and issue the certificate.' })
    } catch (error) { setNotice({ kind: 'error', text: errorMessage(error) }) }
    finally { pending.current = false; setBusy(false) }
  }

  async function write(action: 'issue' | 'transfer' | 'retire' | 'revoke' | 'register' | 'pause' | 'unpause') {
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
        const generatorId = BigInt(draftGeneratorId || '0')
        if (!draftGenerator || !draft.source.trim() || !draft.period || !draft.record.trim()) throw new Error('Complete every certificate field, including the generation record ID.')
        const head = await readChainHead(generatorId)
        if (!signed || signed.key !== draftKey + head) throw new Error('The generator’s signature is missing or out of date. Have the generator wallet sign this exact record again.')
        const { request } = await publicClient.simulateContract({ ...base, functionName: 'issueCertificate', args: [generatorId, draft.source.trim(), positiveInteger(draft.mwh.trim(), 'MWh'), draft.period, ownerAddress(draft.owner.trim()), draft.record.trim(), signed.signature] })
        setNotice({ kind: 'loading', text: 'Confirm issuance in MetaMask…' })
        hash = await signer.writeContract(request)
      } else if (action === 'register') {
        if (!regName.trim()) throw new Error('Enter the generator name.')
        const { request } = await publicClient.simulateContract({ ...base, functionName: 'registerGenerator', args: [regName.trim(), ownerAddress(regWallet.trim())] })
        setNotice({ kind: 'loading', text: 'Confirm registration in MetaMask…' })
        hash = await signer.writeContract(request)
      } else if (action === 'pause' || action === 'unpause') {
        const { request } = await publicClient.simulateContract({ ...base, functionName: action })
        setNotice({ kind: 'loading', text: `Confirm ${action} in MetaMask…` })
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
      const done = { register: 'Generator registered.', pause: 'Registry paused.', unpause: 'Registry resumed.', issue: 'Certificate issued successfully.', transfer: 'Certificate transferred successfully.', revoke: 'Certificate revoked successfully.', retire: 'Certificate retired successfully.' }[action]
      setNotice({ kind: 'success', text: done, hash })
      if (action === 'register' || action === 'pause' || action === 'unpause') {
        setGenerators(await readGenerators()); setPaused(await readPaused())
        if (action === 'register') { setRegName(''); setRegWallet('') }
        return
      }
      if (action === 'issue') setSigned(undefined)
      if (selectedId !== undefined) {
        ++readVersion.current
        setReading(false); setReadError(''); setCertificate(undefined); setId(selectedId.toString())
        setCertificate(await readCertificate(selectedId))
        document.getElementById('validate')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        {paused && <div className="notice error" role="alert"><strong>Registry paused.</strong> Issuing, transfers and retirement are disabled until the issuer resumes it.</div>}
        {connectionError && <div className="notice error" role="alert">{connectionError}</div>}
        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><strong>{notice.text}</strong>{notice.hash && <div className="hash">Transaction hash <code>{notice.hash}</code></div>}</div>}
        <nav className="steps" aria-label="Workflow"><a href="#issue"><b>1</b> Issue</a><a href="#validate"><b>2</b> Validate</a><a href="#actions"><b>3</b> Owner actions</a></nav>
        <div className="workspace">
          <section className="panel issuance" id="issue" aria-labelledby="issue-title"><div className="section-heading"><span className="step">01</span><div><h2 id="issue-title">Issue a certificate</h2><p className="muted">Register one external energy generation record.</p></div></div>
            <ol className="flow-steps"><li className={hasValidSignature ? 'done' : 'now'}><b>A</b> Generator signs the record</li><li className={hasValidSignature ? 'now' : ''}><b>B</b> Issuer submits it on-chain</li></ol>
            <form onSubmit={(event) => { event.preventDefault(); void write('issue') }}>
              <fieldset disabled={busy || !correctNetwork || !address}>
                <label>Generator (registered)<select value={draftGeneratorId} onChange={(event) => editDraft({ generatorId: event.target.value })} required>
                  {generators.length === 0 && <option value="">No generators registered yet</option>}
                  {generators.map((item) => <option key={item.id.toString()} value={item.id.toString()} disabled={!item.active}>#{item.id.toString()} · {item.name}{item.active ? '' : ' (inactive)'}</option>)}
                </select><span className="field-hint">{draftGenerator ? <>Signing wallet: <span className="mono">{draftGenerator.wallet}</span></> : 'The issuer registers generators below.'}</span></label>
                <div className="form-grid"><label>Energy source<input value={draft.source} onChange={(event) => editDraft({ source: event.target.value })} required /></label><label>Energy (MWh)<input value={draft.mwh} onChange={(event) => editDraft({ mwh: event.target.value })} inputMode="numeric" pattern="[1-9][0-9]*" required /></label></div>
                <label>Generation period<input type="month" value={draft.period} onChange={(event) => editDraft({ period: event.target.value })} required /></label>
                <label>Generation record ID<input value={draft.record} onChange={(event) => editDraft({ record: event.target.value })} placeholder="HAMBANTOTA-SOLAR-2026-09-002" required /><span className="field-hint">Required and unique. IDs are case-sensitive.</span></label>
                <label>Initial owner address<input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="0x…" required /></label>
              </fieldset>
              <div className="sign-box">
                <p className="access-note">{hasValidSignature ? '✓ Signed by the generator. Signature is bound to these exact values and the current chain position; changing any field requires signing again.' : isDraftGenerator ? 'Generator wallet connected. Review the values, then sign.' : `Step A needs the generator’s wallet (${draftGenerator ? draftGenerator.wallet : 'none selected'}) connected in MetaMask.`}</p>
                <div className="action-row">
                  <button type="button" className="secondary" disabled={busy || !correctNetwork || !isDraftGenerator || !draft.record.trim()} onClick={() => void signRecord()}>A · Sign as generator</button>
                  <button className="issue-button" type="submit" disabled={busy || !correctNetwork || !isIssuer || !hasValidSignature || paused}>B · Issue certificate <span aria-hidden="true">↗</span></button>
                </div>
                <p className="muted">{isIssuer ? 'Issuer account connected.' : 'Step B needs the issuer account.'}{paused ? ' The registry is paused.' : ''}</p>
              </div>
            </form>
            <details className="register-box"><summary>Register a new generator (issuer)</summary>
              <form onSubmit={(event) => { event.preventDefault(); void write('register') }}><fieldset disabled={busy || !correctNetwork || !isIssuer}>
                <label>Generator name<input value={regName} onChange={(event) => setRegName(event.target.value)} placeholder="e.g. Norochcholai Wind Farm" required /></label>
                <label>Generator signing wallet<input value={regWallet} onChange={(event) => setRegWallet(event.target.value)} placeholder="0x…" required /></label>
                <button type="submit" className="secondary">Register generator</button>
              </fieldset></form>
            </details>
            <div className="issuer-info"><span className="eyebrow">CONTRACT ISSUER</span><p className="mono">{issuer ?? 'Waiting for local contract…'}</p></div>
          </section>
          <section className="panel verification" id="validate" aria-labelledby="verify-title">
            <div className="section-heading"><span className="step">02</span><div><h2 id="verify-title">Validate a certificate</h2><p className="muted">Enter only the certificate ID (or scan its QR). The page runs every check against the blockchain. No wallet needed.</p></div></div>
            <form className="lookup" onSubmit={(event) => void verify(event)}><label>Certificate ID<input inputMode="numeric" value={id} onChange={(event) => { setId(event.target.value); setCertificate(undefined); setReadError(''); ++readVersion.current; setReading(false) }} placeholder="e.g. 1" required disabled={busy} /></label><button disabled={reading || busy || !address}>{reading ? 'Validating…' : 'Validate'} <span aria-hidden="true">→</span></button></form>
            {wallet.account && <div className="mine"><p className="eyebrow">MY CERTIFICATES</p>{owned.length === 0 ? <p className="muted">This account owns no certificates.</p> : <div className="chips">{owned.map((ownedId) => <button key={ownedId.toString()} type="button" className="secondary" disabled={busy} onClick={() => { setId(ownedId.toString()); void load(ownedId.toString()) }}>#{ownedId.toString()}</button>)}</div>}</div>}
            {readError && <p className="notice error" role="alert">{readError}</p>}
            {certificate ? <article className="certificate">
              <div className="certificate-top"><p className="eyebrow">CERTIFICATE #{certificate.id.toString()}</p><span className={`badge ${certificate.retired || certificate.revoked ? 'retired' : ''}`}>{certificate.revoked ? 'Revoked' : certificate.retired ? 'Retired' : 'Active'}</span></div>
              <h3>{certificate.generatorName}</h3>
              <div className="energy"><strong>{certificate.energyMWh.toString()}</strong><span>MWh of renewable energy</span></div>
              <dl><div><dt>Energy source</dt><dd>{certificate.energySource}</dd></div><div><dt>Generation period</dt><dd>{certificate.generationPeriod}</dd></div><div className="full"><dt>Generation record ID</dt><dd>{certificate.generationRecordId}</dd></div><div className="full"><dt>Current owner</dt><dd className="mono">{certificate.owner}</dd></div></dl>
              <p className="certificate-note">{certificate.revoked ? 'Revoked by the issuer. This certificate is invalid and cannot be transferred or retired.' : certificate.retired ? 'Retired permanently. This certificate cannot be transferred or retired again.' : 'Active and available for transfer or retirement by its current owner.'}</p>
              <div className="full"><p className="eyebrow">ON-CHAIN FINGERPRINT (keccak256)</p><p className="mono">{certificate.fingerprint}</p></div>
              <ValidationReport certificate={certificate} />
              <div className="panel-tabs" role="tablist" aria-label="Certificate details">
                <button type="button" role="tab" aria-selected={tab === 'share'} className={tab === 'share' ? 'active' : ''} onClick={() => setTab(tab === 'share' ? undefined : 'share')}>Share verification</button>
                <button type="button" role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'active' : ''} onClick={() => setTab(tab === 'audit' ? undefined : 'audit')}>Audit trail{history.length > 0 && <span className="count">{history.length}</span>}</button>
              </div>
              {tab === 'share' && <div className="share"><div><p className="muted">Anyone can scan or open this link to verify, no wallet needed.</p><button type="button" className="secondary" onClick={() => void copyLink()}>{copied ? 'Copied ✓' : 'Copy verify link'}</button></div><QRCodeSVG value={verifyLink(certificate.id)} size={92} /></div>}
              {tab === 'audit' && <div className="history">{history.length === 0 ? <p className="muted">No events found.</p> : <ol>{history.map((event) => <li key={event.hash + event.kind}><span className={`kind ${event.kind.toLowerCase()}`}>{event.kind}</span><span className="mono">{event.detail}</span><span className="mono muted">block {event.block.toString()} · {explorerUrl ? <a href={`${explorerUrl}/tx/${event.hash}`} target="_blank" rel="noreferrer">{event.hash.slice(0, 12)}…</a> : `${event.hash.slice(0, 12)}…`}</span></li>)}</ol>}</div>}
            </article> : <div className="empty-state"><span aria-hidden="true">↗</span><h3>A clear view of every record.</h3><p>Enter an issued certificate ID to see its energy details, current owner, and status.</p></div>}
          </section>
            <section className="panel actions" id="actions"><div className="section-heading"><span className="step">03</span><div><h2>Owner & issuer actions</h2><p className="muted">Applies to the certificate validated in step 2.</p></div></div>
              <p className="muted">{!certificate ? 'Validate a certificate in step 2 to continue.' : certificate.revoked ? 'This certificate was revoked. No further actions are available.' : certificate.retired ? 'This certificate is retired. No further owner actions are available.' : !isOwner ? 'Connect the current owner’s account to transfer or retire.' : 'You own this certificate.'}</p>
              <form onSubmit={(event) => { event.preventDefault(); void write('transfer') }}><fieldset disabled={busy || !correctNetwork || !isOwner || !certificate || certificate.retired || certificate.revoked || paused}><label>New owner address<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" required /></label><div className="action-row"><button type="submit" className="secondary">Transfer certificate</button><button type="button" className="retire-button" onClick={() => { if (window.confirm(`Permanently retire certificate #${certificate?.id}? It cannot be transferred or retired again.`)) void write('retire') }}>Retire permanently</button></div></fieldset></form>
            
            <div className="revoke-box pause-box"><p className="eyebrow">EMERGENCY STOP (ISSUER ONLY)</p><p className="muted">Pause blocks issuing, transfers and retirement if a key or contract issue is suspected. Revoking still works.</p><button type="button" className={paused ? 'secondary' : 'retire-button'} disabled={busy || !correctNetwork || !isIssuer} onClick={() => void write(paused ? 'unpause' : 'pause')}>{paused ? 'Resume registry' : 'Pause registry'}</button></div>
            <div className="revoke-box"><p className="eyebrow">REVOKE (ISSUER ONLY)</p><p className="muted">Invalidate the certificate validated in step 2 if it was issued in error.</p>
              <form onSubmit={(event) => { event.preventDefault(); void write('revoke') }}><fieldset disabled={busy || !correctNetwork || !isIssuer || !certificate || certificate.retired || certificate.revoked}><label>Reason<input value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="e.g. Meter reading error" required /></label><button type="submit" className="retire-button">Revoke certificate</button></fieldset></form></div>
          </section>
        </div>
        <footer><p>GreenLedger <span>·</span> EC8204 Blockchain and Cyber Security</p><p>Local demo. Record IDs prevent reuse; energy measurements are not independently verified.</p><p className="mono">Contract: {address ?? 'Not configured'}</p></footer>
      </main>
    </div>
  )
}
export default App
