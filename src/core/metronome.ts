/**
 * A metronome's timing, kept by the audio rather than by timers: one beat of
 * sound, a click and its silence, looped by the audio itself, so neither a busy
 * page nor one sent to the background, whose timers stall, can make it drag.
 */

/** How long ago, in seconds, the last beat from `start` at `bpm` was; null before the first. */
export const sinceBeat = (start: number, bpm: number, at: number): number | null => {
  if (at < start) return null
  const period = 60 / bpm
  return (at - start) % period
}

/** The tempos the metronome can be set to, from a slow ballad to a fast punk song. */
export const SLOWEST_BPM = 30
export const FASTEST_BPM = 300

// A short tick, high enough to cut through a band without being a beep.
// Near where hearing is keenest, and left ringing for a few hundredths of a
// second: the ear judges loudness over about a tenth, so a click gone in ten
// milliseconds sounds faint at any volume, the more so from a phone's speaker.
const CLICK_HZ = 2500
const CLICK_SECONDS = 0.08

/** One click: a tone that dies away within a few hundredths of a second. */
export const clickSamples = (sampleRate: number): Float32Array<ArrayBuffer> => {
  const length = Math.round(sampleRate * CLICK_SECONDS)
  return Float32Array.from({ length }, (_, i) => {
    const t = i / sampleRate
    return Math.sin(2 * Math.PI * CLICK_HZ * t) * Math.exp(-t * 60)
  })
}

/** One beat at `bpm`: a click, then silence until the next, for the audio to loop. */
export const beatSamples = (
  sampleRate: number,
  bpm: number,
): Float32Array<ArrayBuffer> => {
  const beat = new Float32Array(Math.ceil((sampleRate * 60) / bpm))
  beat.set(clickSamples(sampleRate))
  return beat
}
