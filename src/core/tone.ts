/**
 * The sound of a tapped note: a soft sine wave that rises in a moment and dies
 * away, made in the page rather than recorded, so there is nothing to download.
 * Pure, so it can be tested.
 */

/** A note's frequency in Hz from its MIDI number, A4 = 69 = 440 Hz. */
export const frequencyOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

const ATTACK_SECONDS = 0.012
// How fast it dies away: about a second to fall to a twentieth.
const DECAY_PER_SECOND = 3

export const sineTone = (
  frequency: number,
  sampleRate: number,
  seconds: number,
): Float32Array<ArrayBuffer> => {
  const length = Math.round(sampleRate * seconds)
  const fadeFrom = length - Math.round(sampleRate * 0.05)
  return Float32Array.from({ length }, (_, i) => {
    const t = i / sampleRate
    const rise = Math.min(1, t / ATTACK_SECONDS)
    // The last stretch fades to nothing, so a note cut off at its end does not click.
    const tail = i < fadeFrom ? 1 : (length - i) / (length - fadeFrom)
    return (
      Math.sin(2 * Math.PI * frequency * t) *
      rise *
      Math.exp(-t * DECAY_PER_SECOND) *
      tail
    )
  })
}
