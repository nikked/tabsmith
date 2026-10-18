import { describe, expect, it } from 'vitest'
import { frequencyOf, sineTone } from './tone.ts'

const peak = (samples: Float32Array, from: number, to: number) =>
  Math.max(...Array.from(samples.slice(from, to), Math.abs))

describe('frequencyOf', () => {
  it('puts A4 at 440 Hz and an octave at twice the frequency', () => {
    expect(frequencyOf(69)).toBe(440)
    expect(frequencyOf(81)).toBeCloseTo(880)
    expect(frequencyOf(40)).toBeCloseTo(82.41, 2)
  })
})

describe('sineTone', () => {
  const rate = 8000

  it('lasts as long as asked and starts from silence', () => {
    const tone = sineTone(440, rate, 1)
    expect(tone).toHaveLength(8000)
    expect(Math.abs(tone[0] ?? 1)).toBeLessThan(0.001)
  })

  it('rises in a moment, then dies away', () => {
    const tone = sineTone(440, rate, 2)
    expect(peak(tone, 100, 400)).toBeGreaterThan(0.8)
    expect(peak(tone, 12000, 12400)).toBeLessThan(peak(tone, 100, 400) / 10)
  })

  it('fades to nothing at the very end', () => {
    expect(Math.abs(sineTone(440, rate, 0.5).at(-1) ?? 1)).toBeLessThan(0.01)
  })

  it('crosses zero twice a cycle, the cycle being the note', () => {
    // 200 Hz over a tenth of a second is 20 cycles, so about 40 crossings.
    const tone = sineTone(200, rate, 0.1).slice(1)
    const crossings = tone
      .slice(1)
      .filter((x, i) => Math.sign(x) !== Math.sign(tone[i] ?? 0))
    expect(crossings.length).toBeGreaterThanOrEqual(38)
    expect(crossings.length).toBeLessThanOrEqual(41)
  })
})
