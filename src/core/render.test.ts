import { describe, expect, it } from 'vitest'
import {
  emptyBar,
  emptyRow,
  emptyScore,
  emptySong,
  TUNINGS,
  type Bar,
  type Cell,
  type Score,
  type Song,
  type Tuning,
} from './model.ts'
import type { Row } from './model.ts'
import { renderScore, renderSong, songBlocks } from './render.ts'

type Placement = readonly [column: number, slot: number, cell: Cell]

const place = (bar: Bar, ...placements: readonly Placement[]): Bar =>
  placements.reduce<Bar>(
    (acc, [column, slot, cell]) => ({
      columns: acc.columns.map((col, c) =>
        c === column
          ? {
              ...col,
              cells: col.cells.map((existing, s) => (s === slot ? cell : existing)),
            }
          : col,
      ),
    }),
    bar,
  )

const chords = (bar: Bar, ...named: readonly (readonly [number, string])[]): Bar => ({
  columns: bar.columns.map((column, index) => {
    const match = named.find(([at]) => at === index)
    return match === undefined ? column : { ...column, chord: match[1] }
  }),
})

const rowOf = (...bars: readonly Bar[]): Row => ({ bars })

/** Most cases are one row; the row-level ones use scoreOfRows. */
const scoreOf = (tuning: Tuning, ...bars: readonly Bar[]): Score =>
  scoreOfRows(tuning, rowOf(...bars))

const scoreOfRows = (tuning: Tuning, ...rows: readonly Row[]): Score => ({
  tuning,
  rows,
  defaultBarColumns: 8,
})

const lines = (...rows: readonly string[]): string => rows.join('\n')

const STANDARD = TUNINGS[0]
const BASS = TUNINGS[2]

