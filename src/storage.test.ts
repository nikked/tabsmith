import { describe, expect, it } from 'vitest'
import {
  emptyBar,
  emptyRow,
  emptyScore,
  emptySong,
  TUNINGS,
  type Score,
  type Song,
} from './core/model.ts'
import { decode, encode, filenameFor } from './storage.ts'

const [STANDARD, , BASS] = TUNINGS

const songOf = (tab: Score): Song => ({ ...emptySong(), tab })

const withCells = (): Score => ({
  ...emptyScore(),
  rows: [
    {
      bars: [
        {
          columns: emptyBar(3, 6).columns.map((column, index) => ({
            cells: column.cells.map((cell, slot) => {
              if (index === 0 && slot === 2) {
                return { kind: 'fret' as const, fret: 12 }
              }
              if (index === 1 && slot === 2) {
                return {
                  kind: 'fret' as const,
                  fret: 7,
                  link: 'h' as const,
                  decoration: { kind: 'b' as const, to: 9 },
                }
              }
              if (index === 2 && slot === 5) return { kind: 'mute' as const }
              return cell
            }),
          })),
        },
      ],
    },
  ],
})

const readBack = (song: Song): Song | string => {
  const result = decode(encode(song))
  return result.ok ? result.song : result.error
}

/** The tab is the only part with a shape worth breaking, so cases vary just that. */
const stored = (tab: unknown, version: unknown = 4): string =>
  JSON.stringify({ version, song: { ...emptySong(), tab } })

const rejects = (raw: string): string => {
  const result = decode(raw)
  if (result.ok) throw new Error('expected a rejection')
  return result.error
}

describe('encode / decode', () => {
  it('round-trips an empty song', () => {
    expect(readBack(emptySong())).toEqual(emptySong())
  })

  it('round-trips frets, links, bends and mutes', () => {
    expect(readBack(songOf(withCells()))).toEqual(songOf(withCells()))
  })

  it('round-trips chord names', () => {
    const song = songOf({
      ...emptyScore(),
      rows: [
        {
          bars: [
            {
              columns: emptyBar(3, 6).columns.map((column, index) =>
                index === 1 ? { ...column, chord: 'Cmaj7' } : column,
              ),
            },
          ],
        },
      ],
    })
    expect(readBack(song)).toEqual(song)
  })

  it('round-trips row titles and notes', () => {
    const song = songOf({
      ...emptyScore(),
      rows: [
        { title: 'Main Riff', note: '(let ring)', bars: emptyRow(1, 4, 6).bars },
        emptyRow(1, 4, 6),
      ],
    })
    expect(readBack(song)).toEqual(song)
  })

  it('reads back a song saved before rows could be titled', () => {
    const result = decode(encode(emptySong()))
    expect(result.ok && result.song.tab.rows[0]?.title).toBeUndefined()
  })

  it('round-trips several rows of several bars', () => {
    const song = songOf({
      ...emptyScore(),
      rows: [emptyRow(3, 4, 6), emptyRow(1, 8, 6)],
    })
    expect(readBack(song)).toEqual(song)
  })

  it('round-trips a four-string bass score', () => {
    const song = songOf({ ...emptyScore(), tuning: BASS, rows: [emptyRow(1, 4, 4)] })
    expect(readBack(song)).toEqual(song)
  })

  it('round-trips a chart, a tempo and the tab placement', () => {
    const song: Song = {
      ...emptySong(),
      title: 'Endless Skies',
      tempo: '70 bpm',
      tabFirst: true,
      chart: [
        { name: 'Intro', repeat: 4, body: 'A9 A4' },
        { name: 'Verse 1', body: 'Em      D\nWe sail through  ' },
      ],
    }
    expect(readBack(song)).toEqual(song)
  })

  it('writes something a person can read in an editor', () => {
    expect(encode(emptySong())).toContain('\n  "version": 4')
  })
})

