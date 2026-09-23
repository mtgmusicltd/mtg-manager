/*
  The Harmonizer's key LED colours, mirrored from firmware harmonizer_v1.1.2.py.

  rainbow_leds():  for i, key in enumerate(KEY_ORDER): pixels[key] = colorwheel(i * (256 // 12))
  so the i-th entry of KEY_ORDER gets hue i * 21. The Manager's grid uses the
  same KEY_ORDER (visual position i → hardware key KEY_ORDER[i]), so card i+1
  in the grid is the physical key that lights with colour i.

  The active key on the device shows white and pulses (brightness 0.25–1.0).
*/

export type Rgb = [number, number, number]

/** CircuitPython rainbowio.colorwheel, 0–255 → RGB. */
export function colorwheel(pos: number): Rgb {
  pos = pos & 0xff
  if (pos < 85) return [255 - pos * 3, pos * 3, 0]
  if (pos < 170) { pos -= 85; return [0, 255 - pos * 3, pos * 3] }
  pos -= 170
  return [pos * 3, 0, 255 - pos * 3]
}

const NUM_KEYS = 12
const HUE_STEP = Math.floor(256 / NUM_KEYS) // 21, as in the firmware

/** Colour of the key shown at visual position i (0-based; card label i + 1). */
export const KEY_COLOURS: string[] = Array.from({ length: NUM_KEYS }, (_, i) => {
  const [r, g, b] = colorwheel(i * HUE_STEP)
  return `rgb(${r}, ${g}, ${b})`
})

export const KEY_ACTIVE_COLOUR = '#FFFFFF'
