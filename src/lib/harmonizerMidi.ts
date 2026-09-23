import type { Preset } from '../types/electron'

/*
  How the Harmonizer talks to us (read from firmware harmonizer_v1.1.2.py):

  - On a key press in PLAY mode it sends four Control Changes, CC 11–14,
    one per voice A–D, on its USB MIDI port. Nothing identifies the key.
  - In "MTG MIDI Harmonizer plugin" mode the value is  semitones + 64.
  - In "HX Stomp" mode the value comes from a lookup table (HX_CC_TABLE),
    followed by CC 15 (bypass) which we ignore.
  - The encoder sends its own CC (default 20); ignored here.

  So the only way to know which key was pressed is to decode the four
  values and match them to a key in the preset that is currently loaded.
*/

export const CC_FIRST = 11
export const CC_LAST = 14

export type Intervals = [number, number, number, number]
export type CcValues = [number, number, number, number]

// Mirror of HX_CC_TABLE in the firmware (semitone → CC value).
const HX_CC_TABLE: Record<number, number> = {
  [-24]: 0, [-23]: 3, [-22]: 6, [-21]: 8, [-20]: 11, [-19]: 14, [-18]: 16, [-17]: 19, [-16]: 22, [-15]: 24,
  [-14]: 27, [-13]: 30, [-12]: 32, [-11]: 35, [-10]: 38, [-9]: 40, [-8]: 43, [-7]: 45, [-6]: 48, [-5]: 51,
  [-4]: 53, [-3]: 56, [-2]: 59, [-1]: 61, 0: 64, 1: 67, 2: 69, 3: 72, 4: 75, 5: 77, 6: 80, 7: 83, 8: 85,
  9: 88, 10: 90, 11: 93, 12: 96, 13: 98, 14: 101, 15: 104, 16: 106, 17: 109, 18: 112, 19: 114, 20: 117,
  21: 120, 22: 122, 23: 125, 24: 127,
}
const HX_CC_INVERSE: Record<number, number> = Object.fromEntries(
  Object.entries(HX_CC_TABLE).map(([semi, cc]) => [cc, Number(semi)]),
)

export type DeviceMode = 'plugin' | 'hx'

/** presets.json carries the firmware's mode string; "HX Stomp" uses the lookup table. */
export function modeFromPresets(mode: string | undefined): DeviceMode {
  return mode === 'HX Stomp' ? 'hx' : 'plugin'
}

function decodeOne(cc: number, mode: DeviceMode): number {
  if (mode === 'hx') {
    if (cc in HX_CC_INVERSE) return HX_CC_INVERSE[cc]
    // Firmware falls back to a linear map for values outside the table
    return Math.max(-24, Math.min(24, Math.round((cc * 48) / 127 - 24)))
  }
  return Math.max(-24, Math.min(24, cc - 64))
}

export function decodeCc(values: CcValues, mode: DeviceMode): Intervals {
  return values.map(v => decodeOne(v, mode)) as Intervals
}

function sameIntervals(a: Intervals, b: readonly number[]) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** Hardware key numbers (0–11) in the preset whose four voices equal `intervals`. */
export function matchKeys(intervals: Intervals, preset: Preset | null): number[] {
  if (!preset) return []
  const hits: number[] = []
  for (let hw = 0; hw < 12; hw++) {
    const voices = preset.keys[String(hw)] ?? [0, 0, 0, 0]
    if (sameIntervals(intervals, voices)) hits.push(hw)
  }
  return hits
}

export interface LiveMatch {
  intervals: Intervals
  mode: DeviceMode
  /** Hardware keys that match; empty when the values fit no key in this preset. */
  hwKeys: number[]
}

/**
 * Decode four CC values against the loaded preset. Tries the mode recorded in
 * presets.json first, then the other encoding, and keeps whichever matches a key.
 */
export function resolveLive(values: CcValues, preferred: DeviceMode, preset: Preset | null): LiveMatch {
  const first = decodeCc(values, preferred)
  const firstHits = matchKeys(first, preset)
  if (firstHits.length > 0) return { intervals: first, mode: preferred, hwKeys: firstHits }
  const other: DeviceMode = preferred === 'hx' ? 'plugin' : 'hx'
  const second = decodeCc(values, other)
  const secondHits = matchKeys(second, preset)
  if (secondHits.length > 0) return { intervals: second, mode: other, hwKeys: secondHits }
  return { intervals: first, mode: preferred, hwKeys: [] }
}
