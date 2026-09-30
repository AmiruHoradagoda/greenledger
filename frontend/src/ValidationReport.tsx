import { useEffect, useState } from 'react'
import { errorMessage, validateCertificate, type Certificate, type Validation } from './ledger'

const verdicts = {
  valid: { cls: 'ok', title: '✓ VALID CERTIFICATE', text: 'Every check passed. This is a genuine, unaltered, unused certificate.' },
  retired: { cls: 'warn', title: '● GENUINE BUT ALREADY USED', text: 'Authentic, but the energy has been claimed (retired). It cannot be used again.' },
  revoked: { cls: 'bad', title: '✗ REVOKED', text: 'The issuer withdrew this certificate. Do not accept it.' },
  invalid: { cls: 'bad', title: '✗ INVALID', text: 'At least one integrity check failed. Do not trust this certificate.' },
} as const

const short = (value: string) => (value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value)

export function ValidationReport({ certificate }: { certificate: Certificate }) {
  const [openKey, setOpenKey] = useState<string>()
  const [result, setResult] = useState<{ id: bigint; validation?: Validation; error?: string }>()
  const current = result?.id === certificate.id ? result : undefined

  useEffect(() => {
    let active = true
    validateCertificate(certificate)
      .then((validation) => { if (active) setResult({ id: certificate.id, validation }) })
      .catch((error) => { if (active) setResult({ id: certificate.id, error: errorMessage(error) }) })
    return () => { active = false }
  }, [certificate])

  if (!current) return <div className="validation"><p className="muted">Running validation checks on the blockchain…</p></div>
  if (current.error || !current.validation) return <div className="validation"><p className="error-text">{current.error ?? 'Validation failed.'}</p></div>
  const { checks, chain, gaps, verdict } = current.validation
  const view = verdicts[verdict]
  return (
    <div className="validation">
      <div className={`verdict-banner ${view.cls}`} role="status"><strong>{view.title}</strong><span>{view.text}</span></div>
      <p className="eyebrow">VALIDATION CHECKS · from certificate ID #{certificate.id.toString()} only</p>
      <ol className="checks">
        {checks.map((check) => (
          <li key={check.title} className={`${check.ok ? 'pass' : 'fail'} ${openKey === check.title ? 'open' : ''}`}>
            <button type="button" className="check-row" aria-expanded={openKey === check.title} onClick={() => setOpenKey(openKey === check.title ? undefined : check.title)}>
              <span className="mark" aria-label={check.ok ? 'passed' : 'failed'}>{check.ok ? '✓' : '✗'}</span>
              <strong>{check.title}</strong>
              <span className="check-value mono">{short(check.actual)}</span>
              <span className="info" aria-hidden="true">ⓘ</span>
            </button>
            <div className="tip" role="tooltip">
              <p>{check.what}</p>
              <div className="compare"><span>Expected</span><code>{check.expected}</code><span>Found</span><code>{check.actual}</code></div>
            </div>
          </li>
        ))}
      </ol>
      <div className="chain">
        <p className="eyebrow">PROVENANCE CHAIN · {certificate.generatorName}</p>
        <p className="muted">Each certificate stores the previous one’s fingerprint, like blocks in a blockchain. Hover a box for details.</p>
        <div className="chain-row">
          {chain.map((link, index) => (
            <div key={link.certificate.id.toString()} className="chain-item">
              {index > 0 && <span className={`chain-arrow ${link.linkOk ? '' : 'broken'}`} aria-label={link.linkOk ? 'linked' : 'broken link'}>{link.linkOk ? '→' : '✗'}</span>}
              <div tabIndex={0} className={`chain-node ${link.certificate.id === certificate.id ? 'current' : ''} ${link.hashOk && link.linkOk ? '' : 'broken'}`}>
                <strong>#{link.certificate.id.toString()} · {link.certificate.generationPeriod}</strong>
                {link.certificate.revoked && <span className="tag">revoked</span>}
                <div className="tip" role="tooltip">
                  <div className="compare"><span>Hash</span><code>{link.certificate.fingerprint}</code><span>Previous</span><code>{index === 0 ? 'Genesis (first certificate, all zeros)' : link.certificate.previousFingerprint}</code><span>Status</span><code>{link.hashOk && link.linkOk ? 'Hash and link valid' : 'BROKEN'}</code></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {gaps.length > 0 && <p className="gap-note">⚠ No certificate issued for: {gaps.join(', ')}. The chain is intact but these months are missing.</p>}
      </div>
    </div>
  )
}
