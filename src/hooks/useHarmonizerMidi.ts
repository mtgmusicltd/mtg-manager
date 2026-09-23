import { useEffect, useRef, useState } from 'react'
import { CC_FIRST, CC_LAST, type CcValues } from '../lib/harmonizerMidi'
import { readProgramChange } from '../lib/programChange'

/*
  Listens to the Harmonizer over the Web MIDI API in the renderer.
  No IPC involved: the browser asks the main process for the "midi"
  permission, which electron/main.cjs grants for the app's own origin.

  A key press on the Harmonizer arrives as four CC messages (11–14) within a few
  milliseconds. They are collected and emitted once as a single press.

  Firmware 1.1.3+ (MTG mode) also sends a Program Change with the preset index
  when the active preset changes and once at start-up. Older firmware doesn't.
*/

export type MidiAvailability =
  | 'unsupported'   // navigator.requestMIDIAccess missing
  | 'denied'        // permission refused
  | 'no-input'      // access granted, no Harmonizer input found
  | 'ready'

export interface LivePress {
  values: CcValues
  at: number       // performance.now() when the press completed
  seq: number      // increments per press so identical presses still re-render
}

export interface LiveProgram {
  index: number    // preset_index sent by the Harmonizer (0-based)
  seq: number      // increments per message so a repeat still re-renders
}

export interface HarmonizerMidiState {
  availability: MidiAvailability
  inputName: string | null
  press: LivePress | null
  program: LiveProgram | null
}

const INPUT_NAME = /macropad|circuitpython|harmonizer|mtg/i
const FLUSH_MS = 25

export function useHarmonizerMidi(enabled: boolean): HarmonizerMidiState {
  const [availability, setAvailability] = useState<MidiAvailability>('no-input')
  const [inputName, setInputName] = useState<string | null>(null)
  const [press, setPress] = useState<LivePress | null>(null)
  const [program, setProgram] = useState<LiveProgram | null>(null)

  const pending = useRef<CcValues>([64, 64, 64, 64])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const programSeq = useRef(0)
  const ccChannel = useRef<number | null>(null)   // channel the Harmonizer's CC 11–14 arrive on

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      setAvailability('unsupported')
      return
    }

    let access: MIDIAccess | null = null
    let disposed = false
    const bound = new Set<MIDIInput>()

    const onMessage = (e: MIDIMessageEvent) => {
      const data = e.data
      if (!data) return
      const pc = readProgramChange(data, ccChannel.current)
      if (pc !== null) {
        programSeq.current += 1
        setProgram({ index: pc, seq: programSeq.current })
        return
      }
      if (data.length < 3) return
      if ((data[0] & 0xf0) !== 0xb0) return           // Control Change, any channel
      const cc = data[1]
      if (cc < CC_FIRST || cc > CC_LAST) return
      ccChannel.current = data[0] & 0x0f
      pending.current[cc - CC_FIRST] = data[2]
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null
        seq.current += 1
        setPress({ values: [...pending.current] as CcValues, at: performance.now(), seq: seq.current })
      }, FLUSH_MS)
    }

    const bindInputs = () => {
      if (!access || disposed) return
      const inputs = Array.from(access.inputs.values())
      // Prefer the Harmonizer by name; fall back to every input so a renamed device still works
      const named = inputs.filter(i => INPUT_NAME.test(`${i.name ?? ''} ${i.manufacturer ?? ''}`))
      const chosen = named.length > 0 ? named : inputs
      for (const input of bound) {
        if (!chosen.includes(input)) { input.onmidimessage = null; bound.delete(input) }
      }
      for (const input of chosen) {
        if (!bound.has(input)) { input.onmidimessage = onMessage; bound.add(input) }
      }
      setInputName(chosen[0]?.name ?? null)
      setAvailability(chosen.length > 0 ? 'ready' : 'no-input')
    }

    navigator.requestMIDIAccess({ sysex: false }).then(a => {
      if (disposed) return
      access = a
      a.onstatechange = bindInputs
      bindInputs()
    }).catch(() => {
      if (!disposed) setAvailability('denied')
    })

    return () => {
      disposed = true
      if (flushTimer.current) clearTimeout(flushTimer.current)
      for (const input of bound) input.onmidimessage = null
      bound.clear()
      if (access) access.onstatechange = null
    }
  }, [enabled])

  return { availability, inputName, press, program }
}
