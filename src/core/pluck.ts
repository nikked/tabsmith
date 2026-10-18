/**
 * A plucked string, by Karplus–Strong: a burst of noise the length of one
 * period, played over and over while each pass is averaged with its neighbour,
 * which takes the bright edges off it the way a real string loses its high
 * overtones first. Pure, with its noise from a seeded source, so the same note
 * is always the same samples.
 */

/** A note's frequency in Hz from its MIDI number, A4 = 69 = 440 Hz. */
export const frequencyOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

// A small seeded random source (mulberry32): the same seed, the same noise.
const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// How much of each pass survives: under 1, so the note dies away.
const DECAY = 0.996
// The last stretch fades out, so a note cut off at the end does not click.
const FADE_SECONDS = 0.05

export const pluck = (
  frequency: number,
  sampleRate: number,
  seconds: number,
  seed = 1,
): Float32Array<ArrayBuffer> => {
  const random = seeded(seed)
  const period = Math.max(2, Math.round(sampleRate / frequency))
  // Noise softened once before it starts, a pick rather than a click.
  const raw = Array.from({ length: period }, () => random() * 2 - 1)
  const line = Float32Array.from(raw, (value, i) => (value + (raw[i - 1] ?? value)) / 2)
  const length = Math.round(sampleRate * seconds)
  const out = new Float32Array(length)
  const fade = Math.min(length, Math.round(sampleRate * FADE_SECONDS))
  for (let i = 0; i < length; i++) {
    const at = i % period
    const next = (at + 1) % period
    const sample = line[at] ?? 0
    out[i] = i < length - fade ? sample : sample * ((length - i) / fade)
    line[at] = DECAY * 0.5 * (sample + (line[next] ?? 0))
  }
  return out
}
