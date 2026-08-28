import { describe, expect, it } from 'vitest'
import { emptyBar, emptyScore, TUNINGS, type Score } from './core/model.ts'
import { decode, encode } from './storage.ts'

const [STANDARD, , BASS] = TUNINGS

const withCells = (): Score => ({
  ...emptyScore(),
  bars: [
    {
      columns: emptyBar(3, 6).columns.map((column, index) =>
        column.map((cell, slot) => {
          if (index === 0 && slot === 2) return { kind: 'fret' as const, fret: 12 }
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
      ),
    },
  ],
})

const versioned = (score: unknown, version: unknown = 1): string =>
  JSON.stringify({ version, score })

describe('encode / decode', () => {
  it('round-trips an empty score', () => {
    expect(decode(encode(emptyScore()))).toEqual(emptyScore())
  })

  it('round-trips frets, links, bends and mutes', () => {
    const score = withCells()
    expect(decode(encode(score))).toEqual(score)
  })

  it('round-trips a four-string bass score', () => {
    const score: Score = { ...emptyScore(), tuning: BASS, bars: [emptyBar(4, 4)] }
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
    expect(decode(versioned(emptyScore(), '1'))).toBeNull()
    expect(decode(JSON.stringify({ score: emptyScore() }))).toBeNull()
  })

  it('a score missing its parts', () => {
    expect(decode(versioned({}))).toBeNull()
    expect(decode(versioned({ ...emptyScore(), tuning: undefined }))).toBeNull()
    expect(decode(versioned({ ...emptyScore(), bars: [] }))).toBeNull()
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
        versioned({ ...emptyScore(), tuning: STANDARD, bars: [emptyBar(2, 4)] }),
      ),
    ).toBeNull()
  })

  it('a bar with no columns', () => {
    expect(decode(versioned({ ...emptyScore(), bars: [{ columns: [] }] }))).toBeNull()
  })

  it('a cell that is neither a fret nor a mute', () => {
    const broken = {
      ...emptyScore(),
      bars: [{ columns: [[{ kind: 'wat' }, null, null, null, null, null]] }],
    }
    expect(decode(versioned(broken))).toBeNull()
  })
})
