import { describe, expect, it } from 'vitest'
import {
  beamGroups,
  chordName,
  notation,
  openPitches,
  writtenPitch,
  type Chord,
} from './notation.ts'
import { emptyBar, emptyScore, TUNINGS, type Bar, type Cell } from './model.ts'

const fret = (n: number): Cell => ({ kind: 'fret', fret: n })

const bar = (...columns: readonly (readonly (Cell | null)[])[]): Bar => ({
  columns: columns.map((cells) => ({ cells })),
})

// Strings top down: e B G D A E.
const on = (slot: number, cell: Cell): readonly (Cell | null)[] =>
  Array.from({ length: 6 }, (_, s) => (s === slot ? cell : null))

describe('openPitches', () => {
  it('puts each string in its octave, top string first', () => {
    expect(openPitches(TUNINGS[0])).toEqual([64, 59, 55, 50, 45, 40])
    expect(openPitches(TUNINGS[1])).toEqual([64, 59, 55, 50, 45, 38])
    expect(openPitches(TUNINGS[2])).toEqual([43, 38, 33, 28])
  })
})

describe('writtenPitch', () => {
  it('writes guitar an octave up, so open high e is the top space', () => {
    expect(writtenPitch(64)).toEqual({ step: 7, accidental: null })
    expect(writtenPitch(52)).toEqual({ step: 0, accidental: null })
  })

  it('spells the black keys as flats', () => {
    expect(writtenPitch(54)).toEqual({ step: 2, accidental: 'flat' })
    expect(writtenPitch(46)).toEqual({ step: -3, accidental: 'flat' })
  })
})

describe('notation', () => {
  it('makes a quarter of every column with a note, skipping the empty ones', () => {
    const empty = Array.from({ length: 6 }, () => null)
    const score = {
      ...emptyScore(),
      rows: [
        {
          title: 'Riff',
          note: 'let ring',
          bars: [
            bar(on(3, fret(4)), on(3, fret(3)), empty, on(5, fret(6))),
            emptyBar(4, 6),
          ],
        },
      ],
    }
    expect(notation(score)).toEqual([
      {
        title: 'Riff',
        note: 'let ring',
        measures: [
          [
            { pitches: [{ step: 2, accidental: 'flat' }], name: null },
            { pitches: [{ step: 1, accidental: null }], name: null },
            { pitches: [{ step: -3, accidental: 'flat' }], name: null },
          ],
          [],
        ],
      },
    ])
  })

  it('stacks a column played together lowest first, names it, and leaves out mutes', () => {
    const chord = [fret(0), fret(1), fret(0), fret(2), fret(3), { kind: 'mute' } as const]
    const [system] = notation({ ...emptyScore(), rows: [{ bars: [bar(chord)] }] })
    expect(system?.measures[0]?.[0]?.pitches.map((pitch) => pitch.step)).toEqual([
      -2, 0, 2, 5, 7,
    ])
    expect(system?.measures[0]?.[0]?.name).toBe('C')
  })
})

// Sounding MIDI notes, low to high, as a standard-tuned guitar plays them.
describe('chordName', () => {
  it('names the open chords', () => {
    expect(chordName([40, 47, 52, 55, 59, 64])).toBe('Em')
    expect(chordName([43, 47, 50, 55, 59, 65])).toBe('G7')
    expect(chordName([45, 52, 57, 60, 64])).toBe('Am')
    expect(chordName([50, 57, 62, 66])).toBe('D')
    expect(chordName([48, 52, 55, 59])).toBe('Cmaj7')
  })

  it('names a power chord', () => {
    expect(chordName([40, 47, 52])).toBe('E5')
  })

  it('puts a root that is not the lowest note over its bass', () => {
    expect(chordName([40, 45, 52, 57, 60, 64])).toBe('Am/E')
  })

  it('spells in the key the chord is written in', () => {
    expect(chordName([46, 53, 58, 62, 65])).toBe('Bb')
    expect(chordName([42, 50, 57, 62])).toBe('D/F#')
    expect(chordName([47, 54, 59, 63, 66])).toBe('B')
    expect(chordName([42, 49, 54, 57, 61, 66])).toBe('F#m')
    expect(chordName([43, 50, 55, 58, 62])).toBe('Gm')
  })

  it('prefers the commoner name when two read the same notes', () => {
    expect(chordName([42, 50, 57, 59])).toBe('Bm7/F#')
  })

  it('names nothing for one note, an octave, or a shape it does not know', () => {
    expect(chordName([40])).toBeNull()
    expect(chordName([40, 52])).toBeNull()
    expect(chordName([48, 52])).toBeNull()
  })
})

describe('a named chord on the staff', () => {
  it('is spelled in its key, with one head for two strings on the same note', () => {
    // Open B major barred at the 2nd fret: x24442, so F# and D# not Gb and Eb.
    const b = [fret(2), fret(4), fret(4), fret(4), fret(2), null]
    const [system] = notation({ ...emptyScore(), rows: [{ bars: [bar(b)] }] })
    const chord = system?.measures[0]?.[0]
    expect(chord?.name).toBe('B')
    expect(chord?.pitches.map((pitch) => pitch.accidental)).toEqual([
      null,
      'sharp',
      null,
      'sharp',
      'sharp',
    ])

    const doubled = [fret(0), fret(0), fret(0), fret(2), fret(2), fret(0)]
    const [em] = notation({ ...emptyScore(), rows: [{ bars: [bar(doubled)] }] })
    expect(em?.measures[0]?.[0]?.pitches).toHaveLength(6)
    const unison = [fret(0), fret(5), null, null, null, null]
    const [twice] = notation({ ...emptyScore(), rows: [{ bars: [bar(unison)] }] })
    expect(twice?.measures[0]?.[0]?.pitches).toHaveLength(1)
  })
})

describe('beamGroups', () => {
  const note: Chord = { pitches: [{ step: 0, accidental: null }], name: null }
  const chord: Chord = {
    pitches: [
      { step: 0, accidental: null },
      { step: 2, accidental: null },
    ],
    name: null,
  }

  it('beams a run of single notes four to a group, the rest after', () => {
    expect(beamGroups(Array.from({ length: 6 }, () => note))).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ])
  })

  it('keeps quarters for a beat or less, or anything with a chord in it', () => {
    expect(beamGroups(Array.from({ length: 4 }, () => note))).toBeNull()
    expect(beamGroups([note, note, chord, note, note])).toBeNull()
  })
})
