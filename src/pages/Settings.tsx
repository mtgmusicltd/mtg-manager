import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'

function maskKey(key: string): string {
  if (!key || key.length < 4) return key
  const parts = key.split('-')
  if (parts.length === 4) {
    return `${parts[0]}-${parts[1]}-XXXX-${parts[3]}`
  }
  return key.slice(0, 4) + '-XXXX-XXXX-' + key.slice(-4)
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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-black mb-8" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
          Settings
        </h1>

        {/* Licence section */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}>
            Licence
          </h2>
          <div className="rounded-xl p-5" style={{ background: '#13122e', border: '1px solid #252450' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs mb-1" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>Licence Key</p>
                <p className="font-mono text-sm" style={{ color: '#C8D300', letterSpacing: '0.1em' }}>
                  {licenceKey ? maskKey(licenceKey) : '—'}
                </p>
              </div>
              <span
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{ background: 'rgba(200,211,0,0.1)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}
              >
                Active
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: '#454570' }}>
              Each licence key supports 1 machine. To transfer your licence to a new machine, remove it here first.
            </p>
            <div style={{ borderTop: '1px solid #1a1940', paddingTop: '16px' }}>
              <button
                onClick={() => { setShowConfirm(true); setRemoveError('') }}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                style={{
                  fontFamily: 'Barlow, sans-serif',
                  background: 'rgba(224,82,82,0.08)',
                  border: '1px solid rgba(224,82,82,0.25)',
                  color: '#e05252',
                  cursor: 'pointer',
                }}
              >
                Remove Licence
              </button>
            </div>
          </div>
        </section>

        {/* Machine section */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}>
            This Machine
          </h2>
          <div className="rounded-xl p-5" style={{ background: '#13122e', border: '1px solid #252450' }}>
            <p className="text-xs mb-1" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>Machine Fingerprint</p>
            <div className="flex items-center gap-2 mt-1">
              <p
                className="font-mono text-xs flex-1 truncate"
                style={{ color: '#454570' }}
                title={fingerprint}
              >
                {fingerprint || 'Loading…'}
              </p>
              <button
                onClick={copyFingerprint}
                className="text-xs px-2 py-1 rounded shrink-0"
                style={{
                  background: '#1a1940',
                  border: '1px solid #252450',
                  color: copied ? '#C8D300' : '#7070a0',
                  cursor: 'pointer',
                  fontFamily: 'Barlow, sans-serif',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs mt-3" style={{ color: '#454570' }}>
              This identifier is used to associate your licence with this computer. It is generated from your hardware and never transmitted without your key.
            </p>
          </div>
        </section>

        {/* About section */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}>
            About
          </h2>
          <div className="rounded-xl p-5" style={{ background: '#13122e', border: '1px solid #252450' }}>
            <div className="flex items-center gap-4 mb-4">
              <img src="./logo.png" alt="MTG Logo" className="w-12 h-12 object-contain" />
              <div>
                <p className="font-black text-base" style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300' }}>
                  MTG Manager
                </p>
                <p className="text-xs" style={{ color: '#7070a0' }}>
                  MIDI Harmonizer Software Manager
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span style={{ color: '#7070a0' }}>Version</span>
                <span style={{ color: '#e8e8f0', fontFamily: 'monospace' }}>v{appVersion}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: '#7070a0' }}>Device</span>
                <span style={{ color: '#e8e8f0' }}>Adafruit MacroPad RP2040</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: '#7070a0' }}>API</span>
                <span style={{ color: '#e8e8f0', fontFamily: 'monospace' }}>mtg-licensing-api-production.up.railway.app</span>
              </div>
            </div>
          </div>
        </section>

        {/* Support */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}>
            Support
          </h2>
          <div className="rounded-xl p-5" style={{ background: '#13122e', border: '1px solid #252450' }}>
            <p className="text-sm mb-3" style={{ color: '#7070a0' }}>
              For licence transfers, technical issues, or general support, please reach out to the MTG team.
            </p>
            <p className="text-xs" style={{ color: '#454570' }}>
              Include your machine fingerprint and licence key (last 4 digits only) when contacting support.
            </p>
          </div>
        </section>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !removing) setShowConfirm(false) }}
        >
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: '#13122e', border: '1px solid rgba(224,82,82,0.3)' }}>
            <h3 className="text-base font-black mb-2" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
              Remove Licence?
            </h3>
            <p className="text-sm mb-2" style={{ color: '#a0a0c0' }}>
              This will deactivate your licence on this machine and free up your machine slot.
            </p>
            <p className="text-sm mb-4" style={{ color: '#a0a0c0' }}>
              You will need to enter a valid licence key to use the app again. Your presets on the device will not be affected.
            </p>
            {removeError && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(224,82,82,0.08)', color: '#e05252', border: '1px solid rgba(224,82,82,0.2)' }}>
                {removeError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={removing}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={{
                  fontFamily: 'Barlow, sans-serif',
                  background: '#1a1940',
                  border: '1px solid #252450',
                  color: removing ? '#454570' : '#7070a0',
                  cursor: removing ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveLicence}
                disabled={removing}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  fontFamily: 'Barlow, sans-serif',
                  background: removing ? 'rgba(224,82,82,0.05)' : 'rgba(224,82,82,0.12)',
                  border: '1px solid rgba(224,82,82,0.3)',
                  color: removing ? '#7070a0' : '#e05252',
                  cursor: removing ? 'not-allowed' : 'pointer',
                }}
              >
                {removing && (
                  <span className="w-3 h-3 rounded-full border-2 animate-spin shrink-0"
                    style={{ borderColor: '#e05252', borderTopColor: 'transparent' }} />
                )}
                {removing ? 'Removing…' : 'Remove Licence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
