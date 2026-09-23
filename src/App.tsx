import { AppProvider, useApp } from './store/AppContext'
import LicenceSplash from './components/LicenceSplash'
import InvalidLicence from './components/InvalidLicence'
import Sidebar from './components/Sidebar'
import PresetEditor from './pages/PresetEditor'
import FirmwareUpdates from './pages/FirmwareUpdates'
import Settings from './pages/Settings'
import { Logo } from './components/ui'

function AppShell() {
  const { licenceState, currentPage } = useApp()

  if (licenceState === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--color-navy)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex flex-col items-center gap-5">
          <Logo className="w-16 h-16 animate-pulse" alt="MTG" />
          <p className="m-0 text-sm" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font)' }}>
            Checking your licence…
          </p>
        </div>
      </div>
    )
  }

  if (licenceState === 'unlicensed') {
    return <LicenceSplash />
  }

  if (licenceState === 'invalid') {
    return <InvalidLicence />
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--color-navy)' }}>
      <Sidebar />
      <main className="flex-1 flex min-w-0 overflow-hidden">
        {currentPage === 'presets' && <PresetEditor />}
        {currentPage === 'updates' && <FirmwareUpdates />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