describe('decode rejects', () => {
  it('a blob that is not JSON', () => {
    expect(rejects('{ this is not json')).toBe('That file is not JSON.')
    expect(rejects('')).toBe('That file is not JSON.')
  })

  it('JSON that is not a versioned document', () => {
    expect(rejects('42')).toBe('That file is not a tabsmith song.')
    expect(rejects('[1, 2]')).toBe('That file is not a tabsmith song.')
    expect(rejects(JSON.stringify({ song: emptySong() }))).toBe(
      'That file is not a tabsmith song.',
    )
    expect(rejects(JSON.stringify({ version: '4', song: emptySong() }))).toBe(
      'That file is not a tabsmith song.',
    )
  })

  it('a version below the first one, which has no chain to migrate along', () => {
    expect(rejects(JSON.stringify({ version: 0, score: emptyScore() }))).toBe(
      'That file is not a tabsmith song.',
    )
    expect(rejects(JSON.stringify({ version: -1, score: emptyScore() }))).toBe(
      'That file is not a tabsmith song.',
    )
    expect(rejects(JSON.stringify({ version: 1.5, score: emptyScore() }))).toBe(
      'That file is not a tabsmith song.',
    )
  })

  it('numbers that are out of range or not whole', () => {
    const withFret = (fret: unknown) => ({
      ...emptyScore(),
      tuning: STANDARD,
      rows: [
        {
          bars: [
            {
              columns: [
                { cells: [{ kind: 'fret', fret }, null, null, null, null, null] },
              ],
            },
          ],
        },
      ],
    })
    expect(rejects(stored(withFret(-3.5)))).toBeTruthy()
    expect(rejects(stored(withFret(25)))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), defaultBarColumns: 0 }))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), defaultBarColumns: 8.5 }))).toBeTruthy()
    expect(
      rejects(
        JSON.stringify({
          version: 4,
          song: { ...emptySong(), chart: [{ name: 'Intro', body: '', repeat: -2.5 }] },
        }),
      ),
    ).toBeTruthy()
  })

  it('columns that do not carry one cell per string', () => {
    const short = {
      ...emptyScore(),
      tuning: STANDARD,
      rows: [{ bars: [{ columns: [{ cells: [null, null, null] }] }] }],
    }
    expect(rejects(stored(short))).toBeTruthy()
    const long = {
      ...emptyScore(),
      tuning: BASS,
      rows: [{ bars: [{ columns: [{ cells: [null, null, null, null, null, null] }] }] }],
    }
    expect(rejects(stored(long))).toBeTruthy()
  })

  it('a version this build has never heard of, by name', () => {
    expect(rejects(stored(emptyScore(), 5))).toBe(
      'That file was saved by a newer version of tabsmith.',
    )
  })

  it('a song missing its parts', () => {
    const doc = (song: unknown): string => JSON.stringify({ version: 4, song })
    expect(rejects(doc({}))).toBe('That file is not a tabsmith song.')
    expect(rejects(doc({ ...emptySong(), tempo: 70 }))).toBeTruthy()
    expect(rejects(doc({ ...emptySong(), chart: [] }))).toBeTruthy()
    expect(rejects(doc({ ...emptySong(), tab: undefined }))).toBeTruthy()
  })

  it('a section missing its parts', () => {
    const chart = (section: unknown): string =>
      JSON.stringify({ version: 4, song: { ...emptySong(), chart: [section] } })
    expect(rejects(chart({ name: 'Verse 1' }))).toBeTruthy()
    expect(rejects(chart({ name: 1, body: '' }))).toBeTruthy()
    expect(rejects(chart({ name: 'Verse 1', body: '', repeat: 'x4' }))).toBeTruthy()
  })

  it('a score missing its parts', () => {
    expect(rejects(stored({}))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), tuning: undefined }))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), rows: [] }))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), defaultBarColumns: '8' }))).toBeTruthy()
  })

  it('a tuning with no usable string labels', () => {
    expect(
      rejects(stored({ ...emptyScore(), tuning: { name: 'x', strings: [] } })),
    ).toBeTruthy()
    expect(
      rejects(stored({ ...emptyScore(), tuning: { name: 'x', strings: [1, 2] } })),
    ).toBeTruthy()
  })

  it('a bar with no columns, and a row with no bars', () => {
    expect(
      rejects(stored({ ...emptyScore(), rows: [{ bars: [{ columns: [] }] }] })),
    ).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), rows: [{ bars: [] }] }))).toBeTruthy()
  })

  it('bars that are not wrapped in a row', () => {
    expect(
      rejects(stored({ ...emptyScore(), rows: emptyScore().rows[0]?.bars })),
    ).toBeTruthy()
  })

  it('a row title that is not a string', () => {
    const rows = (heading: object) => [{ ...heading, bars: emptyScore().rows[0]?.bars }]
    expect(rejects(stored({ ...emptyScore(), rows: rows({ title: 7 }) }))).toBeTruthy()
    expect(rejects(stored({ ...emptyScore(), rows: rows({ note: 7 }) }))).toBeTruthy()
  })

  it('a chord name that is not a string', () => {
    const broken = {
      ...emptyScore(),
      rows: [
        {
          bars: [
            { columns: [{ cells: [null, null, null, null, null, null], chord: 7 }] },
          ],
        },
      ],
    }
    expect(rejects(stored(broken))).toBeTruthy()
  })

  it('a cell that is neither a fret nor a mute', () => {
    const broken = {
      ...emptyScore(),
      rows: [
        {
          bars: [
            { columns: [{ cells: [{ kind: 'wat' }, null, null, null, null, null] }] },
          ],
        },
      ],
    }
    expect(rejects(stored(broken))).toBeTruthy()
  })
})

