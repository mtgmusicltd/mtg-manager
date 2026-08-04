'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Device / config
  getMachineFingerprint: () => ipcRenderer.invoke('get-machine-fingerprint'),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  detectDevice: () => ipcRenderer.invoke('detect-device'),
  readPresets: () => ipcRenderer.invoke('read-presets'),
  writePresets: (data) => ipcRenderer.invoke('write-presets', data),
  exportPresets: (data) => ipcRenderer.invoke('export-presets', data),
  importPresets: () => ipcRenderer.invoke('import-presets'),
  detectBootloader: () => ipcRenderer.invoke('detect-bootloader'),
  flashFirmware: (payload) => ipcRenderer.invoke('flash-firmware', payload),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // API calls (routed through main process to avoid renderer network restrictions)
  apiActivate: (key, machineId) => ipcRenderer.invoke('api-activate', { key, machineId }),
  apiValidate: (key, machineId) => ipcRenderer.invoke('api-validate', { key, machineId }),
  apiListVersions: () => ipcRenderer.invoke('api-list-versions'),
  apiDownloadVersion: (key, version) => ipcRenderer.invoke('api-download-version', { key, version }),
  apiDeactivate: (key, machineId) => ipcRenderer.invoke('api-deactivate', { key, machineId }),
  // Streaming download + flash (no large buffer in renderer)
  downloadAndFlash: (key, version) => ipcRenderer.invoke('download-and-flash', { key, version }),
  // Progress events from main process during download-and-flash
  onFlashProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('flash-progress', handler)
    return () => ipcRenderer.removeListener('flash-progress', handler)
  },
  // Auto-update notification from main process
  onUpdateAvailable: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('app-update-available', handler)
    return () => ipcRenderer.removeListener('app-update-available', handler)
  },
  // Debug log forwarding from main process
  onLog: (callback) => {
    const handler = (_, msg) => callback(msg)
    ipcRenderer.on('log', handler)
    return () => ipcRenderer.removeListener('log', handler)
  },
})
