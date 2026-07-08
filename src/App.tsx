import { AppProvider, useApp } from './store/AppContext'
import LicenceSplash from './components/LicenceSplash'
import InvalidLicence from './components/InvalidLicence'
import TopNav from './components/TopNav'
import PresetEditor from './pages/PresetEditor'
import FirmwareUpdates from './pages/FirmwareUpdates'
import Settings from './pages/Settings'

function AppShell() {
  const { licenceState, currentPage } = useApp()

  if (licenceState === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0C0B25' }}>
        <div className="flex flex-col items-center gap-4">
          <img src="./logo.png" alt="MTG" className="w-20 h-20 object-contain animate-pulse" />
          <p className="text-sm" style={{ color: '#454570', fontFamily: 'Barlow, sans-serif' }}>
            Validating licence...
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
    <div className="flex flex-col h-full">
      <TopNav />
      <main className="flex-1 flex overflow-hidden">
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
