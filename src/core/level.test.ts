import { describe, expect, it } from 'vitest'
import {
  CEILING,
  HOLD,
  advance,
  aWeighting,
  doseText,
  leqDb,
  levelText,
  maxDb,
  minutesToDose,
  offsetFor,
  referenceOf,
  responseDb,
  roomTone,
  silence,
  slowDb,
  voiceTone,
  type Level,
  type Section,
} from './level.ts'

const sine = (hz: number, amplitude: number, sampleRate: number, length: number) =>
  Float64Array.from(
    { length },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate),
  )

// The filter as IIRFilterNode runs it, one section after another.
const filter = (sections: readonly Section[], input: Float64Array): Float64Array =>
  sections.reduce((signal, { feedforward: b, feedback: a }) => {
    const out = new Float64Array(signal.length)
    for (let n = 0; n < signal.length; n++) {
      let y = 0
      for (let k = 0; k < b.length; k++) y += (b[k] ?? 0) * (signal[n - k] ?? 0)
      for (let k = 1; k < a.length; k++) y -= (a[k] ?? 0) * (out[n - k] ?? 0)
      out[n] = y
    }
    return out
  }, input)

const rmsDb = (samples: Float64Array) =>
  10 * Math.log10(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)

// A steady block, fed `count` times, `step` seconds apart.
const feed = (level: Level, samples: ArrayLike<number>, count: number, step = 0.1) =>
  Array.from({ length: count }).reduce<Level>(
    (next) => advance(next, samples, next.seconds + step, step),
    level,
  )

describe('aWeighting', () => {
  // IEC 61672-1, table 3.
  const table = [
    [31.5, -39.4],
    [63, -26.2],
    [100, -19.1],
    [250, -8.6],
    [500, -3.2],
    [1000, 0],
    [2000, 1.2],
    [4000, 1.0],
  ] as const

  it.each([44100, 48000])('matches the standard to 4 kHz at %i Hz', (rate) => {
    const sections = aWeighting(rate)
    for (const [hz, db] of table)
      expect(responseDb(sections, hz, rate)).toBeCloseTo(db, 0)
  })

  it('stays within a couple of dB of the standard at 8 kHz', () => {
    expect(responseDb(aWeighting(48000), 8000, 48000)).toBeGreaterThan(-1.1 - 2)
  })

  it('weights a real signal as its response says', () => {
    const rate = 48000
    const sections = aWeighting(rate)
    // Long enough for the filter to settle, measured after it has.
    const through = (hz: number) =>
      rmsDb(filter(sections, sine(hz, 1, rate, rate)).slice(rate / 2))
    expect(through(1000) - through(100)).toBeCloseTo(19.1, 0)
  })
})

describe('advance', () => {
  const fullScaleSine = sine(1000, 1, 48000, 4800)

  it('settles on the level of a steady sound', () => {
    // A full-scale sine is -3 dB relative to full scale.
    const level = feed(silence, fullScaleSine, 100)
    expect(slowDb(level)).toBeCloseTo(-3, 1)
    expect(leqDb(level)).toBeCloseTo(-3, 1)
    expect(maxDb(level)).toBeCloseTo(-3, 1)
  })

  it('takes about a second to reach a new level on Slow', () => {
    const level = feed(silence, fullScaleSine, 10)
    // 1 − e⁻¹ of the way after one time constant.
    expect(level.slow / 0.5).toBeCloseTo(1 - Math.exp(-1), 2)
  })

  it('averages as energy, so a loud stretch counts for more than a quiet one', () => {
    const loud = feed(silence, sine(1000, 1, 48000, 4800), 100)
    const both = feed(loud, sine(1000, 0.1, 48000, 4800), 100)
    expect(leqDb(both)).toBeCloseTo(10 * Math.log10((0.5 + 0.005) / 2), 1)
  })

  it('holds the loudest moment for its hold time and then lets go', () => {
    const loud = feed(silence, fullScaleSine, 10)
    const quietSoon = feed(loud, new Float64Array(4800), (HOLD - 1) * 10)
    expect(maxDb(quietSoon)).toBeGreaterThan(-6)
    const quietLater = feed(loud, new Float64Array(4800), (HOLD + 1) * 10)
    expect(maxDb(quietLater)).toBeLessThan(-30)
  })

  it('leaves the level it was given as it was', () => {
    const before = feed(silence, fullScaleSine, 3)
    const copy = structuredClone(before)
    advance(before, fullScaleSine, 1, 0.1)
    expect(before).toEqual(copy)
  })

  it('reads nothing before anything is heard', () => {
    expect(levelText(leqDb(silence))).toBe('–')
    expect(levelText(maxDb(silence))).toBe('–')
  })
})

