import { describe, expect, it } from 'vitest'
import {
  emptyBar,
  emptyRow,
  emptyScore,
  TUNINGS,
  type Score,
} from './core/model.ts'
import { decode, encode } from './storage.ts'

const [STANDARD, , BASS] = TUNINGS

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

const versioned = (score: unknown, version: unknown = 3): string =>
  JSON.stringify({ version, score })

describe('encode / decode', () => {
  it('round-trips an empty score', () => {
    expect(decode(encode(emptyScore()))).toEqual(emptyScore())
  })

  it('round-trips frets, links, bends and mutes', () => {
    const score = withCells()
    expect(decode(encode(score))).toEqual(score)
  })

  it('round-trips chord names', () => {
    const score: Score = {
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
    }
    expect(decode(encode(score))).toEqual(score)
  })

  it('round-trips row titles and notes', () => {
    const score: Score = {
      ...emptyScore(),
      rows: [
        { title: 'Main Riff', note: '(let ring)', bars: emptyRow(1, 4, 6).bars },
        emptyRow(1, 4, 6),
      ],
    }
    expect(decode(encode(score))).toEqual(score)
  })

  it('reads back a score saved before rows could be titled', () => {
    expect(decode(encode(emptyScore()))?.rows[0]?.title).toBeUndefined()
  })

  it('round-trips several rows of several bars', () => {
    const score: Score = {
      ...emptyScore(),
      rows: [emptyRow(3, 4, 6), emptyRow(1, 8, 6)],
    }
    expect(decode(encode(score))).toEqual(score)
  })

  it('round-trips a four-string bass score', () => {
    const score: Score = {
      ...emptyScore(),
      tuning: BASS,
      rows: [emptyRow(1, 4, 4)],
    }
    expect(decode(encode(score))).toEqual(score)
  })
})

describe('decode rejects', () => {
  it('nothing stored', () => {
    expect(decode(null)).toBeNull()
  })

  it('a blob that is not JSON', () => {
    expect(decode('{ this is not json')).toBeNull()
    expect(decode('')).toBeNull()
  })

  it('JSON that is not an object', () => {
    expect(decode('42')).toBeNull()
    expect(decode('null')).toBeNull()
    expect(decode('[1, 2]')).toBeNull()
  })

  it('a different schema version', () => {
    expect(decode(versioned(emptyScore(), 2))).toBeNull()
    expect(decode(versioned(emptyScore(), '3'))).toBeNull()
    expect(decode(JSON.stringify({ score: emptyScore() }))).toBeNull()
  })

  it('a score missing its parts', () => {
    expect(decode(versioned({}))).toBeNull()
    expect(decode(versioned({ ...emptyScore(), tuning: undefined }))).toBeNull()
    expect(decode(versioned({ ...emptyScore(), rows: [] }))).toBeNull()
    expect(
      decode(versioned({ ...emptyScore(), defaultBarColumns: '8' })),
    ).toBeNull()
  })

  it('a tuning with no usable string labels', () => {
    expect(
      decode(versioned({ ...emptyScore(), tuning: { name: 'x', strings: [] } })),
    ).toBeNull()
    expect(
      decode(
        versioned({ ...emptyScore(), tuning: { name: 'x', strings: [1, 2] } }),
      ),
    ).toBeNull()
  })

  it('columns that do not match the string count', () => {
    expect(
      decode(
        versioned({
          ...emptyScore(),
          tuning: STANDARD,
          rows: [emptyRow(1, 2, 4)],
        }),
      ),
    ).toBeNull()
  })

  it('a bar with no columns, and a row with no bars', () => {
    expect(
      decode(versioned({ ...emptyScore(), rows: [{ bars: [{ columns: [] }] }] })),
    ).toBeNull()
    expect(decode(versioned({ ...emptyScore(), rows: [{ bars: [] }] }))).toBeNull()
  })

  it('bars that are not wrapped in a row', () => {
    expect(
      decode(versioned({ ...emptyScore(), rows: emptyScore().rows[0]?.bars })),
    ).toBeNull()
  })

  it('a row title that is not a string', () => {
    expect(decode(versioned({ ...emptyScore(), rows: [{ title: 7, bars: emptyScore().rows[0]?.bars }] }))).toBeNull()
    expect(decode(versioned({ ...emptyScore(), rows: [{ note: 7, bars: emptyScore().rows[0]?.bars }] }))).toBeNull()
  })

  it('a chord name that is not a string', () => {
    const broken = {
      ...emptyScore(),
      rows: [
        {
          bars: [
            {
              columns: [{ cells: [null, null, null, null, null, null], chord: 7 }],
            },
          ],
        },
      ],
    }
    expect(decode(versioned(broken))).toBeNull()
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
    expect(decode(versioned(broken))).toBeNull()
  })
})
