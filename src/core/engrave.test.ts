import { describe, expect, it } from 'vitest'
import {
  breakLines,
  layout,
  ledgers,
  ottavaRuns,
  reach,
  shiftedHeads,
  signatureOf,
  stemsUp,
} from './engrave.ts'
import type { Event, Measure, Ottava, Pitch } from './notation.ts'

const pitch = (step: number): Pitch => ({ step, accidental: null })

const note = (
  steps: readonly number[],
  at = 0,
  ottava: Ottava = null,
  name: string | null = null,
): Event => ({
  kind: 'note',
  chord: { pitches: steps.map(pitch), name, ottava },
  value: 2,
  at,
})

const rest = (at: number): Event => ({ kind: 'rest', value: 2, at })

const quarters = (count: number): Measure =>
  Array.from({ length: count }, (_, i) => note([4], i * 2))

describe('engraving', () => {
  it('puts ledger lines on the even steps out to the note', () => {
    expect(ledgers(4)).toEqual([])
    expect(ledgers(-1)).toEqual([])
    expect(ledgers(-2)).toEqual([-2])
    expect(ledgers(-5)).toEqual([-2, -4])
    expect(ledgers(10)).toEqual([10])
    expect(ledgers(13)).toEqual([10, 12])
  })

  it('points stems away from the middle line', () => {
    expect(stemsUp([pitch(0)])).toBe(true)
    expect(stemsUp([pitch(8)])).toBe(false)
    expect(stemsUp([pitch(0), pitch(10)])).toBe(false)
  })

  it('moves every other head of a cluster across the stem', () => {
    expect(shiftedHeads([0, 2, 4].map(pitch))).toEqual([false, false, false])
    expect(shiftedHeads([0, 1].map(pitch))).toEqual([false, true])
    expect(shiftedHeads([0, 1, 2].map(pitch))).toEqual([false, true, false])
  })

  it('writes a key signature in the order the key adds it', () => {
    expect(signatureOf(2).map((each) => each.accidental)).toEqual(['sharp', 'sharp'])
    expect(signatureOf(-1)).toEqual([{ step: 4, accidental: 'flat' }])
    expect(signatureOf(0)).toEqual([])
  })

  it('opens a line after the clef and key signature, and spaces notes evenly', () => {
    const opening = layout(quarters(2), true, 0)
    const inside = layout(quarters(2), false, 0)
    expect(opening.xs[0]).toBeGreaterThan(inside.xs[0] ?? 0)
    const gap = (xs: readonly number[]) => (xs[1] ?? 0) - (xs[0] ?? 0)
    expect(gap(opening.xs)).toBeCloseTo(gap(inside.xs))
  })

  it('fits measures on a line while they fit, and starts another when not', () => {
    const measure = quarters(4)
    const one = layout(measure, true, 0).width
    expect(breakLines([measure, measure], one * 3, 0)).toHaveLength(1)
    expect(breakLines([measure, measure], one * 1.2, 0)).toHaveLength(2)
  })

  it('carries a measure too wide for a line over, closing only its last piece', () => {
    const wide = quarters(8)
    const lines = breakLines([wide], layout(quarters(3), true, 0).width + 2, 0)
    expect(lines.length).toBeGreaterThan(1)
    const pieces = lines.flat()
    expect(pieces.map((piece) => piece.closed)).toEqual([
      ...pieces.slice(1).map(() => false),
      true,
    ])
    expect(pieces.flatMap((piece) => piece.measure)).toEqual(wide)
  })

  it('remembers which measure each piece is from, however it was cut', () => {
    const wide = quarters(8)
    const lines = breakLines(
      [quarters(2), wide],
      layout(quarters(3), true, 0).width + 2,
      0,
    )
    const bars = lines.flat().map((piece) => piece.bar)
    expect(bars[0]).toBe(0)
    expect(bars.slice(1).every((bar) => bar === 1)).toBe(true)
    expect(bars.length).toBeGreaterThan(2)
  })

  it('clears the clef when every note sits inside the staff', () => {
    // A B on the middle line: its head and stem stay within the five lines.
    const plain = reach({ title: '', note: '', measures: [[note([4])]] })
    expect(plain.above).toBeGreaterThanOrEqual(1.9)
    expect(plain.below).toBeGreaterThanOrEqual(2.1)
  })

  it('makes room above for chord names and an 8va, and below for an 8vb', () => {
    const plain = reach({ title: '', note: '', measures: [[note([4])]] })
    const named = reach({ title: '', note: '', measures: [[note([4], 0, null, 'Em')]] })
    const up = reach({ title: '', note: '', measures: [[note([4], 0, '8va')]] })
    const down = reach({ title: '', note: '', measures: [[note([4], 0, '8vb')]] })
    expect(named.named).toBe(true)
    expect(named.above).toBeGreaterThan(plain.above)
    expect(up.above).toBeGreaterThan(plain.above)
    expect(down.below).toBeGreaterThan(plain.below)
  })

  it('brackets notes under one 8va together, rests between them and all', () => {
    const measure: Measure = [
      note([4], 0, '8va'),
      rest(2),
      note([4], 4, '8va'),
      note([4], 6, null),
    ]
    expect(ottavaRuns(measure)).toEqual([{ ottava: '8va', from: 0, to: 2 }])
    expect(ottavaRuns([note([4], 0, '8va'), note([4], 2, '8vb')])).toEqual([
      { ottava: '8va', from: 0, to: 0 },
      { ottava: '8vb', from: 1, to: 1 },
    ])
  })
})
