import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'
import { Icon, Modal, PageHeader, Section } from '../components/ui'

function maskKey(key: string): string {
  if (!key || key.length < 4) return key
  const parts = key.split('-')
  if (parts.length === 4) {
    return `${parts[0]}-${parts[1]}-XXXX-${parts[3]}`
  }
  return key.slice(0, 4) + '-XXXX-XXXX-' + key.slice(-4)
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm" style={{ borderTop: '1px solid var(--color-navy-border)' }}>
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className="truncate" style={{ color: 'var(--color-text)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 13 : undefined }}>
        {value}
      </span>
    </div>
  )
}

export default function Settings() {
  const { licenceKey, removeLicence } = useApp()
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [fingerprint, setFingerprint] = useState('')
  const [copied, setCopied] = useState(false)

  // Remove licence confirmation modal state
  const [showConfirm, setShowConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => {
    async function load() {
      if (!window.electronAPI) return
      const v = await window.electronAPI.getAppVersion()
      setAppVersion(v)
      const fp = await window.electronAPI.getMachineFingerprint()
      setFingerprint(fp)
    }
    load()
  }, [])

  function copyFingerprint() {
    navigator.clipboard.writeText(fingerprint).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleRemoveLicence() {
    setRemoving(true)
    setRemoveError('')
    const res = await removeLicence()
    if (!res.success) {
      setRemoveError(res.error ?? 'Failed to remove licence.')
      setRemoving(false)
    }
    // On success, AppContext sets licenceState to 'unlicensed' which
    // unmounts this page and shows the activation screen automatically
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-8 py-8 fade-up">
        <PageHeader title="Settings" subtitle="Your licence, this computer, and where to get help." />

        {/* Licence */}
        <Section title="Licence">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="eyebrow m-0 mb-1.5">Licence key</p>
                <p className="m-0 text-base" style={{ color: 'var(--color-lime)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
                  {licenceKey ? maskKey(licenceKey) : '—'}
                </p>
              </div>
              <span className="pill pill-lime"><Icon name="check" size={11} /> Active</span>
            </div>
            <p className="text-sm m-0 mb-4 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Each key works on one computer at a time. To move to a new computer, remove the licence here first, then activate on the other one.
            </p>
            <div className="pt-4" style={{ borderTop: '1px solid var(--color-navy-border)' }}>
              <button
                onClick={() => { setShowConfirm(true); setRemoveError('') }}
                className="btn btn-danger btn-sm"
              >
                Remove licence from this computer
              </button>
            </div>
          </div>
        </Section>

        {/* This computer */}
        <Section title="This computer">
          <div className="card p-5">
            <p className="eyebrow m-0 mb-2">Machine fingerprint</p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 truncate text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--color-navy)', border: '1px solid var(--color-navy-border)', color: 'var(--color-text-soft)', fontFamily: 'var(--font-mono)' }}
                title={fingerprint}
              >
                {fingerprint || 'Loading…'}
              </code>
              <button onClick={copyFingerprint} className="btn btn-secondary btn-sm shrink-0" disabled={!fingerprint}>
                <Icon name={copied ? 'check' : 'copy'} size={13} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs m-0 mt-3 leading-relaxed" style={{ color: 'var(--color-faint)' }}>
              This identifier ties your licence to this computer. It is generated from your hardware and only ever sent alongside your key.
            </p>
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="card p-5">
            <div className="flex items-center gap-4 mb-3">
              <img src="./logo.png" alt="" className="w-11 h-11 object-contain" draggable={false} />
              <div>
                <p className="m-0 font-bold text-base" style={{ fontFamily: 'var(--font)', color: 'var(--color-lime)' }}>
                  MTG Manager
                </p>
                <p className="m-0 text-xs" style={{ color: 'var(--color-muted)' }}>
                  Companion app for the MTG MIDI Harmonizer
                </p>
              </div>
            </div>
            <Row label="Version" value={`v${appVersion}`} mono />
            <Row label="Device" value="Adafruit MacroPad RP2040" />
            <Row label="Licence server" value="mtg-licensing-api-production.up.railway.app" mono />
          </div>
        </Section>

        {/* Support */}
        <Section title="Support">
          <div className="card p-5">
            <p className="text-sm m-0 mb-2 leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
              Stuck, or moving your licence to another computer? Contact the MTG team and we will help.
            </p>
            <p className="text-xs m-0 leading-relaxed" style={{ color: 'var(--color-faint)' }}>
              Include your machine fingerprint and the last four characters of your licence key so we can find your order quickly.
            </p>
          </div>
        </Section>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <Modal title="Remove licence from this computer?" tone="danger" onClose={() => { if (!removing) setShowConfirm(false) }}>
          <p className="text-sm m-0 mb-2 leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
            This deactivates the licence here and frees the slot so you can activate on another computer.
          </p>
          <p className="text-sm m-0 mb-5 leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
            You will need to enter your key again to use MTG Manager on this computer. Presets stored on your Harmonizer are not affected.
          </p>
          {removeError && (
            <div className="notice notice-danger mb-4" role="alert">{removeError}</div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setShowConfirm(false)} disabled={removing} className="btn btn-secondary flex-1">
              Keep licence
            </button>
            <button onClick={handleRemoveLicence} disabled={removing} className="btn btn-danger flex-1">
              {removing && <span className="spinner" />}
              {removing ? 'Removing…' : 'Remove licence'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
