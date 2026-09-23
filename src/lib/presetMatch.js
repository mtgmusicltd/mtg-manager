/*
  Work out which preset the Harmonizer is on from what it plays.

  The firmware never sends its preset index; a key press only gives four
  intervals (CC 11–14). So on each decoded press:
    - if the selected preset has a key with those intervals, carry on;
    - otherwise find every preset with such a key, intersect with the
      candidates from previous presses, and when one remains, switch.
  All-zero presses carry no information (all-zero keys are common) and
  leave the candidate set untouched.

  Plain JS so the same file runs in the renderer and under `node --test`.
*/

function sameVoices(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

export function isAllZero(intervals) {
  return intervals.every(v => v === 0)
}

/** True when some key of `preset` has exactly these four intervals. */
export function presetHasKey(preset, intervals) {
  if (!preset || !preset.keys) return false
  for (let hw = 0; hw < 12; hw++) {
    const voices = preset.keys[String(hw)] ?? [0, 0, 0, 0]
    if (sameVoices(voices, intervals)) return true
  }
  return false
}

/**
 * @param {object} args
 * @param {Array<{name: string, keys: Record<string, number[]>}>} args.presets
 * @param {number[]} args.intervals   decoded semitones A–D for the press
 * @param {number} args.currentIdx    preset selected in the Manager
 * @param {number[] | null} args.candidates  candidate preset indexes from earlier presses
 * @param {boolean} args.unsaved      the Manager has unsaved edits
 * @returns {{ status: 'current' | 'switch' | 'offer' | 'ambiguous' | 'none', candidates: number[] | null, index?: number }}
 *   current   - the selected preset explains the press (candidates reset)
 *   switch    - exactly one other preset matches; safe to select it
 *   offer     - exactly one matches but there are unsaved edits; ask first
 *   ambiguous - several presets still match; wait for another press
 *   none      - nothing matches
 */
export function matchPreset({ presets, intervals, currentIdx, candidates, unsaved }) {
  if (isAllZero(intervals)) {
    return { status: 'current', candidates: candidates ?? null }
  }
  if (presetHasKey(presets[currentIdx], intervals)) {
    return { status: 'current', candidates: null }
  }

  const fresh = []
  presets.forEach((p, i) => { if (i !== currentIdx && presetHasKey(p, intervals)) fresh.push(i) })
  if (fresh.length === 0) return { status: 'none', candidates: null }

  let hits = fresh
  if (candidates && candidates.length > 0) {
    const narrowed = fresh.filter(i => candidates.includes(i))
    // An empty intersection means the device moved on; start again from this press.
    if (narrowed.length > 0) hits = narrowed
  }

  if (hits.length === 1) {
    return { status: unsaved ? 'offer' : 'switch', candidates: hits, index: hits[0] }
  }
  return { status: 'ambiguous', candidates: hits }
}
