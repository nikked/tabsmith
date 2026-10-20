import { describe, expect, it } from 'vitest'
import { frequencyOf, noteTone } from './tone.ts'

const peak = (samples: Float32Array, from: number, to: number) =>
  Math.max(...Array.from(samples.slice(from, to), Math.abs))

// How much of `frequency` there is in the samples from `from` to `to`.
const strength = (
  samples: Float32Array,
  rate: number,
  frequency: number,
  from: number,
  to: number,
) => {
  const parts = Array.from(samples.slice(from, to), (x, i) => {
    const angle = (2 * Math.PI * frequency * (from + i)) / rate
    return [x * Math.cos(angle), x * Math.sin(angle)] as const
  })
  const re = parts.reduce((sum, [x]) => sum + x, 0)
  const im = parts.reduce((sum, [, y]) => sum + y, 0)
  return Math.hypot(re, im) / (to - from)
}

describe('frequencyOf', () => {
  it('puts A4 at 440 Hz and an octave at twice the frequency', () => {
    expect(frequencyOf(69)).toBe(440)
    expect(frequencyOf(81)).toBeCloseTo(880)
    expect(frequencyOf(40)).toBeCloseTo(82.41, 2)
  })
})

describe('noteTone', () => {
  const rate = 8000

  it('lasts as long as asked and starts from silence', () => {
    const tone = noteTone(440, rate, 1)
    expect(tone).toHaveLength(8000)
    expect(Math.abs(tone[0] ?? 1)).toBeLessThan(0.001)
  })

  it('rises in a moment to near full scale, never past it, then dies away', () => {
    const tone = noteTone(440, rate, 2)
    expect(peak(tone, 100, 400)).toBeGreaterThan(0.8)
    expect(peak(tone, 0, tone.length)).toBeLessThanOrEqual(1)
    expect(peak(tone, 12000, 12400)).toBeLessThan(peak(tone, 100, 400) / 10)
  })

  it('fades to nothing at the very end', () => {
    expect(Math.abs(noteTone(440, rate, 0.5).at(-1) ?? 1)).toBeLessThan(0.01)
  })

  it('repeats once a cycle, the cycle being the note', () => {
    // 200 Hz at 8000 a second is a cycle every 40 samples.
    const tone = noteTone(200, rate, 0.2)
    const alike = (shift: number) =>
      Array.from(
        tone.slice(200, 1000),
        (x, i) => x * (tone[200 + i + shift] ?? 0),
      ).reduce((sum, x) => sum + x, 0)
    expect(alike(40)).toBeGreaterThan(alike(20))
    expect(alike(40)).toBeGreaterThan(0.8 * alike(0))
  })

  // A phone's speaker plays little below a few hundred Hz, so a low string is
  // heard by its overtones.
  it('has overtones above the note, the higher ones dying away sooner', () => {
    const tone = noteTone(110, rate, 2)
    const at = (multiple: number, from: number) =>
      strength(tone, rate, 110 * multiple, from, from + 800)
    expect(at(3, 100)).toBeGreaterThan(at(1, 100) / 5)
    expect(at(3, 6000) / at(1, 6000)).toBeLessThan(at(3, 100) / at(1, 100) / 2)
  })
})
