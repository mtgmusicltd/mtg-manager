import axios from 'axios'

const BASE_URL = 'https://mtg-licensing-api-production.up.railway.app'

export interface ActivateResponse {
  status: string   // "success" | "error"
  message?: string
}

export interface ValidateResponse {
  status: string   // "valid" | "error"
  valid: boolean   // derived: status === 'valid'
  message?: string
}

export interface VersionsResponse {
  status: string
  versions: FirmwareVersionItem[]
}

export interface FirmwareVersionItem {
  id: number
  version: string
  label: string
  file_name: string
  created_at: string
}

export interface DownloadResponse {
  status: string
  version: string
  file_name: string
  url: string
  expires_in_seconds: number
}

export async function activateLicence(key: string, fingerprint: string): Promise<ActivateResponse> {
  const res = await axios.post(`${BASE_URL}/api/activate`, {
    key,
    machine_id: fingerprint,
  })
  return res.data
}

export async function validateLicence(key: string, fingerprint: string): Promise<ValidateResponse> {
  const res = await axios.post(`${BASE_URL}/api/activate/validate`, {
    key,
    machine_id: fingerprint,
  })
  // API returns { status: "valid" } on success — normalise to { valid: true }
  return { ...res.data, valid: res.data.status === 'valid' }
}

export async function listVersions(): Promise<VersionsResponse> {
  const res = await axios.get(`${BASE_URL}/api/download/versions`)
  return res.data
}

export async function downloadVersion(key: string, version: string): Promise<DownloadResponse> {
  const res = await axios.post(`${BASE_URL}/api/download`, { key, version })
  return res.data
}
