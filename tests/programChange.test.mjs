// Run: node --test tests/programChange.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import { readProgramChange, presetFromProgram } from '../src/lib/programChange.js'

test('reads a Program Change on any channel before the CC channel is known', () => {
  assert.strictEqual(readProgramChange([0xc0, 3], null), 3)
  assert.strictEqual(readProgramChange([0xc5, 0], null), 0)
})

test('only accepts Program Change on the Harmonizer CC channel once known', () => {
  assert.strictEqual(readProgramChange([0xc2, 4], 2), 4)
  assert.strictEqual(readProgramChange([0xc3, 4], 2), null)
})

test('ignores other messages and short data', () => {
  assert.strictEqual(readProgramChange([0xb0, 11, 64], null), null)
  assert.strictEqual(readProgramChange([0x90, 60, 100], null), null)
  assert.strictEqual(readProgramChange([0xc0], null), null)
  assert.strictEqual(readProgramChange(null, null), null)
  assert.strictEqual(readProgramChange(new Uint8Array([0xc0, 7]), 0), 7)
})

test('switches to the sent preset', () => {
  assert.deepStrictEqual(presetFromProgram({ program: 2, presetCount: 5, currentIdx: 0, unsaved: false }), { status: 'switch', index: 2 })
})

test('offers instead of switching when there are unsaved edits', () => {
  assert.deepStrictEqual(presetFromProgram({ program: 2, presetCount: 5, currentIdx: 0, unsaved: true }), { status: 'offer', index: 2 })
})

test('already on that preset', () => {
  assert.deepStrictEqual(presetFromProgram({ program: 1, presetCount: 5, currentIdx: 1, unsaved: true }), { status: 'current', index: 1 })
})

test('ignores an out-of-range index or an empty list', () => {
  assert.deepStrictEqual(presetFromProgram({ program: 5, presetCount: 5, currentIdx: 0, unsaved: false }), { status: 'ignore' })
  assert.deepStrictEqual(presetFromProgram({ program: -1, presetCount: 5, currentIdx: 0, unsaved: false }), { status: 'ignore' })
  assert.deepStrictEqual(presetFromProgram({ program: 0, presetCount: 0, currentIdx: 0, unsaved: false }), { status: 'ignore' })
})
