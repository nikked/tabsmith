import { describe, expect, it } from 'vitest'
import {
  emptyBar,
  emptyScore,
  TUNINGS,
  type Bar,
  type Cell,
  type Score,
  type Tuning,
} from './model.ts'
import { renderScore } from './render.ts'

type Placement = readonly [column: number, slot: number, cell: Cell]

const place = (bar: Bar, ...placements: readonly Placement[]): Bar =>
  placements.reduce<Bar>(
    (acc, [column, slot, cell]) => ({
      columns: acc.columns.map((col, c) =>
        c === column ? col.map((existing, s) => (s === slot ? cell : existing)) : col,
      ),
    }),
    bar,
  )

const scoreOf = (tuning: Tuning, ...bars: readonly Bar[]): Score => ({
  tuning,
  bars,
  defaultBarColumns: 8,
})

const lines = (...rows: readonly string[]): string => rows.join('\n')

const STANDARD = TUNINGS[0]
const BASS = TUNINGS[2]

describe('renderScore', () => {
  it('renders an empty score as one padded column per position', () => {
    expect(renderScore(emptyScore())).toBe(
      lines(
        'e|---------------|',
        'B|---------------|',
        'G|---------------|',
        'D|---------------|',
        'A|---------------|',
        'E|---------------|',
      ),
    )
  })

  it('widens a column to fit a multi-digit fret', () => {
    const score = scoreOf(
      STANDARD,
      place(emptyBar(3, 6), [1, 2, { kind: 'fret', fret: 12 }]),
    )
    expect(renderScore(score)).toBe(
      lines('e|------|', 'B|------|', 'G|--12--|', 'D|------|', 'A|------|', 'E|------|'),
    )
  })

  it('sizes columns to links and decorations (SPEC.md §3 worked example)', () => {
    const score = scoreOf(
      STANDARD,
      place(
        emptyBar(8, 6),
        [0, 2, { kind: 'fret', fret: 7 }],
        [1, 2, { kind: 'fret', fret: 9, link: 'h' }],
        [5, 1, { kind: 'fret', fret: 12, decoration: { kind: '~' } }],
      ),
    )
    expect(renderScore(score)).toBe(
      lines(
        'e|------------------|',
        'B|-----------12~----|',
        'G|7-h9--------------|',
        'D|------------------|',
        'A|------------------|',
        'E|------------------|',
      ),
    )
  })

  it('renders a bend with and without a target', () => {
    const score = scoreOf(
      STANDARD,
      place(
        emptyBar(4, 6),
        [0, 2, { kind: 'fret', fret: 7, decoration: { kind: 'b' } }],
        [2, 2, { kind: 'fret', fret: 7, decoration: { kind: 'b', to: 9 } }],
      ),
    )
    expect(renderScore(score)).toBe(
      lines(
        'e|----------|',
        'B|----------|',
        'G|7b---7b9--|',
        'D|----------|',
        'A|----------|',
        'E|----------|',
      ),
    )
  })

  it('keeps a chord aligned when one of its notes carries a technique', () => {
    const score = scoreOf(
      STANDARD,
      place(
        emptyBar(3, 6),
        [1, 2, { kind: 'mute' }],
        [1, 3, { kind: 'fret', fret: 5, decoration: { kind: '~' } }],
        [1, 4, { kind: 'fret', fret: 5 }],
        [1, 5, { kind: 'fret', fret: 3 }],
      ),
    )
    expect(renderScore(score)).toBe(
      lines('e|------|', 'B|------|', 'G|--x---|', 'D|--5~--|', 'A|--5---|', 'E|--3---|'),
    )
  })

  it('renders a four-string bass score as four lines', () => {
    const score = scoreOf(
      BASS,
      place(
        emptyBar(4, 4),
        [0, 3, { kind: 'fret', fret: 3 }],
        [2, 0, { kind: 'fret', fret: 12 }],
      ),
    )
    expect(renderScore(score)).toBe(
      lines('G|----12--|', 'D|--------|', 'A|--------|', 'E|3-------|'),
    )
  })

  it('counts the label prefix against maxWidth when packing bars', () => {
    const score = scoreOf(STANDARD, emptyBar(8, 6), emptyBar(8, 6), emptyBar(8, 6))

    const packedTwo = renderScore(score, { maxWidth: 34 })
    expect(packedTwo.split('\n')[0]).toBe('e|---------------|---------------|')
    expect(packedTwo.split('\n')[0]).toHaveLength(34)
    expect(packedTwo.split('\n\n')).toHaveLength(2)

    // 33 leaves room for one bar only; ignoring the 2-char prefix would fit two.
    const packedOne = renderScore(score, { maxWidth: 33 })
    expect(packedOne.split('\n')[0]).toBe('e|---------------|')
    expect(packedOne.split('\n\n')).toHaveLength(3)
  })

  it('gives a bar wider than maxWidth a system to itself', () => {
    const score = scoreOf(STANDARD, emptyBar(8, 6), emptyBar(1, 6))
    const systems = renderScore(score, { maxWidth: 5 }).split('\n\n')
    expect(systems).toHaveLength(2)
    expect(systems[0]?.split('\n')[0]).toBe('e|---------------|')
    expect(systems[1]?.split('\n')[0]).toBe('e|-|')
  })
})

