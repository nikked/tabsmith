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
  const click = clickSamples(48000)
  const peak = (from: number, to: number) =>
    Math.max(...Array.from(click.slice(from, to), Math.abs))

  it('is under a tenth of a second that dies away to nothing', () => {
    expect(click.length).toBe(3840)
    expect(peak(0, 100)).toBeGreaterThan(0.5)
    expect(peak(3600, 3840)).toBeLessThan(0.02)
  })

  it('still sounds 30 to 40 ms in, the stretch over which the ear hears how loud', () => {
    expect(peak(1440, 1920)).toBeGreaterThan(0.1)
  })
})

describe('beatSamples', () => {
  it('is one beat long, the click at its start and silence after', () => {
    // 120 bpm is a beat every half second.
    const beat = beatSamples(48000, 120)
    expect(beat.length).toBe(24000)
    const click = clickSamples(48000)
    expect(Array.from(beat.slice(0, click.length))).toEqual(Array.from(click))
    expect(beat.slice(click.length).every((sample) => sample === 0)).toBe(true)
  })

  it('rounds a beat that is not a whole number of samples up, to loop at the exact time', () => {
    expect(beatSamples(48000, 87).length).toBe(33104)
  })
})
