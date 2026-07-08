import { useApp, type AppPage } from '../store/AppContext'

const NAV_ITEMS: { id: AppPage; label: string }[] = [
  { id: 'presets', label: 'Preset Editor' },
  { id: 'updates', label: 'Firmware Updates' },
  { id: 'settings', label: 'Settings' },
]

export default function TopNav() {
  const { currentPage, setCurrentPage, deviceConnected, updateBadge, hasUnsavedChanges } = useApp()

  return (
    <header
      className="flex items-center gap-0 px-6 shrink-0"
      style={{
        height: 56,
        background: '#0d0c28',
        borderBottom: '1px solid #252450',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Logo + wordmark */}
      <div className="flex items-center gap-3 mr-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img src="./logo.png" alt="MTG" className="w-7 h-7 object-contain" />
        <span
          className="text-sm font-black tracking-widest uppercase"
          style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300', letterSpacing: '0.15em' }}
        >
          MTG Manager
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-stretch h-full gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {NAV_ITEMS.map(item => {
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className="relative px-5 text-sm font-semibold transition-all flex items-center gap-2"
              style={{
                fontFamily: 'Barlow, sans-serif',
                color: isActive ? '#C8D300' : '#7070a0',
                borderBottom: isActive ? '2px solid #C8D300' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {item.label}
              {item.id === 'updates' && updateBadge && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#C8D300' }}
                  title="Update available"
                />
              )}
              {item.id === 'presets' && hasUnsavedChanges && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#00A3CB' }}
                  title="Unsaved changes"
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Device status */}
      <div
        className="flex items-center gap-2 text-xs"
        style={{ fontFamily: 'Bitter, serif', color: deviceConnected ? '#C8D300' : '#454570', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: deviceConnected ? '#C8D300' : '#454570',
            boxShadow: deviceConnected ? '0 0 6px #C8D300' : 'none',
          }}
        />
        {deviceConnected ? 'Device Connected' : 'No Device'}
      </div>
    </header>
  )
}