describe('column spacing', () => {
  const onG = (...frets: readonly (number | null)[]): string => {
    const placements = frets.flatMap((fret, column): readonly Placement[] =>
      fret === null ? [] : [[column, 2, { kind: 'fret', fret }] as const],
    )
    const bar = place(emptyBar(frets.length, 6), ...placements)
    return renderScore(scoreOf(STANDARD, bar)).split('\n')[2] ?? ''
  }

  it('never lets two frets run together', () => {
    expect(onG(2, 2)).toBe('G|2-2|')
    expect(onG(12, 2)).toBe('G|12-2|')
    expect(onG(2, 12)).toBe('G|2-12|')
    expect(onG(12, 12)).toBe('G|12-12|')
  })

  it('keeps an empty column distinct from the gap between two notes', () => {
    expect(onG(2, 2)).toBe('G|2-2|')
    expect(onG(2, null, 2)).toBe('G|2---2|')
    expect(onG(2, null, null, 2)).toBe('G|2-----2|')
  })

  it('shows a trailing rest as a column of its own', () => {
    expect(onG(2)).toBe('G|2|')
    expect(onG(2, null)).toBe('G|2--|')
  })

  it('pads techniques the same way', () => {
    const bar = place(
      emptyBar(3, 6),
      [0, 2, { kind: 'fret', fret: 2 }],
      [1, 2, { kind: 'mute' }],
      [2, 2, { kind: 'fret', fret: 9, link: 'h' }],
    )
    expect(renderScore(scoreOf(STANDARD, bar)).split('\n')[2]).toBe('G|2-x-h9|')
  })

  it('pads a bend and its target', () => {
    const bar = place(
      emptyBar(2, 6),
      [0, 2, { kind: 'fret', fret: 7, decoration: { kind: 'b', to: 9 } }],
      [1, 2, { kind: 'fret', fret: 2 }],
    )
    expect(renderScore(scoreOf(STANDARD, bar)).split('\n')[2]).toBe('G|7b9-2|')
  })

  it('leaves a bar boundary to do its own separating', () => {
    const score = scoreOf(
      STANDARD,
      place(emptyBar(1, 6), [0, 2, { kind: 'fret', fret: 2 }]),
      place(emptyBar(1, 6), [0, 2, { kind: 'fret', fret: 2 }]),
    )
    expect(renderScore(score)).toBe(
      lines('e|-|-|', 'B|-|-|', 'G|2|2|', 'D|-|-|', 'A|-|-|', 'E|-|-|'),
    )
  })
})
