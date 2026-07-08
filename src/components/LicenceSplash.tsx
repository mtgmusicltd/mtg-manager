import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'
import { EULA_TEXT } from '../assets/eula'

type Step = 'eula' | 'activate'

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
      setError('Please enter a complete licence key.')
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

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: '#0C0B25' }}>

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <img src="./logo.png" alt="MTG Logo" className="w-24 h-24 object-contain" />
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300' }}>
            MTG MANAGER
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7070a0', fontFamily: 'Bitter, serif' }}>
            MIDI Harmonizer Software Manager
          </p>
        </div>
      </div>

      {/* ── EULA Step ── */}
      {step === 'eula' && (
        <div className="w-full max-w-lg rounded-xl p-6"
          style={{ background: '#13122e', border: '1px solid #252450' }}>
          <h2 className="text-base font-bold mb-1" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
            End User Licence Agreement
          </h2>
          <p className="text-xs mb-4" style={{ color: '#7070a0' }}>
            Please read and accept the licence agreement to continue.
          </p>

          {/* Scrollable EULA text */}
          <div
            className="rounded-lg p-4 mb-4 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap"
            style={{
              background: '#0C0B25',
              border: '1px solid #1a1940',
              color: '#7070a0',
              maxHeight: '220px',
              fontFamily: 'monospace',
            }}>
            {EULA_TEXT}
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-5 select-none">
            <input
              type="checkbox"
              checked={eulaChecked}
              onChange={e => setEulaChecked(e.target.checked)}
              className="mt-0.5 shrink-0"
              style={{ accentColor: '#C8D300', width: 16, height: 16 }}
            />
            <span className="text-sm" style={{ color: '#a0a0c0' }}>
              I have read and agree to the End User Licence Agreement
            </span>
          </label>

          <button
            onClick={handleAcceptEula}
            disabled={!eulaChecked}
            className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all"
            style={{
              fontFamily: 'Barlow, sans-serif',
              background: eulaChecked ? '#C8D300' : '#252450',
              color: eulaChecked ? '#0C0B25' : '#555580',
              cursor: eulaChecked ? 'pointer' : 'not-allowed',
              border: 'none',
            }}>
            I Agree — Continue
          </button>
        </div>
      )}

      {/* ── Activation Step ── */}
      {step === 'activate' && (
        <div className="w-full max-w-md rounded-xl p-8"
          style={{ background: '#13122e', border: '1px solid #252450' }}>
          <h2 className="text-lg font-bold mb-1" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
            Activate Your Licence
          </h2>
          <p className="text-sm mb-6" style={{ color: '#7070a0' }}>
            Enter the licence key included with your MTG MIDI Harmonizer purchase.
          </p>

          <form onSubmit={handleActivate} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-widest"
                style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
                Licence Key
              </label>
              <input
                type="text"
                value={key}
                onChange={e => setKey(formatKey(e.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={19}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg px-4 py-3 text-center text-lg font-mono tracking-widest outline-none transition-all"
                style={{
                  background: '#0C0B25',
                  border: `1px solid ${error ? '#e05252' : '#252450'}`,
                  color: '#C8D300',
                  fontFamily: 'monospace',
                }}
                onFocus={e => (e.target.style.borderColor = '#C8D300')}
                onBlur={e => (e.target.style.borderColor = error ? '#e05252' : '#252450')}
              />
            </div>

            {error && (
              <p className="text-sm text-center" style={{ color: '#e05252' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || key.length < 19}
              className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all"
              style={{
                fontFamily: 'Barlow, sans-serif',
                background: loading || key.length < 19 ? '#252450' : '#C8D300',
                color: loading || key.length < 19 ? '#555580' : '#0C0B25',
                cursor: loading || key.length < 19 ? 'not-allowed' : 'pointer',
              }}>
              {loading ? 'Activating…' : 'Activate'}
            </button>
          </form>


        </div>
      )}

      <p className="text-xs mt-8" style={{ color: '#454570' }}>
        MTG Manager v1.0.0
      </p>
    </div>
  )
}
