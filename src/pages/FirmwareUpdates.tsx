import { useEffect, useState } from 'react'
import { useApp } from '../store/AppContext'
import { Em, Icon, Lime, PageHeader, Steps } from '../components/ui'

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

function progressLabel(progress: FlashProgress) {
  if (progress.stage === 'download') return 'Downloading firmware…'
  if (progress.stage === 'flash' && progress.percent < 60) return 'Installing CircuitPython…'
  if (progress.stage === 'flash') return 'Waiting for the Harmonizer to restart…'
  if (progress.stage === 'files') return 'Copying application files…'
  return 'Finishing up…'
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
        setFetchError('Could not reach the update server. Check your internet connection, then come back to this page.')
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

  // ── Device status card ─────────────────────────────────────────────────────
  const status = bootloaderConnected
    ? { tone: 'lime', title: 'Bootloader mode — ready to install', hint: 'Choose Download and install below. The Harmonizer will restart on its own.' }
    : deviceConnected
      ? { tone: 'azure', title: 'Harmonizer connected — ready to update', hint: 'Choose Download and install below to put the latest firmware on it.' }
      : { tone: 'muted', title: 'Plug in your Harmonizer', hint: 'Connect it over USB. This page updates automatically when it appears.' }

  const statusColour = status.tone === 'lime' ? 'var(--color-lime)' : status.tone === 'azure' ? '#3ec4e4' : 'var(--color-text-soft)'
  const statusBg = status.tone === 'lime' ? 'rgba(200,211,0,0.07)' : status.tone === 'azure' ? 'rgba(0,163,203,0.08)' : 'var(--color-navy-light)'
  const statusBorder = status.tone === 'lime' ? 'rgba(200,211,0,0.3)' : status.tone === 'azure' ? 'rgba(0,163,203,0.3)' : 'var(--color-navy-border)'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 fade-up">
        <PageHeader title="Firmware" subtitle="Keep your Harmonizer on the latest firmware." />

        {/* Device status */}
        <div
          className="rounded-xl px-5 py-4 mb-4 flex items-center gap-4"
          style={{ background: statusBg, border: `1px solid ${statusBorder}` }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(12,11,37,0.5)', color: statusColour }}
          >
            <Icon name={status.tone === 'muted' ? 'usb' : 'check'} size={18} />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: statusColour }}>
              {status.title}
            </p>
            <p className="m-0 mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              {status.hint}
            </p>
          </div>
        </div>

        {/* Update available banner */}
        {hasUpdate && (
          <div className="notice notice-lime mb-4 flex items-center gap-3">
            <Icon name="sparkle" size={18} className="shrink-0" />
            <div>
              <p className="m-0 text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                Version {latestVersion?.version} is available
              </p>
              {latestVersion?.label && <p className="m-0 text-xs" style={{ color: 'var(--color-muted)' }}>{latestVersion.label}</p>}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--color-muted)' }}>
            <span className="spinner" /> Checking for firmware…
          </div>
        )}

        {fetchError && (
          <div className="notice notice-danger flex items-start gap-2" role="alert">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {!loading && !fetchError && versions.length === 0 && (
          <div className="card p-6 text-center">
            <p className="m-0 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>No firmware published yet</p>
            <p className="m-0 mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>Check back after the next release.</p>
          </div>
        )}

        {/* How to update — shown until a device appears */}
        {!loading && !fetchError && versions.length > 0 && !deviceConnected && !bootloaderConnected && (
          <div className="card px-5 py-4 mb-4">
            <p className="eyebrow m-0 mb-3">How to update</p>
            <Steps items={[
              <>Connect your <Lime>MTG Harmonizer</Lime> to this computer over USB. It shows up as <Lime>CIRCUITPY</Lime> in Finder.</>,
              <>The status above turns <span className="font-semibold" style={{ color: '#3ec4e4' }}>blue</span> once it is detected.</>,
              <>Choose <Em>Download and install</Em>. The firmware installs on its own.</>,
              <>When it finishes, <Lime>unplug and replug</Lime> your Harmonizer so it restarts with the new firmware.</>,
            ]} />
          </div>
        )}

        {/* Version list */}
        {versions.length > 0 && (
          <div className="flex flex-col gap-3">
            {versions.map((item, idx) => {
              const state = flashStates[item.version] ?? 'idle'
              const errMsg = flashErrors[item.version] ?? ''
              const progress = flashProgress[item.version]
              const isLatest = idx === 0
              const isActive = state === 'downloading' || state === 'flashing'

              return (
                <div
                  key={item.id}
                  className="card p-5"
                  style={isLatest ? { borderColor: hasUpdate ? 'rgba(200,211,0,0.35)' : 'var(--color-navy-raised)' } : { opacity: 0.8 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-black" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}>
                          v{item.version}
                        </span>
                        {isLatest && <span className="pill pill-lime">Latest</span>}
                        {state === 'done' && <span className="pill pill-lime"><Icon name="check" size={11} /> Installed</span>}
                        {state === 'already_downloaded' && <span className="pill pill-amber">Already downloaded</span>}
                        {state === 'error' && <span className="pill pill-danger">Failed</span>}
                      </div>
                      {item.label && <p className="m-0 text-sm" style={{ color: 'var(--color-text-soft)' }}>{item.label}</p>}
                      <p className="m-0 mt-1 text-xs" style={{ color: 'var(--color-faint)' }}>
                        {formatDate(item.created_at)} · <span style={{ fontFamily: 'var(--font-mono)' }}>{item.file_name}</span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isLatest && state === 'idle' && (
                        <button onClick={() => handleDownloadAndFlash(item)} className="btn btn-primary">
                          <Icon name="download" size={15} />
                          Download and install
                        </button>
                      )}
                      {isLatest && isActive && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-lime)' }}>
                          <span className="spinner" />
                          <span style={{ color: 'var(--color-text-soft)' }}>
                            {progress?.message ?? (state === 'downloading' ? 'Downloading…' : 'Installing…')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isLatest && isActive && progress && progress.percent > 0 && (
                    <div className="mt-4">
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'var(--color-navy-raised)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${progress.percent}%`, background: 'var(--color-lime)' }}
                        />
                      </div>
                      <p className="m-0 mt-2 text-xs flex justify-between" style={{ color: 'var(--color-muted)' }}>
                        <span>{progressLabel(progress)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{progress.percent}%</span>
                      </p>
                      <p className="m-0 mt-2 text-xs" style={{ color: 'var(--color-amber)' }}>
                        Keep the Harmonizer plugged in until this finishes.
                      </p>
                    </div>
                  )}

                  {errMsg && (
                    <div className={`notice ${state === 'already_downloaded' ? 'notice-amber' : 'notice-danger'} mt-4`} role="alert">
                      {errMsg}
                    </div>
                  )}
                  {state === 'done' && (
                    <div className="notice notice-lime mt-4">
                      Firmware installed. <Em>Unplug and replug</Em> your Harmonizer to finish the update.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
