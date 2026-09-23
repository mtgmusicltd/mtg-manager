// Run: node --test tests/circuitpyMount.test.cjs
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { parseDiskutilInfo, makeCircuitPyWritable, MESSAGES } = require('../electron/circuitpyMount.cjs')

// Trimmed from real `diskutil info /Volumes/CIRCUITPY` output, 23 Sep 2026,
// Harmonizer in normal mode (boot.py ran).
const REAL_NORMAL_MODE = `
   Device Identifier:         disk6s1
   Device Node:               /dev/disk6s1
   Whole:                     No
   Volume Name:               CIRCUITPY
   Mounted:                   Yes
   Mount Point:               /Volumes/CIRCUITPY
   Media Read-Only:           Yes
   Volume Read-Only:          Yes (read-only mount flag set)
`

function infoText({ mounted, mountPoint = '/Volumes/CIRCUITPY', mediaRO = false, volumeRO = false }) {
  return [
    '   Device Node:               /dev/disk6s1',
    `   Mounted:                   ${mounted ? 'Yes' : 'No'}`,
    mounted ? `   Mount Point:               ${mountPoint}` : '   Mount Point:               ',
    `   Media Read-Only:           ${mediaRO ? 'Yes' : 'No'}`,
    `   Volume Read-Only:          ${volumeRO ? 'Yes (read-only mount flag set)' : 'No'}`,
  ].join('\n')
}

// A fake Mac: tracks whether the drive is mounted and writable.
function fakeMac({ mediaRO = false, mountWorksAfter = 1, unmountThrows = false } = {}) {
  const state = { mounted: true, writable: false, mountCalls: 0, calls: [] }
  const run = (cmd, args) => {
    state.calls.push([cmd, ...args].join(' '))
    assert.strictEqual(cmd, 'diskutil')
    const [verb] = args
    if (verb === 'info') {
      if (!state.mounted && args[1] === '/Volumes/CIRCUITPY') throw new Error('Could not find disk')
      return infoText({ mounted: state.mounted, mediaRO, volumeRO: !state.writable })
    }
    if (verb === 'unmount') {
      if (unmountThrows) throw new Error('Unmount failed: busy')
      state.mounted = false
      return ''
    }
    if (verb === 'mount') {
      state.mountCalls++
      if (state.mountCalls < mountWorksAfter) throw new Error('mount failed')
      state.mounted = true
      state.writable = !mediaRO
      return ''
    }
    throw new Error('unexpected ' + verb)
  }
  const isWritable = () => state.mounted && state.writable
  return { state, deps: { run, isWritable, sleep: () => {} } }
}

test('parses real diskutil output from the Harmonizer in normal mode', () => {
  assert.deepStrictEqual(parseDiskutilInfo(REAL_NORMAL_MODE), {
    deviceNode: '/dev/disk6s1',
    mounted: true,
    mountPoint: '/Volumes/CIRCUITPY',
    mediaReadOnly: true,
    volumeReadOnly: true,
  })
})

test('parses an unmounted volume', () => {
  const info = parseDiskutilInfo(infoText({ mounted: false }))
  assert.strictEqual(info.mounted, false)
  assert.strictEqual(info.mountPoint, null)
  assert.strictEqual(info.deviceNode, '/dev/disk6s1')
})

test('does nothing when the drive is already writable', () => {
  const { state, deps } = fakeMac()
  state.writable = true
  assert.deepStrictEqual(makeCircuitPyWritable('/Volumes/CIRCUITPY', deps), { ok: true, mountPoint: '/Volumes/CIRCUITPY' })
  assert.deepStrictEqual(state.calls, [])
})

test('media read-only (boot.py): never unmounts, explains bootloader mode', () => {
  const { state, deps } = fakeMac({ mediaRO: true })
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.reason, 'media-read-only')
  assert.strictEqual(r.message, MESSAGES['media-read-only'])
  assert.strictEqual(state.mounted, true)
  assert.ok(!state.calls.some(c => c.includes('unmount')))
})

test('volume read-only on writable media: diskutil remount makes it writable', () => {
  const { state, deps } = fakeMac()
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.deepStrictEqual(r, { ok: true, mountPoint: '/Volumes/CIRCUITPY' })
  assert.strictEqual(state.mounted, true)
  assert.ok(state.calls.includes('diskutil mount /dev/disk6s1'))
  assert.ok(!state.calls.some(c => c.includes('mount_msdos')))
})

test('retries diskutil mount so the drive is not left unmounted', () => {
  const { state, deps } = fakeMac({ mountWorksAfter: 3 })
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(state.mounted, true)
  assert.strictEqual(state.mountCalls, 3)
})

test('reports clearly if the drive never comes back', () => {
  const { state, deps } = fakeMac({ mountWorksAfter: 99 })
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.reason, 'unmounted')
  assert.strictEqual(r.message, MESSAGES.unmounted)
  assert.strictEqual(state.mounted, false)
})

test('a refused unmount leaves the drive mounted and reports it', () => {
  const { state, deps } = fakeMac({ unmountThrows: true })
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.reason, 'still-read-only')
  assert.strictEqual(state.mounted, true)
})

test('no device node: gives up without touching anything', () => {
  const deps = { run: () => { throw new Error('no such volume') }, isWritable: () => false, sleep: () => {} }
  const r = makeCircuitPyWritable('/Volumes/CIRCUITPY', deps)
  assert.strictEqual(r.reason, 'no-device')
})

test('messages follow the house tone', () => {
  for (const m of Object.values(MESSAGES)) {
    assert.ok(!/please|successfully|!/i.test(m), m)
  }
})
