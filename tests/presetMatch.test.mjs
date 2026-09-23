// Run: node --test tests/presetMatch.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import { matchPreset } from '../src/lib/presetMatch.js'

function preset(name, keys) {
  const all = {}
  for (let i = 0; i < 12; i++) all[String(i)] = keys[i] ?? [0, 0, 0, 0]
  return { name, keys: all, encoder_cc: 20, encoder_value: 64, encoder_sensitivity: 3 }
}

// Three presets. Thirds is unique on [4,0,0,0]; Jazz and Jazz B share [3,7,0,0]
// but only Jazz B has [3,7,10,0].
const PRESETS = [
  preset('Thirds', { 0: [4, 0, 0, 0], 1: [3, 0, 0, 0] }),
  preset('Jazz', { 0: [3, 7, 0, 0], 1: [4, 7, 0, 0] }),
  preset('Jazz B', { 0: [3, 7, 0, 0], 1: [3, 7, 10, 0] }),
]

test('a press the selected preset explains keeps it and resets candidates', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [4, 0, 0, 0], currentIdx: 0, candidates: [1, 2], unsaved: false })
  assert.strictEqual(r.status, 'current')
  assert.strictEqual(r.candidates, null)
})

test('a unique match in another preset switches to it', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [4, 7, 0, 0], currentIdx: 0, candidates: null, unsaved: false })
  assert.strictEqual(r.status, 'switch')
  assert.strictEqual(r.index, 1)
})

test('ambiguous presses narrow across consecutive presses', () => {
  const first = matchPreset({ presets: PRESETS, intervals: [3, 7, 0, 0], currentIdx: 0, candidates: null, unsaved: false })
  assert.strictEqual(first.status, 'ambiguous')
  assert.deepStrictEqual(first.candidates, [1, 2])
  const second = matchPreset({ presets: PRESETS, intervals: [3, 7, 10, 0], currentIdx: 0, candidates: first.candidates, unsaved: false })
  assert.strictEqual(second.status, 'switch')
  assert.strictEqual(second.index, 2)
})

test('unsaved edits turn a switch into an offer', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [4, 7, 0, 0], currentIdx: 0, candidates: null, unsaved: true })
  assert.strictEqual(r.status, 'offer')
  assert.strictEqual(r.index, 1)
})

test('all-zero presses carry no information', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [0, 0, 0, 0], currentIdx: 0, candidates: [1, 2], unsaved: false })
  assert.strictEqual(r.status, 'current')
  assert.deepStrictEqual(r.candidates, [1, 2])
})

test('nothing matching reports none', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [12, 12, 12, 12], currentIdx: 0, candidates: [1], unsaved: false })
  assert.strictEqual(r.status, 'none')
  assert.strictEqual(r.candidates, null)
})

test('an empty intersection restarts from the latest press', () => {
  const r = matchPreset({ presets: PRESETS, intervals: [4, 7, 0, 0], currentIdx: 0, candidates: [2], unsaved: false })
  assert.strictEqual(r.status, 'switch')
  assert.strictEqual(r.index, 1)
})
