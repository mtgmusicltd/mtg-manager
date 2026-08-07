'use strict'
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const https = require('https')
const http = require('http')
const { execSync, execFile } = require('child_process')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const API_BASE = 'https://mtg-licensing-api-production.up.railway.app'

// ─── HTTP Helper (Node https — bypasses renderer restrictions) ────────────────

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint)
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || 'API error')
            err.status = res.statusCode
            err.data = parsed
            reject(err)
          } else {
            resolve(parsed)
          }
        } catch {
          reject(new Error('Invalid JSON response from server'))
        }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// Download a binary from a URL (follows redirects), returns a Buffer
function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
    }
    const req = client.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBinary(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        reject(new Error(`Download failed with status ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

// POST to /api/compile and get back a binary Buffer (main.mpy)
function apiCompile(key, version, uid) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + '/api/compile')
    const payload = JSON.stringify({ key, version, uid })
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }
    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        if (res.statusCode === 200) {
          resolve(buf)
        } else {
          try {
            const err = JSON.parse(buf.toString())
            reject(new Error(err.message || 'Compile failed'))
          } catch {
            reject(new Error(`Compile failed with status ${res.statusCode}`))
          }
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ─── Machine Fingerprint ──────────────────────────────────────────────────────

function getMachineFingerprint() {
  try {
    const networkInterfaces = os.networkInterfaces()
    let macAddress = ''
    for (const iface of Object.values(networkInterfaces)) {
      for (const addr of iface) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          macAddress = addr.mac
          break
        }
      }
      if (macAddress) break
    }
    const raw = `${os.hostname()}-${os.cpus()[0]?.model || 'cpu'}-${macAddress}`
    return crypto.createHash('sha256').update(raw).digest('hex')
  } catch {
    return crypto.createHash('sha256').update(os.hostname()).digest('hex')
  }
}

// ─── User Data Paths ──────────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveConfig(data) {
  const existing = loadConfig()
  const merged = { ...existing, ...data }
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2))
}

// ─── USB / CIRCUITPY Detection ────────────────────────────────────────────────

function findCircuitPyDrive() {
  const platform = process.platform
  const candidates = []

  if (platform === 'darwin') {
    candidates.push('/Volumes/CIRCUITPY')
  } else if (platform === 'win32') {
    for (let i = 68; i <= 90; i++) {
      const letter = String.fromCharCode(i)
      const p = `${letter}:\\`
      try {
        if (fs.existsSync(p + 'boot_out.txt') || fs.existsSync(p + 'code.py')) {
          return p
        }
      } catch {}
    }
  } else {
    const user = os.userInfo().username
    candidates.push(`/media/${user}/CIRCUITPY`)
    candidates.push(`/media/CIRCUITPY`)
    candidates.push(`/run/media/${user}/CIRCUITPY`)
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ─── RPI-RP2 Bootloader Drive Detection ──────────────────────────────────────

function findBootloaderDrive() {
  const platform = process.platform
  const candidates = []

  if (platform === 'darwin') {
    candidates.push('/Volumes/RPI-RP2')
  } else if (platform === 'win32') {
    for (let i = 68; i <= 90; i++) {
      const letter = String.fromCharCode(i)
      const p = `${letter}:\\`
      try {
        if (fs.existsSync(p + 'INFO_UF2.TXT')) {
          return p
        }
      } catch {}
    }
  } else {
    const user = os.userInfo().username
    candidates.push(`/media/${user}/RPI-RP2`)
    candidates.push(`/media/RPI-RP2`)
    candidates.push(`/run/media/${user}/RPI-RP2`)
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ─── Read Device UID from boot_out.txt ───────────────────────────────────────
// boot_out.txt contains a line like: Board ID:adafruit_macropad_rp2040
// The UID is read from the CircuitPython REPL or from the board's unique ID.
// On CIRCUITPY, we read it from boot_out.txt which has the format:
//   Adafruit CircuitPython 10.0.3 on 2025-10-17; Adafruit Macropad RP2040 with rp2040
//   Board ID:adafruit_macropad_rp2040
//   UID:DF6380824F3D5230
// If UID line isn't present, we try to read it via serial REPL.

function readDeviceUID(drivePath) {
  const bootOutPath = path.join(drivePath, 'boot_out.txt')
  try {
    const content = fs.readFileSync(bootOutPath, 'utf-8')
    const match = content.match(/UID:([A-F0-9]{16})/i)
    if (match) return match[1].toUpperCase()
  } catch {}
  return null
}

// Read UID via serial REPL (fallback if boot_out.txt doesn't have it)
function readDeviceUIDViaSerial() {
  try {
    if (process.platform === 'darwin') {
      const ports = execSync('ls /dev/tty.usbmodem* 2>/dev/null', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean)
      if (ports.length === 0) return null
      const port = ports[0]
      // Use Python to read UID via REPL
      const pyScript = `
import serial, time
s = serial.Serial('${port}', 115200, timeout=3)
time.sleep(0.3)
s.write(b'\\x03\\x03')
time.sleep(0.5)
s.write(b'import microcontroller; print("UID:" + "".join(f"{b:02X}" for b in microcontroller.cpu.uid))\\r\\n')
time.sleep(1)
out = s.read(s.in_waiting).decode('utf-8', errors='ignore')
s.close()
for line in out.split('\\n'):
    if line.strip().startswith('UID:'):
        print(line.strip())
        break
`
      const result = execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 }).trim()
      const match = result.match(/UID:([A-F0-9]{16})/i)
      if (match) return match[1].toUpperCase()
    }
  } catch (e) {
    console.warn('[UID] Serial read failed:', e.message)
  }
  return null
}

// ─── macOS: Remount CIRCUITPY as writable ─────────────────────────────────────

let circuitpyMounted = false

function getDiskDevice(mountPoint) {
  try {
    const output = execSync(`diskutil info "${mountPoint}" 2>/dev/null`, { encoding: 'utf-8' })
    const match = output.match(/Device Node:\s+(\S+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function ensureCircuitPyWritable(drivePath) {
  if (process.platform !== 'darwin') return true
  if (circuitpyMounted) return true

  const testFile = path.join(drivePath, '.mtg_write_test')
  try {
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
    circuitpyMounted = true
    return true
  } catch {
    // Not writable — need to remount
  }

  try {
    const device = getDiskDevice(drivePath)
    if (!device) throw new Error('Could not find disk device for CIRCUITPY')

    const script = [
      `do shell script "diskutil unmount '${drivePath}' && sleep 1 && /sbin/mount_msdos -o rw '${device}' '${drivePath}'"`,
      `with administrator privileges`,
    ].join(' ')

    execSync(`osascript -e '${script}'`, { timeout: 30000 })

    // Verify the remount actually worked before declaring success
    try {
      fs.writeFileSync(testFile, '')
      fs.unlinkSync(testFile)
      circuitpyMounted = true
      return true
    } catch {
      console.error('[MOUNT] Remount succeeded but drive is still read-only')
      return false
    }
  } catch (e) {
    console.error('[MOUNT] Failed to remount CIRCUITPY as writable:', e.message)
    return false
  }
}

let lastDeviceConnected = false
function checkDeviceConnectionChange(connected) {
  if (lastDeviceConnected && !connected) {
    circuitpyMounted = false
  }
  lastDeviceConnected = connected
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-machine-fingerprint', () => getMachineFingerprint())

ipcMain.handle('load-config', () => loadConfig())

ipcMain.handle('save-config', (_, data) => {
  saveConfig(data)
  return true
})

ipcMain.handle('detect-device', () => {
  const drivePath = findCircuitPyDrive()
  const connected = !!drivePath
  checkDeviceConnectionChange(connected)
  return { connected, path: drivePath }
})

ipcMain.handle('read-presets', () => {
  const drivePath = findCircuitPyDrive()
  if (!drivePath) return { success: false, error: 'Device not connected' }
  const presetsPath = path.join(drivePath, 'presets.json')
  try {
    const raw = fs.readFileSync(presetsPath, 'utf-8')
    const data = JSON.parse(raw)

    // ── Migration: old format had { hx: [...], ableton: [...], lpx: [...] }
    // Flatten to new format { presets: [...] } using the hx bank as the source
    // of truth (hx and mtg modes share the same intervals).
    if (!Array.isArray(data.presets) && (Array.isArray(data.hx) || Array.isArray(data.ableton) || Array.isArray(data.lpx))) {
      const merged = [...(data.hx || []), ...(data.ableton || []), ...(data.lpx || [])]
      // De-duplicate by name, keeping first occurrence
      const seen = new Set()
      const deduped = merged.filter(p => {
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
      data.presets = deduped.length > 0 ? deduped : data.hx || []
      delete data.hx
      delete data.ableton
      delete data.lpx
      console.log('[PRESETS] Migrated old 3-bank format to flat presets array:', data.presets.length, 'presets')
    }

    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('write-presets', (_, jsonData) => {
  const drivePath = findCircuitPyDrive()
  if (!drivePath) return { success: false, error: 'Device not connected' }

  const writable = ensureCircuitPyWritable(drivePath)
  if (!writable) {
    return { success: false, error: 'Permission denied. Please allow MTG Manager to write to the device when prompted.' }
  }

  const presetsPath = path.join(drivePath, 'presets.json')
  try {
    fs.writeFileSync(presetsPath, JSON.stringify(jsonData))
    return { success: true }
  } catch (e) {
    if (e.code === 'EROFS') {
      circuitpyMounted = false
      return { success: false, error: 'The device is still read-only. Try ejecting and reconnecting the device, then save again.' }
    }
    return { success: false, error: e.message }
  }
})

ipcMain.handle('export-presets', async (_, jsonData) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Presets',
    defaultPath: 'mtg-presets.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!filePath) return { success: false, error: 'Cancelled' }
  try {
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2))
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('import-presets', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Import Presets',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (!filePaths || filePaths.length === 0) return { success: false, error: 'Cancelled' }
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8')
    return { success: true, data: JSON.parse(raw) }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('detect-bootloader', () => {
  const drivePath = findBootloaderDrive()
  return { connected: !!drivePath, path: drivePath }
})

ipcMain.handle('flash-firmware', async (_, { buffer, fileName }) => {
  const drivePath = findBootloaderDrive()
  if (!drivePath) {
    return {
      success: false,
      error: 'Bootloader drive (RPI-RP2) not found. Make sure the device is in bootloader mode.',
    }
  }

  const tmpPath = path.join(os.tmpdir(), fileName)
  const destPath = path.join(drivePath, fileName)

  try {
    fs.writeFileSync(tmpPath, Buffer.from(buffer, 'base64'))
    fs.copyFileSync(tmpPath, destPath)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
})

ipcMain.handle('get-app-version', () => app.getVersion())

// FIX: was calling /api/admin/deactivate (requires admin token — always 401).
// Now correctly calls the public /api/deactivate endpoint.
ipcMain.handle('api-deactivate', async (_, { key, machineId }) => {
  try {
    const data = await apiRequest('POST', '/api/deactivate', { key, machine_id: machineId })
    return { success: true, data }
  } catch (err) {
    if (err.status === 404) return { success: true, data: { message: 'Already deactivated' } }
    return { success: false, status: err.status, message: err.message }
  }
})

// ─── API IPC Handlers ─────────────────────────────────────────────────────────

ipcMain.handle('api-activate', async (_, { key, machineId }) => {
  try {
    const data = await apiRequest('POST', '/api/activate', { key, machine_id: machineId })
    return { success: true, data }
  } catch (err) {
    return { success: false, status: err.status, message: err.message }
  }
})

ipcMain.handle('api-validate', async (_, { key, machineId }) => {
  try {
    const data = await apiRequest('POST', '/api/activate/validate', { key, machine_id: machineId })
    return { success: true, valid: data.status === 'valid', data }
  } catch (err) {
    return { success: false, valid: false, status: err.status, message: err.message }
  }
})

ipcMain.handle('api-list-versions', async () => {
  try {
    const data = await apiRequest('GET', '/api/download/versions', null)
    return { success: true, data }
  } catch (err) {
    return { success: false, message: err.message }
  }
})

ipcMain.handle('api-download-version', async (_, { key, version }) => {
  try {
    const data = await apiRequest('POST', '/api/download', { key, version })
    const { url, file_name } = data
    if (!url) throw new Error('No download URL returned from server.')
    return { success: true, data: { url, file_name, version } }
  } catch (err) {
    return { success: false, status: err.status, message: err.message }
  }
})

// Stream a binary from a URL directly to a file, reporting progress via callback.
function streamBinaryToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
    }
    const req = client.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        streamBinaryToFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        reject(new Error(`Download failed with status ${res.statusCode}`))
        return
      }
      const contentRange = res.headers['content-range']
      const total = contentRange
        ? parseInt(contentRange.split('/')[1] || '0', 10)
        : parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      const out = fs.createWriteStream(destPath)
      res.on('data', (chunk) => {
        received += chunk.length
        if (total > 0 && onProgress) onProgress(received, total)
      })
      res.pipe(out)
      out.on('finish', resolve)
      out.on('error', reject)
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

// ─── Download & Install (Main Flow) ──────────────────────────────────────────
// Simple flow:
//   1. Detect CIRCUITPY drive
//   2. Read device UID (from boot_out.txt or serial)
//   3. Call /api/compile with key + version + uid → get UID-locked main.mpy
//   4. Download files zip (libs, presets, splash, settings.toml)
//   5. Extract files zip to CIRCUITPY
//   6. Write code.py ("import main") and main.mpy to CIRCUITPY
//   7. Tell user to unplug/replug

ipcMain.handle('download-and-flash', async (event, { key, version }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { spawn } = require('child_process')

  const sendProgress = (stage, percent, message) => {
    try {
      if (win && !win.isDestroyed()) {
        win.webContents.send('flash-progress', { stage, percent, message })
      }
    } catch {}
  }

  try {
    sendProgress('download', 0, 'Checking for device...')

    // Step 1: Detect device
    const circuitpyPath = findCircuitPyDrive()
    const bootloaderPath = findBootloaderDrive()

    if (!circuitpyPath && !bootloaderPath) {
      return {
        success: false,
        error: 'No device detected. Connect your MacroPad via USB and try again.',
      }
    }

    // If in bootloader mode, flash .uf2 first then wait for CIRCUITPY
    let targetPath = circuitpyPath
    if (!circuitpyPath && bootloaderPath) {
      // Download and flash .uf2
      sendProgress('download', 1, 'Requesting download URL...')
      const dlData = await apiRequest('POST', '/api/download', { key, version })
      if (!dlData.url) throw new Error('No firmware URL returned from server.')

      const tmpUf2 = path.join(os.tmpdir(), dlData.file_name)
      sendProgress('download', 5, 'Downloading CircuitPython firmware...')
      await streamBinaryToFile(dlData.url, tmpUf2, (received, total) => {
        const pct = 5 + Math.round((received / total) * 25)
        sendProgress('download', pct, `Downloading firmware... ${Math.round(received / 1024 / 1024 * 10) / 10} MB`)
      })

      sendProgress('flash', 32, 'Flashing CircuitPython...')
      const destUf2 = path.join(bootloaderPath, dlData.file_name)
      if (process.platform === 'darwin') {
        try { fs.writeFileSync(path.join(bootloaderPath, '.metadata_never_index'), '') } catch {}
        try {
          const fseventsdDir = path.join(bootloaderPath, '.fseventsd')
          if (!fs.existsSync(fseventsdDir)) fs.mkdirSync(fseventsdDir)
          fs.writeFileSync(path.join(fseventsdDir, 'no_log'), '')
        } catch {}
        await new Promise(r => setTimeout(r, 500))
      }

      await new Promise((resolve) => {
        const cpCmd = process.platform === 'win32'
          ? spawn('cmd', ['/c', 'copy', tmpUf2.replace(/\//g, '\\'), destUf2.replace(/\//g, '\\')], { detached: true, stdio: 'ignore' })
          : spawn('cp', [tmpUf2, destUf2], { detached: true, stdio: 'ignore' })
        cpCmd.unref()
        setTimeout(resolve, 10000)
      })
      setTimeout(() => { try { fs.unlinkSync(tmpUf2) } catch {} }, 15000)

      // Wait for CIRCUITPY to mount
      sendProgress('flash', 45, 'Waiting for device to reboot...')
      for (let i = 0; i < 75; i++) {
        await new Promise(r => setTimeout(r, 1000))
        targetPath = findCircuitPyDrive()
        if (targetPath) break
        sendProgress('flash', 45 + Math.min(i, 10), `Waiting for device to reboot... (${i + 1}s)`)
      }
      if (!targetPath) {
        return { success: false, error: 'Device did not reboot to CIRCUITPY. Press the reset button once and try again.' }
      }
    }

    // Step 2: Ensure drive is writable
    sendProgress('download', 55, 'Preparing device...')
    const writable = ensureCircuitPyWritable(targetPath)
    if (!writable) {
      return { success: false, error: 'Cannot write to device. Please allow access when prompted.' }
    }

    // Step 3: Read device UID
    sendProgress('download', 58, 'Reading device identity...')
    let deviceUID = readDeviceUID(targetPath)
    if (!deviceUID) {
      // Fallback: try serial REPL
      deviceUID = readDeviceUIDViaSerial()
    }
    if (!deviceUID) {
      return {
        success: false,
        error: 'Could not read device UID. Make sure the device is connected and boot_out.txt is present on CIRCUITPY.',
      }
    }
    console.log(`[INSTALL] Device UID: ${deviceUID}`)

    // Step 4: Request UID-locked compiled main.mpy from server
    sendProgress('compile', 62, 'Compiling firmware for your device...')
    let mpyBuffer
    try {
      mpyBuffer = await apiCompile(key, version, deviceUID)
    } catch (e) {
      return { success: false, error: `Compilation failed: ${e.message}` }
    }
    console.log(`[INSTALL] Received compiled main.mpy: ${mpyBuffer.length} bytes`)

    // Step 5: Download files zip (libs, presets, splash, settings.toml)
    sendProgress('download', 70, 'Downloading application files...')
    const dlData = await apiRequest('POST', '/api/download', { key, version })
    if (!dlData.files_url) throw new Error('No files URL returned from server.')

    const tmpZip = path.join(os.tmpdir(), `mtg-files-${version}.zip`)
    await streamBinaryToFile(dlData.files_url, tmpZip, (received, total) => {
      const pct = 70 + Math.round((received / total) * 10)
      sendProgress('download', pct, 'Downloading application files...')
    })

    // Step 6: Extract files zip to CIRCUITPY
    sendProgress('install', 82, 'Installing files to device...')
    try {
      execSync(`unzip -o "${tmpZip}" -d "${targetPath}"`, { timeout: 120000 })
    } catch (e) {
      throw new Error(`Extract failed: ${e.message}`)
    }
    try { fs.unlinkSync(tmpZip) } catch {}

    // Step 7: Write code.py (1-line loader) and main.mpy (UID-locked bytecode)
    sendProgress('install', 90, 'Writing firmware...')
    fs.writeFileSync(path.join(targetPath, 'code.py'), 'import main\n')
    fs.writeFileSync(path.join(targetPath, 'main.mpy'), mpyBuffer)

    // Clean up any old files that shouldn't be there.
    // NOTE: boot.py must NOT be deleted -- it is required to remount CIRCUITPY
    // as writable on startup, fixing the [Errno 30] read-only filesystem bug.
    // The firmware zip ships boot.py; removing it here would silently break saves.
    try { fs.unlinkSync(path.join(targetPath, 'code.mpy')) } catch {}

    sendProgress('done', 100, 'Installation complete! Unplug and replug your device to start the harmonizer.')
    return { success: true }
  } catch (err) {
    console.error('[INSTALL] Error:', err)
    sendProgress('error', 0, err.message)
    return { success: false, error: err.message }
  }
})

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0C0B25',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const win = createWindow()

  // ─── Auto-updater (production only) ────────────────────────────────────────
  if (!isDev) {
    // Verbose logging for debugging
    autoUpdater.on('checking-for-update', () => {
      console.log('[AUTO-UPDATE] Checking for update...')
      win.webContents.send('log', '[AUTO-UPDATE] Checking for update...')
    })
    autoUpdater.on('update-not-available', (info) => {
      console.log('[AUTO-UPDATE] Update not available:', info.version)
      win.webContents.send('log', `[AUTO-UPDATE] Up to date (${info.version})`)
    })
    autoUpdater.on('download-progress', (p) => {
      console.log(`[AUTO-UPDATE] Download progress: ${Math.round(p.percent)}%`)
    })

    // Notify the renderer so the Updates tab badge lights up
    autoUpdater.on('update-available', (info) => {
      console.log('[AUTO-UPDATE] Update available:', info.version)
      win.webContents.send('log', `[AUTO-UPDATE] Update available: ${info.version}`)
      win.webContents.send('app-update-available')
    })

    // Show a native dialog once the download has completed silently
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version of MTG Manager has been downloaded.',
        detail: 'Restart now to apply the update, or continue and it will be applied next time you launch.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[AUTO-UPDATE] Error:', err.message)
      win.webContents.send('log', `[AUTO-UPDATE] Error: ${err.message}`)
    })

    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[AUTO-UPDATE] checkForUpdatesAndNotify failed:', err.message)
        win.webContents.send('log', `[AUTO-UPDATE] Check failed: ${err.message}`)
      })
    }, 3000)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
