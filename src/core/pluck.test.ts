import { describe, expect, it } from 'vitest'
import { frequencyOf, pluck } from './pluck.ts'

const loudness = (samples: Float32Array, from: number, to: number): number =>
  Math.sqrt(samples.slice(from, to).reduce((sum, x) => sum + x * x, 0) / (to - from))

describe('frequencyOf', () => {
  it('puts A4 at 440 Hz and an octave at twice the frequency', () => {
    expect(frequencyOf(69)).toBe(440)
    expect(frequencyOf(81)).toBeCloseTo(880)
    expect(frequencyOf(40)).toBeCloseTo(82.41, 2)
  })
})

describe('pluck', () => {
  const rate = 8000

  it('lasts as long as asked', () => {
    expect(pluck(220, rate, 0.5)).toHaveLength(4000)
  })

  it('starts loud and dies away', () => {
    const note = pluck(220, rate, 1.5)
    expect(loudness(note, 0, 800)).toBeGreaterThan(0.1)
    expect(loudness(note, 10000, 11200)).toBeLessThan(loudness(note, 0, 800) / 4)
  })

  it('fades to nothing at the very end, so it never clicks off', () => {
    const note = pluck(220, rate, 0.5)
    expect(Math.abs(note.at(-1) ?? 1)).toBeLessThan(0.01)
  })

  it('repeats once a period, the period being the note', () => {
    const note = pluck(200, rate, 0.2)
    const alike = (lag: number) =>
      note.slice(0, 800).reduce((sum, x, i) => sum + x * (note[i + lag] ?? 0), 0)
    // 8000 / 200 = 40 samples: a period later it lines up, half of one it does not.
    expect(alike(40)).toBeGreaterThan(Math.abs(alike(20)) * 2)
  })

  it('is the same note every time for the same seed', () => {
    expect(pluck(330, rate, 0.1, 7)).toEqual(pluck(330, rate, 0.1, 7))
    expect(pluck(330, rate, 0.1, 7)).not.toEqual(pluck(330, rate, 0.1, 8))
  })
})
