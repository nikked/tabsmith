import { describe, expect, it } from 'vitest'
import { parseSong } from './parse.ts'
import { renderScore } from './render.ts'
import { TUNINGS, type Cell, type Row, type Score } from './model.ts'

const [STANDARD, DROP_D, BASS] = TUNINGS

const fret = (value: number, extra: Partial<Cell> = {}): Cell => ({
  kind: 'fret',
  fret: value,
  ...extra,
})

const row = (...columns: readonly (readonly (Cell | null)[])[]): Row => ({
  bars: [{ columns: columns.map((cells) => ({ cells })) }],
})

const parsed = (text: string) => {
  const result = parseSong(text)
  if (!result.ok) throw new Error(result.error)
  return result.song
}

describe('reading a tab back', () => {
  const trip = (score: Score) => parsed(renderScore(score)).tab

  it('gives back the score it was rendered from', () => {
    const score: Score = {
      tuning: STANDARD,
      defaultBarColumns: 12,
      rows: [
        {
          bars: [
            {
              columns: [
                { cells: [null, null, null, null, null, fret(0)] },
                { cells: [null, null, null, null, fret(2), null] },
                { cells: [null, null, null, null, null, null] },
                { cells: [null, null, null, fret(12), null, null] },
                { cells: [null, fret(3, { link: 'h' }), null, null, null, null] },
              ],
            },
            {
              columns: [
                { cells: [null, null, null, null, null, { kind: 'mute' }] },
                {
                  cells: [
                    null,
                    null,
                    null,
                    null,
                    null,
                    fret(7, { decoration: { kind: 'b', to: 9 } }),
                  ],
                },
                {
                  cells: [
                    fret(5, { decoration: { kind: '~' } }),
                    null,
                    null,
                    null,
                    null,
                    null,
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(trip(score).rows).toEqual(score.rows)
    expect(trip(score).tuning).toEqual(STANDARD)
  })

  it('gives back every row field: title, note, aside and chord names', () => {
    const empty = [null, null, null, null, null, null]
    const score: Score = {
      tuning: STANDARD,
      defaultBarColumns: 12,
      rows: [
        {
          title: 'Main riff',
          note: '(let the notes ring)',
          aside: 'x2\n\nthen to verse\n\n\n\nslower\nthe second time',
          bars: [
            {
              columns: [
                { cells: [null, null, null, null, null, fret(0)], chord: 'Cmaj7#11' },
                { cells: [null, null, null, null, fret(2), null], chord: 'G' },
                { cells: empty },
                { cells: empty },
                { cells: empty },
                { cells: [null, null, null, fret(12), null, null] },
              ],
            },
            {
              columns: [
                { cells: empty },
                { cells: [fret(3), null, null, null, null, null], chord: 'Em' },
              ],
            },
          ],
        },
        { note: 'no title on this one', bars: [{ columns: [{ cells: empty }] }] },
      ],
    }
    expect(trip(score)).toEqual(score)
  })

  it('keeps an empty column apart from the gap between two notes', () => {
    const spaced: Score = {
      tuning: BASS,
      defaultBarColumns: 12,
      rows: [
        row(
          [fret(2), null, null, null],
          [null, null, null, null],
          [fret(2), null, null, null],
        ),
      ],
    }
    const tight: Score = {
      tuning: BASS,
      defaultBarColumns: 12,
      rows: [row([fret(2), null, null, null], [fret(2), null, null, null])],
    }
    expect(renderScore(spaced)).not.toBe(renderScore(tight))
    expect(trip(spaced).rows[0]?.bars[0]?.columns).toHaveLength(3)
    expect(trip(tight).rows[0]?.bars[0]?.columns).toHaveLength(2)
  })
})

describe('reading a pasted page', () => {
  it('takes a chart of headings, chords and lyrics exactly as typed', () => {
    const song = parsed(
      [
        '[Verse 1]',
        'Em            D',
        'We sail through  ',
        '',
        '[Chorus] x3',
        'C  G',
      ].join('\n'),
    )
    expect(song.chart).toEqual([
      { name: 'Verse 1', body: 'Em            D\nWe sail through  ' },
      { name: 'Chorus', repeat: 3, body: 'C  G' },
    ])
  })

  it('names a row after the heading that stands alone above it', () => {
    const song = parsed(
      [
        '[Intro]',
        'e|-------|',
        'B|-------|',
        'G|-------|',
        'D|-------|',
        'A|--2-0--|',
        'E|-0-----|',
      ].join('\n'),
    )
    expect(song.tab.rows[0]?.title).toBe('Intro')
    expect(song.chart).toEqual([{ name: '', body: '' }])
  })

  it('reads one line between a heading and a staff as the row note', () => {
    const song = parsed(
      [
        '[Intro]',
        '(let ring)',
        'e|-------|',
        'B|-------|',
        'G|-------|',
        'D|-------|',
        'A|--2-0--|',
        'E|-0-----|',
      ].join('\n'),
    )
    expect(song.tab.rows[0]).toMatchObject({ title: 'Intro', note: '(let ring)' })
    expect(song.chart).toEqual([{ name: '', body: '' }])
  })

  it('leaves a heading alone when the section under it has words', () => {
    const song = parsed(
      [
        '[Verse 1]',
        'Em      D',
        'We sail through',
        'e|-------|',
        'B|-------|',
        'G|-------|',
        'D|-------|',
        'A|--2-0--|',
        'E|-0-----|',
      ].join('\n'),
    )
    expect(song.tab.rows[0]?.title).toBeUndefined()
    expect(song.tab.rows[0]?.note).toBeUndefined()
    expect(song.chart[0]).toEqual({ name: 'Verse 1', body: 'Em      D\nWe sail through' })
  })

  it('splits a system into the bars its bar lines mark', () => {
    const song = parsed(
      [
        'e|--0--|--2--|',
        'B|-----|-----|',
        'G|-----|-----|',
        'D|-----|-----|',
        'A|-----|-----|',
        'E|-----|-----|',
      ].join('\n'),
    )
    expect(song.tab.rows[0]?.bars).toHaveLength(2)
  })

  it('reads four lines as a bass and six ending on D as drop D', () => {
    const bass = parsed(['G|--5--|', 'D|-----|', 'A|--3--|', 'E|-----|'].join('\n'))
    expect(bass.tab.tuning).toEqual(BASS)

    const drop = parsed(
      ['e|-----|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'D|--0--|'].join('\n'),
    )
    expect(drop.tab.tuning).toEqual(DROP_D)
  })

  it('skips a staff whose line count is no tuning it knows', () => {
    const song = parsed(
      ['[Solo]', 'e|--0--|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|'].join('\n'),
    )
    expect(
      song.tab.rows[0]?.bars[0]?.columns.every((c) => c.cells.every((x) => x === null)),
    ).toBe(true)
  })

  it('refuses a page that mixes a guitar and a bass', () => {
    const result = parseSong(
      [
        'e|--0--|',
        'B|-----|',
        'G|-----|',
        'D|-----|',
        'A|-----|',
        'E|-----|',
        '',
        'G|--5--|',
        'D|-----|',
        'A|-----|',
        'E|-----|',
      ].join('\n'),
    )
    expect(result.ok).toBe(false)
  })

  it('refuses text with neither a chart nor a tab in it', () => {
    expect(parseSong('').ok).toBe(false)
    expect(parseSong('   \n\n  ').ok).toBe(false)
  })

  it('does not mistake a line like | x2 | for a staff', () => {
    const song = parsed('[Riff]\n| x2 |')
    expect(song.chart[0]?.body).toBe('| x2 |')
  })

  it('strips the markup a raw ultimate guitar page carries', () => {
    expect(parsed('[Verse]\n[ch]Am[/ch] [ch]C[/ch]').chart[0]?.body).toBe('Am C')
  })
})
