export interface PresetsJson {
  mode: string
  preset_index: number
  presets: Preset[]
}

export interface Preset {
  name: string
  keys: Record<string, [number, number, number, number]>
  encoder_cc: number
  encoder_value: number
  encoder_sensitivity: number
}

export interface DeviceStatus {
  connected: boolean
  path: string | null
}

export interface ApiResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface FirmwareVersion {
  id: number
  version: string
  label: string
  file_name: string
  created_at: string
}

export interface IpcApiResult<T = unknown> {
  success: boolean
  status?: number
  message?: string
  error?: string
  data?: T
}

export interface ValidateResult {
  success: boolean
  valid: boolean
  status?: number
  message?: string
}

declare global {
  interface Window {
    electronAPI: {
      // Device / config
      getMachineFingerprint(): Promise<string>
      loadConfig(): Promise<Record<string, unknown>>
      saveConfig(data: Record<string, unknown>): Promise<boolean>
      detectDevice(): Promise<DeviceStatus>
      readPresets(): Promise<ApiResult<PresetsJson>>
      writePresets(data: PresetsJson): Promise<ApiResult>
      exportPresets(data: PresetsJson): Promise<ApiResult>
      importPresets(): Promise<ApiResult<PresetsJson>>
      detectBootloader(): Promise<DeviceStatus>
      flashFirmware(payload: { buffer: string; fileName: string }): Promise<ApiResult>
      getAppVersion(): Promise<string>
      // API calls (routed through main process)
      apiActivate(key: string, machineId: string): Promise<IpcApiResult>
      apiValidate(key: string, machineId: string): Promise<ValidateResult>
      apiListVersions(): Promise<IpcApiResult<{ versions: FirmwareVersion[] }>>
      apiDownloadVersion(key: string, version: string): Promise<IpcApiResult<{ url: string; file_name: string; version: string; expires_in_seconds: number }>>
      apiDeactivate(key: string, machineId: string): Promise<IpcApiResult>
      // Streaming download + flash
      downloadAndFlash(key: string, version: string): Promise<IpcApiResult>
      onFlashProgress(callback: (progress: { stage: string; percent: number; message: string }) => void): (() => void) | undefined
      onUpdateAvailable(callback: () => void): (() => void) | undefined
      onLog(callback: (msg: string) => void): (() => void) | undefined
    }
  }
}
