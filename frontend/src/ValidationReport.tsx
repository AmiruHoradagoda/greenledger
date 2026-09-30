import { useEffect, useState } from 'react'
import { errorMessage, validateCertificate, type Certificate, type Validation } from './ledger'

const verdicts = {
  valid: { cls: 'ok', title: '✓ VALID CERTIFICATE', text: 'Every check passed. This is a genuine, unaltered, unused certificate.' },
  retired: { cls: 'warn', title: '● GENUINE BUT ALREADY USED', text: 'Authentic, but the energy has been claimed (retired). It cannot be used again.' },
  revoked: { cls: 'bad', title: '✗ REVOKED', text: 'The issuer withdrew this certificate. Do not accept it.' },
  invalid: { cls: 'bad', title: '✗ INVALID', text: 'At least one integrity check failed. Do not trust this certificate.' },
} as const

export function ValidationReport({ certificate }: { certificate: Certificate }) {
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
  const { checks, verdict } = current.validation
  const view = verdicts[verdict]
  return (
    <div className="validation">
      <div className={`verdict-banner ${view.cls}`} role="status"><strong>{view.title}</strong><span>{view.text}</span></div>
      <p className="eyebrow">VALIDATION CHECKS · from certificate ID #{certificate.id.toString()} only</p>
      <ol className="checks">
        {checks.map((check) => (
          <li key={check.title} className={check.ok ? 'pass' : 'fail'}>
            <span className="mark" aria-label={check.ok ? 'passed' : 'failed'}>{check.ok ? '✓' : '✗'}</span>
            <div>
              <strong>{check.title}</strong>
              <p className="muted">{check.what}</p>
              <div className="compare"><span>Expected</span><code>{check.expected}</code><span>Found</span><code>{check.actual}</code></div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
