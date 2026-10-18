import { describe, expect, it } from 'vitest'
import type { Bar, Cell } from './model.ts'
import { rowPlayback, rowSeconds } from './playback.ts'

const fret = (n: number): Cell => ({ kind: 'fret', fret: n })
// One string, open at E2 = 40, so a fret is that many semitones above it.
const open = [40]
const bar = (...frets: readonly (number | null)[]): Bar => ({
  columns: frets.map((n) => ({ cells: [n === null ? null : fret(n)] })),
})

describe('rowPlayback', () => {
  // 120 bpm: a beat is half a second, so a column, an eighth, is a quarter.
  it('plays each note at its column, held until the next one', () => {
    expect(rowPlayback({ bars: [bar(0, 2, null, 3)] }, open, 120)).toEqual([
      { midi: [40], at: 0, seconds: 0.25 },
      { midi: [42], at: 0.25, seconds: 0.5 },
      { midi: [43], at: 0.75, seconds: 0.25 },
    ])
  })

  it('ends a note at the bar line, and counts on into the next bar', () => {
    expect(rowPlayback({ bars: [bar(0, null), bar(null, 5)] }, open, 120)).toEqual([
      { midi: [40], at: 0, seconds: 0.5 },
      { midi: [45], at: 0.75, seconds: 0.25 },
    ])
  })

  it('plays a column of several strings as one chord', () => {
    const chord: Bar = { columns: [{ cells: [fret(0), fret(2)] }] }
    expect(rowPlayback({ bars: [chord] }, [40, 45], 60)).toEqual([
      { midi: [40, 47], at: 0, seconds: 0.5 },
    ])
  })

  it('takes as long as all its columns, the silent ones too', () => {
    expect(rowSeconds({ bars: [bar(0, null), bar(null, null, null)] }, 120)).toBe(1.25)
  })
})
