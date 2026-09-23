'use strict'

// Extracts the firmware files ZIP onto CIRCUITPY without touching the
// customer's presets. The ZIP ships a default presets.json for fresh devices;
// extracting it over an existing one used to wipe the customer's presets on
// every firmware update.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

// Files on the device that belong to the customer once they exist.
const CUSTOMER_FILES = ['presets.json']

// Firmware 1.1.3 ships its factory presets as presets.default.json. It isn't
// the customer's file: only the ZIP may replace it, and nothing here deletes it.
// The Manager reads it only when presets.json is missing, and never writes it.
const DEFAULT_PRESETS_FILE = 'presets.default.json'

/** Which presets file to read from the device: presets.json, else the factory defaults. */
function presetsFileToRead(drivePath) {
  const own = path.join(drivePath, 'presets.json')
  if (fs.existsSync(own)) return { path: own, isDefault: false }
  const factory = path.join(drivePath, DEFAULT_PRESETS_FILE)
  if (fs.existsSync(factory)) return { path: factory, isDefault: true }
  return { path: own, isDefault: false }
}

function extractFirmwareFiles(zipPath, targetPath, { backupDir = null, log = console.log } = {}) {
  const kept = []
  for (const name of CUSTOMER_FILES) {
    const p = path.join(targetPath, name)
    if (fs.existsSync(p)) kept.push({ name, data: fs.readFileSync(p) })
  }

  // Safety copy off the device before anything is written to it.
  if (backupDir && kept.length) {
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    for (const k of kept) fs.writeFileSync(path.join(backupDir, `${stamp}-${k.name}`), k.data)
  }

  const args = ['-o', zipPath, '-d', targetPath]
  if (kept.length) args.push('-x', ...kept.map(k => k.name))
  execFileSync('unzip', args, { timeout: 120000 })

  // Put back anything that still changed, byte for byte.
  for (const k of kept) {
    const p = path.join(targetPath, k.name)
    const now = fs.existsSync(p) ? fs.readFileSync(p) : null
    if (!now || !now.equals(k.data)) {
      fs.writeFileSync(p, k.data)
      log(`[INSTALL] Restored the customer's ${k.name}`)
    }
  }

  return { kept: kept.map(k => k.name) }
}

module.exports = { extractFirmwareFiles, presetsFileToRead, CUSTOMER_FILES, DEFAULT_PRESETS_FILE }
