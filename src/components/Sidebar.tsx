import { useEffect, useState } from 'react'
import { useApp, type AppPage } from '../store/AppContext'
import { Icon, Logo } from './ui'

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

const NAV_ITEMS: { id: AppPage; label: string; icon: 'keys' | 'chip' | 'settings' }[] = [
  { id: 'presets', label: 'Presets', icon: 'keys' },
  { id: 'updates', label: 'Firmware', icon: 'chip' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export default function Sidebar() {
  const { currentPage, setCurrentPage, deviceConnected, updateBadge, hasUnsavedChanges } = useApp()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  return (
    <aside
      className="flex flex-col shrink-0 h-full"
      style={{
        width: 224,
        background: 'var(--color-navy-light)',
        borderRight: '1px solid var(--color-navy-border)',
      }}
    >
      {/* Draggable title strip — leaves room for macOS traffic lights (hiddenInset) */}
      <div
        className="shrink-0"
        style={{ height: IS_MAC ? 48 : 16, WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Logo className="w-8 h-8" />
        <div className="leading-none">
          <div
            className="text-[12px] font-semibold uppercase"
            style={{ fontFamily: 'var(--font)', color: 'var(--color-lime)', letterSpacing: '0.8px' }}
          >
            MTG Manager
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3" aria-label="Main">
        {NAV_ITEMS.map(item => {
          const active = currentPage === item.id
          const showUpdate = item.id === 'updates' && updateBadge
          const showUnsaved = item.id === 'presets' && hasUnsavedChanges
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`nav-item ${active ? 'nav-item-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={17} />
              <span className="flex-1">{item.label}</span>
              {showUpdate && <span className="dot dot-lime" title="Update available" />}
              {showUnsaved && <span className="dot dot-azure" title="Unsaved changes" />}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Device status */}
      <div className="px-3 pb-3">
        <div
          className="rounded-xl px-3.5 py-3 flex items-start gap-3"
          style={{
            background: deviceConnected ? 'rgba(200,211,0,0.07)' : 'var(--color-navy)',
            border: `1px solid ${deviceConnected ? 'rgba(200,211,0,0.3)' : 'var(--color-navy-border)'}`,
          }}
        >
          <span className={`dot mt-1.5 ${deviceConnected ? 'dot-lime dot-pulse' : 'dot-muted'}`} />
          <div className="min-w-0">
            <p
              className="m-0 text-[13px] font-bold leading-tight"
              style={{ fontFamily: 'var(--font)', color: deviceConnected ? 'var(--color-lime)' : 'var(--color-text-soft)' }}
            >
              {deviceConnected ? 'Harmonizer connected' : 'No Harmonizer found'}
            </p>
            <p className="m-0 mt-1 text-[12px] leading-snug" style={{ color: 'var(--color-muted)' }}>
              {deviceConnected ? 'Ready to edit presets' : 'Plug it in over USB'}
            </p>
          </div>
        </div>
      </div>

      {/* Version */}
      <div className="px-5 pb-4 text-[11px]" style={{ color: 'var(--color-faint)', fontFamily: 'var(--font)' }}>
        {appVersion ? `Version ${appVersion}` : ' '}
      </div>
    </aside>
  )
}
