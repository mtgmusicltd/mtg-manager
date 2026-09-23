'use strict'
// Run: node --test tests/firmwareFiles.test.cjs
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { extractFirmwareFiles } = require('../electron/firmwareFiles.cjs')

const DEFAULTS = JSON.stringify({ mode: 'MTG', preset_index: 0, presets: [{ name: '2 Note' }] })

function makeZip(dir) {
  const src = path.join(dir, 'zipsrc')
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(src, 'presets.json'), DEFAULTS)
  fs.writeFileSync(path.join(src, 'boot.py'), 'new boot')
  fs.writeFileSync(path.join(src, 'splash.bmp'), 'new splash')
  fs.writeFileSync(path.join(src, 'lib', 'x.mpy'), 'new lib')
  const zip = path.join(dir, 'files.zip')
  execFileSync('zip', ['-qr', zip, '.'], { cwd: src })
  return zip
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-fw-'))
  const device = path.join(dir, 'CIRCUITPY')
  fs.mkdirSync(device)
  return { dir, device, zip: makeZip(dir) }
}

test('keeps the customer presets byte for byte and updates everything else', () => {
  const { dir, device, zip } = setup()
  const mine = JSON.stringify({ mode: 'HX Stomp', preset_index: 2, hx: [{ name: 'Hybrid Jazz' }], mtg: [{ name: 'Hybrid Jazz' }] })
  fs.writeFileSync(path.join(device, 'presets.json'), mine)
  fs.writeFileSync(path.join(device, 'boot.py'), 'old boot')
  const backupDir = path.join(dir, 'backups')
  const res = extractFirmwareFiles(zip, device, { backupDir, log: () => {} })
  assert.deepStrictEqual(res.kept, ['presets.json'])
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.json'), 'utf8'), mine)
  assert.strictEqual(fs.readFileSync(path.join(device, 'boot.py'), 'utf8'), 'new boot')
  assert.strictEqual(fs.readFileSync(path.join(device, 'lib', 'x.mpy'), 'utf8'), 'new lib')
  const backups = fs.readdirSync(backupDir)
  assert.strictEqual(backups.length, 1)
  assert.strictEqual(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'), mine)
})

test('a fresh device with no presets gets the defaults', () => {
  const { device, zip } = setup()
  const res = extractFirmwareFiles(zip, device, { log: () => {} })
  assert.deepStrictEqual(res.kept, [])
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.json'), 'utf8'), DEFAULTS)
})

test("works with Ed's real pre-test preset file", { skip: !fs.existsSync(path.join(os.homedir(), 'mtg-evidence/device-presets-backup-2026-09-23.json')) }, () => {
  const { device, zip } = setup()
  const real = fs.readFileSync(path.join(os.homedir(), 'mtg-evidence/device-presets-backup-2026-09-23.json'))
  fs.writeFileSync(path.join(device, 'presets.json'), real)
  extractFirmwareFiles(zip, device, { log: () => {} })
  assert.ok(fs.readFileSync(path.join(device, 'presets.json')).equals(real))
})

// ── presets.default.json (firmware 1.1.3+) ──────────────────────────────────

const { presetsFileToRead } = require('../electron/firmwareFiles.cjs')
const FACTORY = JSON.stringify({ mode: 'MTG', preset_index: 0, presets: [{ name: 'Factory' }] })

function makeZipWith(dir, files) {
  const src = path.join(dir, 'zipsrc2')
  fs.mkdirSync(src, { recursive: true })
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(src, name), body)
  const zip = path.join(dir, 'files2.zip')
  execFileSync('zip', ['-qr', zip, '.'], { cwd: src })
  return zip
}

test('reads presets.json when it exists, even alongside presets.default.json', () => {
  const { device } = setup()
  fs.writeFileSync(path.join(device, 'presets.json'), '{}')
  fs.writeFileSync(path.join(device, 'presets.default.json'), FACTORY)
  assert.deepStrictEqual(presetsFileToRead(device), { path: path.join(device, 'presets.json'), isDefault: false })
})

test('falls back to presets.default.json when presets.json is missing', () => {
  const { device } = setup()
  fs.writeFileSync(path.join(device, 'presets.default.json'), FACTORY)
  assert.deepStrictEqual(presetsFileToRead(device), { path: path.join(device, 'presets.default.json'), isDefault: true })
})

test('with neither file, points at presets.json so the read reports it missing', () => {
  const { device } = setup()
  assert.deepStrictEqual(presetsFileToRead(device), { path: path.join(device, 'presets.json'), isDefault: false })
})

test('an install whose ZIP has no presets.default.json leaves the device copy alone', () => {
  const { device, zip } = setup()
  fs.writeFileSync(path.join(device, 'presets.default.json'), FACTORY)
  extractFirmwareFiles(zip, device, { log: () => {} })
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.default.json'), 'utf8'), FACTORY)
})

test('an install whose ZIP ships presets.default.json updates it but keeps presets.json', () => {
  const { dir, device } = setup()
  const newFactory = JSON.stringify({ mode: 'MTG', preset_index: 0, presets: [{ name: 'Factory v2' }] })
  const zip = makeZipWith(dir, { 'presets.default.json': newFactory, 'boot.py': 'new boot' })
  const mine = JSON.stringify({ mode: 'MTG', preset_index: 1, presets: [{ name: 'Mine' }] })
  fs.writeFileSync(path.join(device, 'presets.json'), mine)
  fs.writeFileSync(path.join(device, 'presets.default.json'), FACTORY)
  const res = extractFirmwareFiles(zip, device, { log: () => {} })
  assert.deepStrictEqual(res.kept, ['presets.json'])
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.json'), 'utf8'), mine)
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.default.json'), 'utf8'), newFactory)
})

test('a fresh device gets presets.default.json from the ZIP and no presets.json is invented', () => {
  const { dir, device } = setup()
  const zip = makeZipWith(dir, { 'presets.default.json': FACTORY })
  extractFirmwareFiles(zip, device, { log: () => {} })
  assert.strictEqual(fs.readFileSync(path.join(device, 'presets.default.json'), 'utf8'), FACTORY)
  assert.strictEqual(fs.existsSync(path.join(device, 'presets.json')), false)
  assert.strictEqual(presetsFileToRead(device).isDefault, true)
})
