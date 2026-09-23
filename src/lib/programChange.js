/*
  Preset tracking from MIDI Program Change (firmware 1.1.3+, MTG mode only).

  The firmware sends Program Change, program = preset_index (0-based), on the
  same channel as its CC 11–14 whenever the active preset changes and once at
  start-up. Older firmware never sends it, so key-press inference
  (presetMatch.js) stays in place alongside this.

  Plain JS so the same file runs in the renderer and under `node --test`.
*/

/**
 * Read a Program Change from a raw MIDI message.
 * @param {ArrayLike<number> | null | undefined} data
 * @param {number | null} ccChannel  channel (0–15) the Harmonizer's CC 11–14 came on, if seen yet
 * @returns {number | null} the program number, or null if this isn't one we should act on
 */
export function readProgramChange(data, ccChannel) {
  if (!data || data.length < 2) return null
  if ((data[0] & 0xf0) !== 0xc0) return null
  const channel = data[0] & 0x0f
  // Once we know the Harmonizer's channel, ignore Program Change from any other.
  if (ccChannel !== null && ccChannel !== undefined && channel !== ccChannel) return null
  const program = data[1]
  if (!Number.isInteger(program) || program < 0 || program > 127) return null
  return program
}

/**
 * Decide what the Presets page does with a Program Change.
 * Same rules as key-press auto-detect: switch, but never away from unsaved edits.
 * @param {object} args
 * @param {number} args.program       preset index sent by the Harmonizer
 * @param {number} args.presetCount   number of presets loaded in the Manager
 * @param {number} args.currentIdx    preset selected in the Manager
 * @param {boolean} args.unsaved      the Manager has unsaved edits
 * @returns {{ status: 'current' | 'switch' | 'offer' | 'ignore', index?: number }}
 *   current - already on that preset
 *   switch  - select it
 *   offer   - there are unsaved edits; ask first
 *   ignore  - index out of range (or no presets loaded)
 */
export function presetFromProgram({ program, presetCount, currentIdx, unsaved }) {
  if (!Number.isInteger(program) || program < 0 || program >= presetCount) return { status: 'ignore' }
  if (program === currentIdx) return { status: 'current', index: program }
  return { status: unsaved ? 'offer' : 'switch', index: program }
}