describe('offsetFor', () => {
  it('is what turns the raw reading into the reference', () => {
    expect(offsetFor(77.5, -53.2)).toBeCloseTo(130.7)
  })
})

describe('referenceOf', () => {
  it.each([
    ['94', 94],
    [' 77.5 ', 77.5],
    ['77,5', 77.5],
    ['30', 30],
    ['140', 140],
  ])('reads %j as %d', (text, value) => {
    expect(referenceOf(text)).toBe(value)
  })

  it.each(['', '  ', 'loud', '29.9', '140.1', '-80'])('refuses %j', (text) => {
    expect(referenceOf(text)).toBeNull()
  })
})

describe('levelText', () => {
  it('rounds to whole dB', () => {
    expect(levelText(84.4)).toBe('84')
    expect(levelText(84.5)).toBe('85')
  })

  it('claims nothing above the tested ceiling', () => {
    expect(levelText(CEILING - 0.6)).toBe(String(CEILING - 1))
    expect(levelText(CEILING)).toBe(`${CEILING}+`)
    expect(levelText(120)).toBe(`${CEILING}+`)
  })
})

describe('minutesToDose', () => {
  it('follows NIOSH: 8 hours at 85, halved every 3 dB', () => {
    expect(minutesToDose(85)).toBeCloseTo(480)
    expect(minutesToDose(88)).toBeCloseTo(240)
    expect(minutesToDose(94)).toBeCloseTo(60)
    expect(minutesToDose(100)).toBeCloseTo(15)
  })
})

describe('doseText', () => {
  it.each([
    [70, '8h+'],
    [85, '8h+'],
    [86, '6h'],
    [91, '2h'],
    [94, '1h'],
    [95, '47m'],
    [100, '15m'],
  ])('at %i dB(A) reads %s', (db, text) => {
    expect(doseText(db)).toBe(text)
  })

  it('rounds down, never promising time there is not', () => {
    // 93.9 dB(A) leaves just over an hour, which is still read as 1h.
    expect(doseText(93.9)).toBe('1h')
    expect(doseText(94.1)).toBe('58m')
  })

  it('gives only an upper bound above the ceiling', () => {
    expect(doseText(CEILING)).toBe('≤3m')
    expect(doseText(115)).toBe('≤3m')
  })
})

describe('roomTone', () => {
  it.each([
    [60, 'quiet'],
    [79.9, 'quiet'],
    [80, 'warn'],
    [84.9, 'warn'],
    [85, 'alert'],
    [Number.NEGATIVE_INFINITY, 'quiet'],
  ] as const)('at %d is %s', (db, tone) => {
    expect(roomTone(db)).toBe(tone)
  })
})

describe('voiceTone', () => {
  it.each([
    [60, 'quiet'],
    [64, 'plain'],
    [70, 'plain'],
    [73, 'plain'],
    [73.1, 'warn'],
    [76, 'warn'],
    [76.1, 'alert'],
    [Number.NEGATIVE_INFINITY, 'quiet'],
  ] as const)('at %d against 70 is %s', (db, tone) => {
    expect(voiceTone(db, 70)).toBe(tone)
  })

  it('moves with the target', () => {
    expect(voiceTone(80, 80)).toBe('plain')
    expect(voiceTone(80, 70)).toBe('alert')
  })
})
