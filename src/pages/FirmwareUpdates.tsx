import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

interface FirmwareVersionItem {
  id: number
  version: string
  label: string
  file_name: string
  created_at: string
}

type FlashStage = 'idle' | 'downloading' | 'flashing' | 'done' | 'error' | 'already_downloaded'

interface FlashProgress {
  stage: string
  percent: number
  message: string
}

export default function FirmwareUpdates() {
  const { licenceKey, setUpdateBadge } = useApp()
  const [versions, setVersions] = useState<FirmwareVersionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [flashStates, setFlashStates] = useState<Record<string, FlashStage>>({})
  const [flashErrors, setFlashErrors] = useState<Record<string, string>>({})
  const [flashProgress, setFlashProgress] = useState<Record<string, FlashProgress>>({})
  const [appVersion, setAppVersion] = useState('0.0.0')

  // Drive detection — poll both RPI-RP2 (bootloader) and CIRCUITPY (normal mode)
  const [bootloaderConnected, setBootloaderConnected] = useState(false)
  const { deviceConnected } = useApp() // CIRCUITPY = normal mode

  // Load app version from Electron
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

  const latestVersion = versions[0] ?? null
  const hasUpdate = latestVersion ? semverGt(latestVersion.version, appVersion) : false

  // Poll for RPI-RP2 bootloader drive every 2 seconds
  useEffect(() => {
    if (!window.electronAPI) return
    let mounted = true

    async function pollBootloader() {
      if (!window.electronAPI || !mounted) return
      try {
        const res = await window.electronAPI.detectBootloader()
        if (mounted) setBootloaderConnected(res.connected)
      } catch {
        if (mounted) setBootloaderConnected(false)
      }
    }

    pollBootloader()
    const interval = setInterval(pollBootloader, 2000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Listen for progress events from main process
  useEffect(() => {
    if (!window.electronAPI?.onFlashProgress) return
    const unsub = window.electronAPI.onFlashProgress((progress: FlashProgress) => {
      setFlashProgress(prev => {
        const flashingVersion = Object.entries(flashStates).find(([, s]) => s === 'downloading' || s === 'flashing')?.[0]
        if (!flashingVersion) return prev
        return { ...prev, [flashingVersion]: progress }
      })
    })
    return () => { if (unsub) unsub() }
  }, [flashStates])

  useEffect(() => {
    async function fetchVersions() {
      setLoading(true)
      if (!window.electronAPI) {
        setFetchError('Not running in Electron.')
        setLoading(false)
        return
      }
      const res = await window.electronAPI.apiListVersions()
      if (!res.success) {
        setFetchError('Could not reach the update server. Please check your internet connection.')
        setLoading(false)
        return
      }
      const sorted = [...(res.data?.versions || [])].sort((a: FirmwareVersionItem, b: FirmwareVersionItem) => {
        if (semverGt(a.version, b.version)) return -1
        if (semverGt(b.version, a.version)) return 1
        return 0
      })
      setVersions(sorted)
      if (sorted.length > 0 && semverGt(sorted[0].version, appVersion)) {
        setUpdateBadge(true)
      }
      setLoading(false)
    }
    fetchVersions()
  }, [])

  function setVersionState(version: string, state: FlashStage) {
    setFlashStates(prev => ({ ...prev, [version]: state }))
  }
  function setVersionError(version: string, error: string) {
    setFlashErrors(prev => ({ ...prev, [version]: error }))
  }

  async function handleDownloadAndFlash(item: FirmwareVersionItem) {
    if (!window.electronAPI) return
    setVersionState(item.version, 'downloading')
    setVersionError(item.version, '')
    setFlashProgress(prev => ({ ...prev, [item.version]: { stage: 'download', percent: 0, message: 'Starting...' } }))

    const res = await window.electronAPI.downloadAndFlash(licenceKey, item.version)
    if (!res.success) {
      if (res.status === 403) {
        setVersionState(item.version, 'already_downloaded')
        setVersionError(item.version, 'This version has already been downloaded with your licence key.')
      } else {
        setVersionState(item.version, 'error')
        setVersionError(item.version, res.error || res.message || 'An unknown error occurred.')
      }
      return
    }
    setVersionState(item.version, 'done')
    setUpdateBadge(false)
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black mb-1" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
            Firmware Updates
          </h1>
        </div>

        {/* Device status indicator */}
        <div className="rounded-xl px-5 py-3 mb-6 flex items-center gap-3"
          style={{
            background: bootloaderConnected ? 'rgba(200,211,0,0.06)' : deviceConnected ? 'rgba(80,120,255,0.06)' : '#13122e',
            border: `1px solid ${bootloaderConnected ? 'rgba(200,211,0,0.3)' : deviceConnected ? 'rgba(80,120,255,0.3)' : '#252450'}`,
          }}>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: bootloaderConnected ? '#C8D300' : deviceConnected ? '#5078ff' : '#454570' }}
          />
          <div>
            <p className="text-sm font-semibold" style={{
              fontFamily: 'Barlow, sans-serif',
              color: bootloaderConnected ? '#C8D300' : deviceConnected ? '#8090ff' : '#7070a0'
            }}>
              {bootloaderConnected
                ? 'Bootloader connected — ready to flash'
                : deviceConnected
                  ? 'Device connected — ready to install'
                  : 'No device detected'}
            </p>
            <p className="text-xs" style={{ color: '#454570' }}>
              {bootloaderConnected
                ? 'Click Download & Install below to flash the firmware.'
                : deviceConnected
                  ? 'Click Download & Install below to update the firmware.'
                  : 'Connect your MTG Harmonizer via USB to get started.'}
            </p>
          </div>
        </div>

        {/* Update available banner */}
        {hasUpdate && (
          <div className="rounded-xl p-4 mb-6 flex items-center gap-4"
            style={{ background: 'rgba(200,211,0,0.08)', border: '1px solid rgba(200,211,0,0.3)' }}>
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300' }}>
                Version {latestVersion?.version} is available
              </p>
              <p className="text-xs" style={{ color: '#7070a0' }}>{latestVersion?.label}</p>
            </div>
          </div>
        )}

        {loading && <div className="text-sm" style={{ color: '#7070a0' }}>Checking for updates…</div>}
        {fetchError && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.3)', color: '#e05252' }}>
            {fetchError}
          </div>
        )}
        {!loading && !fetchError && versions.length === 0 && (
          <div className="text-sm" style={{ color: '#7070a0' }}>No firmware versions available yet.</div>
        )}

        {/* How to update — customer instructions (CIRCUITPY only) */}
        {!loading && !fetchError && versions.length > 0 && !deviceConnected && !bootloaderConnected && (
          <div className="rounded-xl px-5 py-4 mb-6"
            style={{ background: '#13122e', border: '1px solid #252450' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ fontFamily: 'Barlow, sans-serif', color: '#454570' }}>How to update</p>
            <div className="flex flex-col gap-2">
              {[
                {
                  n: '1',
                  text: (
                    <>
                      Connect your <span style={{ color: '#C8D300' }}>MTG Harmonizer</span> to your Mac via USB —
                      it will appear as <span style={{ color: '#C8D300' }}>CIRCUITPY</span> in Finder
                    </>
                  ),
                },
                {
                  n: '2',
                  text: (
                    <>
                      The status indicator above will turn{' '}
                      <span style={{ color: '#8090ff' }}>blue</span> when the device is detected
                    </>
                  ),
                },
                {
                  n: '3',
                  text: (
                    <>
                      Click{' '}
                      <span style={{ color: '#e8e8f0', fontWeight: 600 }}>Download &amp; Install</span> — the
                      firmware installs automatically
                    </>
                  ),
                },
                {
                  n: '4',
                  text: (
                    <>
                      When complete, <span style={{ color: '#C8D300' }}>unplug and replug</span> your Harmonizer —
                      it will reboot with the new firmware
                    </>
                  ),
                },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-3">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: 'rgba(200,211,0,0.12)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}>
                    {n}
                  </span>
                  <p className="text-sm" style={{ color: '#a0a0c0' }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Version list */}
        <div className="flex flex-col gap-3">
          {versions.map((item, idx) => {
            const state = flashStates[item.version] ?? 'idle'
            const errMsg = flashErrors[item.version] ?? ''
            const progress = flashProgress[item.version]
            const isLatest = idx === 0
            const isActive = state === 'downloading' || state === 'flashing'

            return (
              <div key={item.id} className="rounded-xl p-5"
                style={{ background: '#13122e', border: `1px solid ${isLatest && hasUpdate ? 'rgba(200,211,0,0.3)' : '#252450'}` }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-black" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
                        v{item.version}
                      </span>
                      {isLatest && (
                        <span className="text-xs px-2 py-0.5 rounded font-semibold"
                          style={{ background: 'rgba(200,211,0,0.12)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}>
                          Latest
                        </span>
                      )}
                    </div>
                    <p className="text-sm mb-1" style={{ color: '#e8e8f0' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: '#454570' }}>{formatDate(item.created_at)}</p>
                    <p className="text-xs mt-1" style={{ color: '#454570' }}>{item.file_name}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isLatest && state === 'idle' && (
                      <button
                        onClick={() => handleDownloadAndFlash(item)}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                        style={{
                          fontFamily: 'Barlow, sans-serif',
                          background: '#C8D300',
                          color: '#0C0B25',
                          border: 'none',
                          cursor: 'pointer',
                        }}>
                        Download &amp; Install
                      </button>
                    )}
                    {isLatest && isActive && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#7070a0' }}>
                        <span className="w-3 h-3 rounded-full border-2 animate-spin"
                          style={{ borderColor: '#C8D300', borderTopColor: 'transparent' }} />
                        {progress?.message ?? (state === 'downloading' ? 'Downloading…' : 'Installing…')}
                      </div>
                    )}
                    {isLatest && state === 'done' && (
                      <span className="text-xs font-semibold" style={{ color: '#4caf50', fontFamily: 'Barlow, sans-serif' }}>
                        ✓ Installed
                      </span>
                    )}
                    {isLatest && (state === 'error' || state === 'already_downloaded') && (
                      <span className="text-xs font-semibold" style={{ color: '#e05252', fontFamily: 'Barlow, sans-serif' }}>
                        {state === 'already_downloaded' ? 'Already downloaded' : 'Error'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {isLatest && isActive && progress && progress.percent > 0 && (
                  <div className="mt-3">
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#1a1940' }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress.percent}%`, background: '#C8D300' }}
                      />
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#454570' }}>
                      {progress.stage === 'download' ? 'Downloading firmware…'
                        : progress.stage === 'flash' && progress.percent < 60 ? 'Flashing CircuitPython…'
                        : progress.stage === 'flash' ? 'Waiting for device to reboot…'
                        : progress.stage === 'files' ? 'Installing application files…'
                        : 'Finishing up…'}
                      {' '}{progress.percent}%
                    </p>
                  </div>
                )}

                {errMsg && (
                  <p className="text-xs mt-3 pt-3" style={{ color: '#e05252', borderTop: '1px solid #1a1940' }}>
                    {errMsg}
                  </p>
                )}
                {state === 'done' && (
                  <p className="text-xs mt-3 pt-3" style={{ color: '#7070a0', borderTop: '1px solid #1a1940' }}>
                    Firmware installed successfully. Unplug and replug your Harmonizer to complete the update.
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs mt-8" style={{ color: '#454570' }}>
          Connect your MTG Harmonizer via USB, then click Download &amp; Install to update.
        </p>
      </div>
    </div>
  )
}
