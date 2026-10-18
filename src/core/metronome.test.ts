import { describe, expect, it } from 'vitest'
import { beatSamples, clickSamples, sinceBeat } from './metronome.ts'

describe('sinceBeat', () => {
  it('counts from the last beat, back to nothing on each one', () => {
    expect(sinceBeat(10, 120, 10)).toBe(0)
    expect(sinceBeat(10, 120, 10.2)).toBeCloseTo(0.2)
    expect(sinceBeat(10, 120, 11.6)).toBeCloseTo(0.1)
  })

  it('is nothing before the first beat', () => {
    expect(sinceBeat(10, 120, 9.9)).toBeNull()
  })
})

describe('clickSamples', () => {
  it('is a few hundredths of a second that dies away', () => {
    const click = clickSamples(48000)
    expect(click.length).toBe(1680)
    const peak = (from: number, to: number) =>
      Math.max(...Array.from(click.slice(from, to), Math.abs))
    expect(peak(0, 100)).toBeGreaterThan(0.5)
    expect(peak(1500, 1680)).toBeLessThan(0.02)
  })
})

describe('beatSamples', () => {
  it('is one beat long, the click at its start and silence after', () => {
    // 120 bpm is a beat every half second.
    const beat = beatSamples(48000, 120)
    expect(beat.length).toBe(24000)
    expect(Array.from(beat.slice(0, 1680))).toEqual(Array.from(clickSamples(48000)))
    expect(beat.slice(1680).every((sample) => sample === 0)).toBe(true)
  })

  it('rounds a beat that is not a whole number of samples up, to loop at the exact time', () => {
    expect(beatSamples(48000, 87).length).toBe(33104)
  })
})
