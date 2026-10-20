/**
 * The sound of a tapped note: a tone that rises in a moment and dies away,
 * bright at first and mellower as its overtones fade, the way a plucked string
 * does. Made in the page rather than recorded, so there is nothing to download.
 * Pure, so it can be tested.
 */

/** A note's frequency in Hz from its MIDI number, A4 = 69 = 440 Hz. */
export const frequencyOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

const ATTACK_SECONDS = 0.012
// How fast it dies away: about a second to fall to a twentieth.
const DECAY_PER_SECOND = 3
// The note and five overtones, each fainter. A phone's speaker plays little
// below a few hundred Hz, so a low string a pure tone would leave all but
// silent is heard by these. Each dies away sooner the higher it is, but not
// so soon that a held note falls back to the pure tone a phone cannot play.
const OVERTONES = [1, 2, 3, 4, 5, 6] as const
const wave = (phase: number): number =>
  OVERTONES.reduce((sum, k) => sum + Math.sin(k * phase) / k, 0)
// The overtones' highest peak together, so a note reaches full scale and no further.
const PEAK = Math.max(
  ...Array.from({ length: 2000 }, (_, i) => Math.abs(wave((2 * Math.PI * i) / 2000))),
)

export const noteTone = (
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
    const phase = 2 * Math.PI * frequency * t
    const sound = OVERTONES.reduce(
      (sum, k) =>
        sum + (Math.sin(k * phase) / k) * Math.exp((-t * DECAY_PER_SECOND * (k + 1)) / 2),
      0,
    )
    return (sound / PEAK) * rise * tail
  })
}
