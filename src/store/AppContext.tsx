import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { PresetsJson } from '../types/electron'

export type AppPage = 'presets' | 'updates' | 'settings'
export type LicenceState = 'checking' | 'unlicensed' | 'licensed' | 'invalid'

interface AppContextValue {
  // Licence
  licenceState: LicenceState
  licenceKey: string
  setLicenceKey: (k: string) => void
  activateLicence: (key: string) => Promise<{ success: boolean; error?: string }>
  removeLicence: () => Promise<{ success: boolean; error?: string }>
  // Navigation
  currentPage: AppPage
  setCurrentPage: (p: AppPage) => void
  // Device
  deviceConnected: boolean
  devicePath: string | null
  // Presets
  presets: PresetsJson | null
  setPresets: (p: PresetsJson) => void
  loadPresetsFromDevice: () => Promise<void>
  savePresetsToDevice: () => Promise<{ success: boolean; error?: string }>
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (v: boolean) => void
  // Updates
  updateBadge: boolean
  setUpdateBadge: (v: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [licenceState, setLicenceState] = useState<LicenceState>('checking')
  const [licenceKey, setLicenceKeyState] = useState('')
  const [currentPage, setCurrentPage] = useState<AppPage>('presets')
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [devicePath, setDevicePath] = useState<string | null>(null)
  const [presets, setPresetsState] = useState<PresetsJson | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [updateBadge, setUpdateBadge] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Initialise: load config, validate licence ──────────────────────────────
  useEffect(() => {
    async function init() {
      if (!window.electronAPI) {
        // Running in browser preview — skip to unlicensed
        setLicenceState('unlicensed')
        return
      }
      const config = await window.electronAPI.loadConfig() as Record<string, string>
      const storedKey = config?.licenceKey as string | undefined
      if (!storedKey) {
        setLicenceState('unlicensed')
        return
      }
      setLicenceKeyState(storedKey)
      try {
        const fingerprint = await window.electronAPI.getMachineFingerprint()
        const res = await window.electronAPI.apiValidate(storedKey, fingerprint)
        if (res.valid) {
          setLicenceState('licensed')
        } else if (res.status === 410) {
          // Revoked
          setLicenceState('invalid')
        } else {
          // Network error or unknown — allow offline use
          setLicenceState('licensed')
        }
      } catch {
        // Network error — allow offline use if key is stored
        setLicenceState('licensed')
      }
    }
    init()
  }, [])

  // ── Device polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (licenceState !== 'licensed') return
    async function poll() {
      if (!window.electronAPI) return
      const status = await window.electronAPI.detectDevice()
      setDeviceConnected(status.connected)
      setDevicePath(status.path)
    }
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [licenceState])

  // ── Auto-load presets when device connects ─────────────────────────────────
  useEffect(() => {
    if (deviceConnected && !presets) {
      loadPresetsFromDevice()
    }
    if (!deviceConnected) {
      setPresetsState(null)
      setHasUnsavedChanges(false)
    }
  }, [deviceConnected])

  async function loadPresetsFromDevice() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.readPresets()
    if (result.success && result.data) {
      setPresetsState(result.data)
      setHasUnsavedChanges(false)
    }
  }

  async function savePresetsToDevice() {
    if (!window.electronAPI || !presets) return { success: false, error: 'No presets loaded' }
    const result = await window.electronAPI.writePresets(presets)
    if (result.success) setHasUnsavedChanges(false)
    return result
  }

  function setPresets(p: PresetsJson) {
    setPresetsState(p)
    setHasUnsavedChanges(true)
  }

  function setLicenceKey(k: string) {
    setLicenceKeyState(k)
  }

  async function removeLicence(): Promise<{ success: boolean; error?: string }> {
    if (!window.electronAPI) return { success: false, error: 'Electron API not available' }
    try {
      const fingerprint = await window.electronAPI.getMachineFingerprint()
      // Tell the API to free the machine slot — ignore 404 (already gone)
      await window.electronAPI.apiDeactivate(licenceKey, fingerprint)
    } catch {
      // Network failure — still clear locally so user isn't locked out
    }
    // Clear local config and state
    await window.electronAPI.saveConfig({ licenceKey: '' })
    setLicenceKeyState('')
    setPresetsState(null)
    setHasUnsavedChanges(false)
    setLicenceState('unlicensed')
    return { success: true }
  }

  async function activateLicence(key: string): Promise<{ success: boolean; error?: string }> {
    if (!window.electronAPI) return { success: false, error: 'Electron API not available' }
    try {
      const fingerprint = await window.electronAPI.getMachineFingerprint()
      const res = await window.electronAPI.apiActivate(key, fingerprint)
      if (!res.success) {
        if (res.status === 404) return { success: false, error: 'Licence key not found.' }
        if (res.status === 403) return { success: false, error: 'Activation limit reached or key is revoked.' }
        if (res.status === 410) return { success: false, error: 'This licence key has been revoked.' }
        return { success: false, error: res.message || 'Activation failed.' }
      }
      await window.electronAPI.saveConfig({ licenceKey: key })
      setLicenceKeyState(key)
      setLicenceState('licensed')
      return { success: true }
    } catch (err: unknown) {
      const e = err as { message?: string }
      return { success: false, error: e?.message || 'Could not connect to the licence server. Please check your internet connection.' }
    }
  }

  return (
    <AppContext.Provider value={{
      licenceState, licenceKey, setLicenceKey, activateLicence, removeLicence,
      currentPage, setCurrentPage,
      deviceConnected, devicePath,
      presets, setPresets, loadPresetsFromDevice, savePresetsToDevice,
      hasUnsavedChanges, setHasUnsavedChanges,
      updateBadge, setUpdateBadge,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