describe('older files still open', () => {
  const bar = emptyBar(2, 6)
  const noted = {
    columns: bar.columns.map((column, index) =>
      index === 0
        ? {
            ...column,
            cells: column.cells.map((c, s) => (s === 2 ? { kind: 'fret', fret: 7 } : c)),
          }
        : column,
    ),
  }

  const opened = (raw: string): Song => {
    const result = decode(raw)
    if (!result.ok) throw new Error(result.error)
    return result.song
  }

  it('a v1 score, whose bars had no row and whose columns had no chord', () => {
    const song = opened(
      JSON.stringify({
        version: 1,
        score: { tuning: STANDARD, bars: [noted], defaultBarColumns: 8 },
      }),
    )
    expect(song.tab.rows).toEqual([{ bars: [noted] }])
    expect(song.title).toBe('')
    expect(song.chart).toEqual([{ name: 'Verse 1', body: '' }])
  })

  it('a v2 score, which added chord names', () => {
    const named = { columns: bar.columns.map((c) => ({ ...c, chord: 'Am' })) }
    const song = opened(
      JSON.stringify({
        version: 2,
        score: { tuning: STANDARD, bars: [named], defaultBarColumns: 8 },
      }),
    )
    expect(song.tab.rows[0]?.bars[0]?.columns[0]?.chord).toBe('Am')
  })

  it('a v3 score, which had rows but no song around them', () => {
    const song = opened(
      JSON.stringify({
        version: 3,
        score: { ...emptyScore(), rows: [{ bars: [noted] }] },
      }),
    )
    expect(song.tab.rows).toEqual([{ bars: [noted] }])
    expect(song.tabFirst).toBe(false)
  })

  it('a v4 song written before a later field existed', () => {
    const song = opened(
      JSON.stringify({
        version: 4,
        song: { chart: [{ name: 'Intro', body: 'Am' }], tab: emptyScore() },
      }),
    )
    expect(song).toEqual({
      ...emptySong(),
      chart: [{ name: 'Intro', body: 'Am' }],
    })
  })

  it('drops a field it has never heard of rather than refusing the file', () => {
    const song = opened(JSON.stringify({ version: 4, song: { ...emptySong(), capo: 3 } }))
    expect(song).toEqual(emptySong())
  })
})

describe('filenameFor', () => {
  const named = (title: string): string => filenameFor({ ...emptySong(), title })

  it('slugs the title behind the app name', () => {
    expect(named('Endless Skies')).toBe('tabsmith-endless-skies.json')
    expect(named('A9/4 & Fmaj7')).toBe('tabsmith-a9-4-fmaj7.json')
  })

  it('trims the dashes a slug would otherwise start or end with', () => {
    expect(named('  ...Wait!  ')).toBe('tabsmith-wait.json')
  })

  it('is the app name alone when there is no title', () => {
    expect(named('')).toBe('tabsmith.json')
    expect(named('???')).toBe('tabsmith.json')
  })
})