describe('renderScore', () => {
  it('renders the default score as one row of two bars', () => {
    expect(renderScore(emptyScore())).toBe(
      lines(
        'e|-----------------------|-----------------------|',
        'B|-----------------------|-----------------------|',
        'G|-----------------------|-----------------------|',
        'D|-----------------------|-----------------------|',
        'A|-----------------------|-----------------------|',
        'E|-----------------------|-----------------------|',
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

  it('sizes columns to links and decorations (README.md §3 worked example)', () => {
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

  it('renders one system per row, separated by a blank line', () => {
    const score = scoreOfRows(
      STANDARD,
      rowOf(emptyBar(2, 6), emptyBar(2, 6)),
      rowOf(emptyBar(1, 6)),
    )
    const systems = renderScore(score).split('\n\n')
    expect(systems).toHaveLength(2)
    expect(systems[0]?.split('\n')[0]).toBe('e|---|---|')
    expect(systems[1]?.split('\n')[0]).toBe('e|-|')
  })

  it('lets a row be as wide as it likes', () => {
    const wide = scoreOfRows(
      STANDARD,
      rowOf(...Array.from({ length: 6 }, () => emptyBar(8, 6))),
    )
    const [first] = renderScore(wide).split('\n')
    expect(renderScore(wide).split('\n\n')).toHaveLength(1)
    expect(first).toHaveLength(2 + 6 * 16)
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

describe('chord names', () => {
  it('renders them on a line below the staff at their column offsets', () => {
    const score = scoreOf(STANDARD, chords(emptyBar(8, 6), [0, 'Am'], [4, 'C']))
    expect(renderScore(score)).toBe(
      lines(
        'e|---------------|',
        'B|---------------|',
        'G|---------------|',
        'D|---------------|',
        'A|---------------|',
        'E|---------------|',
        '  Am      C',
      ),
    )
  })

  it('lets a long name run past its column instead of widening the staff', () => {
    const bar = chords(emptyBar(3, 6), [0, 'Cmaj7'], [1, 'G'])
    const rendered = renderScore(scoreOf(STANDARD, bar)).split('\n')
    expect(rendered[0]).toBe('e|-----|')
    expect(rendered[6]).toBe('  Cmaj7 G')
  })

  it('keeps a space between two names that would otherwise collide', () => {
    const bar = chords(emptyBar(4, 6), [0, 'Am'], [1, 'C'])
    const rendered = renderScore(scoreOf(STANDARD, bar)).split('\n')
    expect(rendered[0]).toBe('e|-------|')
    expect(rendered[6]).toBe('  Am C')
  })

  it('offsets a name by the bars before it in its own row', () => {
    const score = scoreOf(STANDARD, emptyBar(2, 6), chords(emptyBar(2, 6), [1, 'Am']))
    expect(renderScore(score).split('\n')[0]).toBe('e|---|---|')
    expect(renderScore(score).split('\n')[6]).toBe('        Am')
  })

  it('gives every row its own chord line, or none at all', () => {
    const score = scoreOfRows(
      STANDARD,
      rowOf(emptyBar(8, 6)),
      rowOf(chords(emptyBar(8, 6), [0, 'Am'])),
    )
    const [first, second] = renderScore(score).split('\n\n')
    expect(first?.split('\n')).toHaveLength(6)
    expect(second?.split('\n').at(-1)).toBe('  Am')
  })
})

describe('row headings', () => {
  const heading = (row: Row): readonly string[] =>
    renderScore(scoreOfRows(STANDARD, row)).split('\n')

  it('brackets the title and leaves the note as typed', () => {
    const lines = heading({
      title: 'Main Riff',
      note: '(Let notes ring into each other)',
      bars: [emptyBar(2, 6)],
    })
    expect(lines.slice(0, 3)).toEqual([
      '[Main Riff]',
      '(Let notes ring into each other)',
      'e|---|',
    ])
  })

  it('takes a note that is not a parenthetical', () => {
    expect(heading({ note: 'slow, behind the beat', bars: [emptyBar(2, 6)] })[0]).toBe(
      'slow, behind the beat',
    )
  })

  it('writes either line on its own', () => {
    expect(heading({ title: 'Main Riff', bars: [emptyBar(2, 6)] })[0]).toBe('[Main Riff]')
    expect(heading({ note: 'let ring', bars: [emptyBar(2, 6)] })[0]).toBe('let ring')
  })

  it('leaves a row with neither exactly as it was', () => {
    expect(heading({ bars: [emptyBar(2, 6)] })[0]).toBe('e|---|')
    expect(heading({ title: '', note: '', bars: [emptyBar(2, 6)] })[0]).toBe('e|---|')
  })

  it('sits at the left margin, not indented to the staff', () => {
    const bass = renderScore(
      scoreOfRows(TUNINGS[2], { title: 'Main Riff', bars: [emptyBar(2, 4)] }),
    ).split('\n')
    expect(bass[0]).toBe('[Main Riff]')
    expect(bass[1]).toBe('G|---|')
  })

  it('heads only its own row', () => {
    const rendered = renderScore(
      scoreOfRows(
        STANDARD,
        { title: 'Main Riff', bars: [emptyBar(2, 6)] },
        { bars: [emptyBar(2, 6)] },
      ),
    ).split('\n\n')
    expect(rendered[0]?.split('\n')).toHaveLength(7)
    expect(rendered[1]?.split('\n')).toHaveLength(6)
  })
})

describe('renderSong', () => {
  const song = (parts: Partial<Song>): Song => ({ ...emptySong(), ...parts })

  it('leads with the title and tempo, and skips either when blank', () => {
    expect(renderSong(song({ title: 'Endless Skies', tempo: '70 bpm' }))).toMatch(
      /^Endless Skies\n\n70 bpm\n\n/,
    )
    expect(renderSong(song({ tempo: '70 bpm' }))).toMatch(/^70 bpm\n\n/)
    expect(renderSong(song({}))).toMatch(/^\[Verse 1]\n\n/)
  })

  it('marks a repeat next to the section name', () => {
    const rendered = renderSong(
      song({ chart: [{ name: 'Intro', repeat: 4, body: 'A9 A4' }] }),
    )
    expect(rendered).toContain('[Intro] (x4)\nA9 A4')
  })

  it('breaks into the blocks a blank line separates, and joins back up', () => {
    const s = song({
      title: 'Endless Skies',
      tempo: '70 bpm',
      chart: [{ name: 'Intro', body: 'Am' }],
      tab: { ...emptyScore(), rows: [emptyRow(1, 2, 6), emptyRow(1, 2, 6)] },
    })
    const blocks = songBlocks(s)
    expect(blocks.join('\n\n')).toBe(renderSong(s))
    // Title, tempo, one section, and one block per system.
    expect(blocks).toHaveLength(5)
    expect(blocks.filter((b) => b.includes('|')).every((b) => !b.includes('\n\n'))).toBe(
      true,
    )
  })

  it('leaves out a section that holds neither a name nor a body', () => {
    const rendered = renderSong(
      song({
        chart: [
          { name: 'Intro', body: 'Am' },
          { name: '', body: '' },
        ],
      }),
    )
    expect(rendered).not.toMatch(/\n\n\n/)
  })

  it('prints no repeat for a section played once', () => {
    expect(
      renderSong(song({ chart: [{ name: 'Intro', repeat: 1, body: 'Am' }] })),
    ).toContain('[Intro]\nAm')
    expect(
      renderSong(song({ chart: [{ name: 'Intro', repeat: 2, body: 'Am' }] })),
    ).toContain('[Intro] (x2)')
  })

  it('drops the brackets from an unnamed section', () => {
    const rendered = renderSong(song({ chart: [{ name: '', body: 'Am C' }] }))
    expect(rendered).not.toContain('[]')
    expect(rendered).toContain('Am C')
  })

  it('leaves a heading alone when the section has no body', () => {
    expect(renderSong(song({ chart: [{ name: 'Intro', body: '' }] }))).toContain(
      '[Intro]\n\n',
    )
  })

  it('keeps the spacing that holds a chord above its word', () => {
    const body = 'Em      D        Em\nWe sail through endless skies'
    expect(renderSong(song({ chart: [{ name: 'Verse 1', body }] }))).toContain(body)
  })

  it('puts the tab after the chart by default, and before it when asked', () => {
    const tab = renderScore(emptyScore())
    const chart = song({ chart: [{ name: 'Intro', body: 'Am' }] })
    expect(renderSong(chart).indexOf(tab)).toBeGreaterThan(
      renderSong(chart).indexOf('[Intro]'),
    )
    const first = renderSong({ ...chart, tabFirst: true })
    expect(first.indexOf(tab)).toBeLessThan(first.indexOf('[Intro]'))
  })
})
