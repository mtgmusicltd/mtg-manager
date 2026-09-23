import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'
import { EULA_TEXT } from '../assets/eula'
import { Icon, Wordmark } from './ui'

type Step = 'eula' | 'activate'

/*
  First-run flow. Behaviour is unchanged from 1.0.8:
    1. EULA is shown once and its acceptance persisted in config (`eulaAccepted`).
    2. Licence key is normalised to XXXX-XXXX-XXXX-XXXX and activated via IPC.
*/
export default function LicenceSplash() {
  const { activateLicence } = useApp()
  const [step, setStep] = useState<Step>('eula')
  const [eulaChecked, setEulaChecked] = useState(false)
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Check if EULA was already accepted (persisted in config)
  useEffect(() => {
    async function checkEula() {
      if (!window.electronAPI) {
        setStep('activate')
        return
      }
      const config = await window.electronAPI.loadConfig() as Record<string, unknown>
      if (config?.eulaAccepted === true) {
        setStep('activate')
      }
    }
    checkEula()
  }, [])

  function formatKey(raw: string) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const parts = clean.match(/.{1,4}/g) || []
    return parts.join('-').slice(0, 19)
  }

  async function handleAcceptEula() {
    if (!eulaChecked) return
    if (window.electronAPI) {
      await window.electronAPI.saveConfig({ eulaAccepted: true })
    }
    setStep('activate')
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    if (key.length < 19) {
      setError('Enter the full licence key.')
      return
    }
    setLoading(true)
    setError('')
    const result = await activateLicence(key)
    if (!result.success) {
      setError(result.error || 'Activation failed.')
    }
    setLoading(false)
  }

  const keyComplete = key.length >= 19

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto"
      style={{ background: 'var(--color-navy)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="w-full max-w-lg px-6 py-10 fade-up" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex justify-center mb-8">
          <Wordmark size="lg" />
        </div>

        {/* ── EULA step ── */}
        {step === 'eula' && (
          <div className="card p-6">
            <h2 className="text-base font-bold m-0 mb-1" style={{ color: 'var(--color-text)' }}>
              Before you start
            </h2>
            <p className="text-sm m-0 mb-4" style={{ color: 'var(--color-muted)' }}>
              Read and accept the licence agreement to continue.
            </p>

            <div
              className="rounded-lg p-4 mb-4 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap"
              style={{
                background: 'var(--color-navy)',
                border: '1px solid var(--color-navy-border)',
                color: 'var(--color-muted)',
                maxHeight: 220,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {EULA_TEXT}
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-5 select-none">
              <input
                type="checkbox"
                checked={eulaChecked}
                onChange={e => setEulaChecked(e.target.checked)}
                className="mt-0.5 shrink-0"
                style={{ accentColor: 'var(--color-lime)', width: 16, height: 16 }}
              />
              <span className="text-sm" style={{ color: 'var(--color-text-soft)' }}>
                I have read and agree to the End User Licence Agreement
              </span>
            </label>

            <button onClick={handleAcceptEula} disabled={!eulaChecked} className="btn btn-primary btn-lg w-full">
              Agree and continue
            </button>
          </div>
        )}

        {/* ── Activation step ── */}
        {step === 'activate' && (
          <div className="card p-7">
            <h2 className="text-lg font-bold m-0 mb-1" style={{ color: 'var(--color-text)' }}>
              Enter your licence key
            </h2>
            <p className="text-sm m-0 mb-6 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              It was emailed to you when you bought your MTG MIDI Harmonizer. It looks like{' '}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-soft)' }}>XXXX-XXXX-XXXX-XXXX</span>.
            </p>

            <form onSubmit={handleActivate} className="flex flex-col gap-4">
              <div>
                <label htmlFor="licence-key" className="eyebrow block mb-2">Licence key</label>
                <input
                  id="licence-key"
                  type="text"
                  value={key}
                  onChange={e => { setKey(formatKey(e.target.value)); if (error) setError('') }}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  maxLength={19}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  className={`input input-mono text-center text-lg tracking-[0.12em] ${error ? 'input-error' : ''}`}
                  style={{ color: 'var(--color-lime)', padding: '14px 16px' }}
                />
              </div>

              {error && (
                <div className="notice notice-danger flex items-start gap-2" role="alert">
                  <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading || !keyComplete} className="btn btn-primary btn-lg w-full">
                {loading && <span className="spinner" />}
                {loading ? 'Activating…' : 'Activate'}
              </button>
            </form>

            <p className="text-xs m-0 mt-5 text-center leading-relaxed" style={{ color: 'var(--color-faint)' }}>
              One key activates one computer. Moving to a new Mac? Remove the licence in Settings on the old one first.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
