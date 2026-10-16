import { describe, expect, it } from 'vitest'
import {
  beamGroups,
  chordName,
  notation,
  openPitches,
  placeOctaves,
  rhythm,
  suggestKey,
  writtenPitch,
  type Chord,
  type Event,
  type Measure,
} from './notation.ts'
import { emptyScore, TUNINGS, type Bar, type Cell } from './model.ts'

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
    expect(writtenPitch(64, 0, false)).toEqual({ step: 7, accidental: null })
    expect(writtenPitch(52, 0, false)).toEqual({ step: 0, accidental: null })
  })

  it('spells the black keys as flats or sharps outside a key', () => {
    expect(writtenPitch(54, 0, false)).toEqual({ step: 2, accidental: 'flat' })
    expect(writtenPitch(46, 0, false)).toEqual({ step: -3, accidental: 'flat' })
    expect(writtenPitch(54, 0, true)).toEqual({ step: 1, accidental: 'sharp' })
  })

  // Written pitches, sounding an octave lower: F#4 is 54 here.
  it('leaves out what the key signature already says', () => {
    expect(writtenPitch(54, 1, true)).toEqual({ step: 1, accidental: null })
    expect(writtenPitch(46, -2, false)).toEqual({ step: -3, accidental: null })
  })

  it('marks a natural where the key would alter the letter', () => {
    expect(writtenPitch(53, 1, true)).toEqual({ step: 1, accidental: 'natural' })
    expect(writtenPitch(47, -1, false)).toEqual({ step: -3, accidental: 'natural' })
  })

  it('spells a note out of the key the way the key leans', () => {
    expect(writtenPitch(56, 2, true)).toEqual({ step: 2, accidental: 'sharp' })
    expect(writtenPitch(54, -3, false)).toEqual({ step: 2, accidental: 'flat' })
  })

  it('uses the key letter even across an octave, E# in F# major', () => {
    expect(writtenPitch(53, 6, true)).toEqual({ step: 0, accidental: null })
  })
})

const q = (step: number): Chord => ({
  pitches: [{ step, accidental: null }],
  name: null,
  ottava: null,
})
const values = (measure: Measure): readonly string[] =>
  measure.map((event: Event) => `${event.kind === 'note' ? 'n' : 'r'}${event.value}`)

describe('rhythm', () => {
  it('makes neighbours eighths and a note with room after it a quarter', () => {
    expect(values(rhythm([q(0), q(1), q(2), null, q(3), null, null, null]))).toEqual([
      'n1',
      'n1',
      'n2',
      'n4',
    ])
  })

  it('runs a note to the bar line', () => {
    expect(values(rhythm([q(0), null, null, null, null, null, null, null]))).toEqual([
      'n8',
    ])
  })

  it('rounds a length no value has down, and rests the difference', () => {
    expect(values(rhythm([q(0), null, null, q(1), null, null, null, null]))).toEqual([
      'n2',
      'r1',
      'n4',
      'r1',
    ])
    expect(values(rhythm([q(0), null, null, null, null, null, null]))).toEqual([
      'n4',
      'r2',
      'r1',
    ])
  })

  it('rests before the first note, and through a bar with none', () => {
    expect(values(rhythm([null, null, q(0), null]))).toEqual(['r2', 'n2'])
    expect(values(rhythm([null, null, null, null]))).toEqual(['r4'])
  })

  it('keeps where each event starts in the bar', () => {
    expect(rhythm([null, q(0), null, null]).map((event) => event.at)).toEqual([0, 1, 3])
  })
})

describe('notation', () => {
  it('times every column with a note by the room after it', () => {
    const empty = Array.from({ length: 6 }, () => null)
    const score = {
      ...emptyScore(),
      rows: [
        {
          title: 'Riff',
          note: 'let ring',
          bars: [bar(on(3, fret(4)), on(3, fret(3)), empty, on(5, fret(6)), empty)],
        },
      ],
    }
    expect(notation(score, null)).toEqual([
      {
        title: 'Riff',
        note: 'let ring',
        measures: [
          [
            {
              kind: 'note',
              chord: {
                pitches: [{ step: 2, accidental: 'flat' }],
                name: null,
                ottava: null,
              },
              value: 1,
              at: 0,
            },
            {
              kind: 'note',
              chord: {
                pitches: [{ step: 1, accidental: null }],
                name: null,
                ottava: null,
              },
              value: 2,
              at: 1,
            },
            {
              kind: 'note',
              chord: {
                pitches: [{ step: -3, accidental: 'flat' }],
                name: null,
                ottava: null,
              },
              value: 2,
              at: 3,
            },
          ],
        ],
      },
    ])
  })

  it('spells the notes in the song key when it has one', () => {
    const score = { ...emptyScore(), rows: [{ bars: [bar(on(3, fret(4)))] }] }
    const first = (key: 'E' | null) => {
      const event = notation(score, key)[0]?.measures[0]?.[0]
      return event?.kind === 'note' ? event.chord.pitches[0] : undefined
    }
    expect(first(null)).toEqual({ step: 2, accidental: 'flat' })
    expect(first('E')).toEqual({ step: 1, accidental: null })
  })

  it('runs a stretch under 8va over the bar line, keeping each bar its own', () => {
    // Top string: the 17th fret is past three ledger lines up, the 5th on the first.
    const high = on(0, fret(17))
    const score = {
      ...emptyScore(),
      rows: [{ bars: [bar(on(0, fret(5)), high), bar(on(0, fret(5)), high)] }],
    }
    const [system] = notation(score, null)
    expect(
      system?.measures.map((measure) =>
        measure.map((event) => (event.kind === 'note' ? event.chord.ottava : 'rest')),
      ),
    ).toEqual([
      [null, '8va'],
      ['8va', '8va'],
    ])
  })

  it('stacks a column played together lowest first, names it, and leaves out mutes', () => {
    const chord = [fret(0), fret(1), fret(0), fret(2), fret(3), { kind: 'mute' } as const]
    const [system] = notation({ ...emptyScore(), rows: [{ bars: [bar(chord)] }] }, null)
    const event = system?.measures[0]?.[0]
    const played = event?.kind === 'note' ? event.chord : undefined
    expect(played?.pitches.map((pitch) => pitch.step)).toEqual([-2, 0, 2, 5, 7])
    expect(played?.name).toBe('C')
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
  const chordIn = (cells: readonly (Cell | null)[]): Chord | undefined => {
    const [system] = notation({ ...emptyScore(), rows: [{ bars: [bar(cells)] }] }, null)
    const event = system?.measures[0]?.[0]
    return event?.kind === 'note' ? event.chord : undefined
  }

  it('is spelled in its key, with one head for two strings on the same note', () => {
    // Open B major barred at the 2nd fret: x24442, so F# and D# not Gb and Eb.
    const chord = chordIn([fret(2), fret(4), fret(4), fret(4), fret(2), null])
    expect(chord?.name).toBe('B')
    expect(chord?.pitches.map((pitch) => pitch.accidental)).toEqual([
      null,
      'sharp',
      null,
      'sharp',
      'sharp',
    ])

    expect(
      chordIn([fret(0), fret(0), fret(0), fret(2), fret(2), fret(0)])?.pitches,
    ).toHaveLength(6)
    expect(chordIn([fret(0), fret(5), null, null, null, null])?.pitches).toHaveLength(1)
  })
})

describe('placeOctaves', () => {
  const at = (...steps: readonly number[]): Chord => ({
    pitches: steps.map((step) => ({ step, accidental: null })),
    name: null,
    ottava: null,
  })
  const marks = (chords: readonly (Chord | null)[]) =>
    placeOctaves(chords).map((chord) => chord?.ottava ?? '-')

  it('writes a stretch from one far note to another an octave nearer', () => {
    expect(placeOctaves([at(14, 16), at(16)])).toEqual([
      { pitches: at(7, 9).pitches, name: null, ottava: '8va' },
      { pitches: at(9).pitches, name: null, ottava: '8va' },
    ])
    expect(placeOctaves([at(-6), at(-8)]).map((chord) => chord?.pitches)).toEqual([
      at(1).pitches,
      at(-1).pitches,
    ])
  })

  it('leaves a lone far note with its ledger lines', () => {
    expect(marks([at(17), at(11), at(13), at(11)])).toEqual(['-', '-', '-', '-'])
  })

  it('leaves a stretch that never climbs past the third ledger line', () => {
    expect(marks([at(10), at(14), at(15), at(14), at(15)])).toEqual([
      '-',
      '-',
      '-',
      '-',
      '-',
    ])
    expect(marks([at(-6), at(-7)])).toEqual(['-', '-'])
  })

  it('carries the stretch over the notes between two far ones, and over empty columns', () => {
    expect(marks([at(14), null, at(9), at(16)])).toEqual(['8va', '-', '8va', '8va'])
    expect(marks([at(-6), at(0), at(-8)])).toEqual(['8vb', '8vb', '8vb'])
  })

  it('takes in notes two ledger lines out on either side, and no nearer ones', () => {
    expect(marks([at(11), at(12), at(15), at(17), at(13), at(12), at(10)])).toEqual([
      '-',
      '8va',
      '8va',
      '8va',
      '8va',
      '8va',
      '-',
    ])
  })

  it('breaks the stretch at a note that would not read an octave nearer', () => {
    expect(marks([at(16), at(4), at(16)])).toEqual(['-', '-', '-'])
  })
})

describe('beamGroups', () => {
  const note = (value: 1 | 2, at: number): Event => ({
    kind: 'note',
    chord: q(0),
    value,
    at,
  })
  const rest = (at: number): Event => ({ kind: 'rest', value: 1, at })

  it('beams eighths side by side, never across the middle of the bar', () => {
    const run = Array.from({ length: 6 }, (_, at) => note(1, at))
    expect(beamGroups(run)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ])
  })

  it('breaks a group at a rest or a longer note, flagging a lone eighth', () => {
    expect(beamGroups([note(1, 0), rest(1), note(1, 2), note(2, 3), note(1, 5)])).toEqual(
      [[0], [2], [4]],
    )
  })
})

describe('suggestKey', () => {
  const scoreOf = (...frets: readonly number[]) => ({
    ...emptyScore(),
    rows: [{ bars: [bar(...frets.map((n) => on(0, fret(n))))] }],
  })

  it('finds the major scale the notes fit, on the top string', () => {
    // E F# G# A B C# D#: E major.
    expect(suggestKey(scoreOf(0, 2, 4, 5, 7, 9, 11, 0))).toBe('E')
  })

  it('takes the relative minor when its tonic is played more', () => {
    // A B C D E, mostly A: A minor rather than C major.
    expect(suggestKey(scoreOf(5, 7, 8, 10, 0, 5, 5))).toBe('Am')
  })

  it('prefers fewer sharps or flats on a tie, and nothing for no notes', () => {
    expect(suggestKey(scoreOf(3, 8))).toBe('C')
    expect(suggestKey(emptyScore())).toBeNull()
  })
})

describe('measure accidentals', () => {
  it.each([
    { key: 'G' as const, frets: [1, 2, 2], want: ['natural', 'sharp', null] },
    { key: 'F' as const, frets: [7, 6, 6], want: ['natural', 'flat', null] },
    { key: 'C' as const, frets: [6, 7, 7], want: ['flat', 'natural', null] },
  ])('restores the alteration in $key after a chromatic note', ({ key, frets, want }) => {
    const columns = frets.map((n) => on(0, fret(n)))
    const score = { ...emptyScore(), rows: [{ bars: [bar(...columns)] }] }
    const notes = notation(score, key)[0]?.measures[0]?.filter(
      (event) => event.kind === 'note',
    )
    expect(notes?.map((event) => event.chord.pitches[0]?.accidental)).toEqual(want)
  })

  it('resets accidentals at the bar line', () => {
    const score = {
      ...emptyScore(),
      rows: [{ bars: [bar(on(0, fret(1))), bar(on(0, fret(2)))] }],
    }
    const measures = notation(score, 'G')[0]?.measures
    expect(
      measures?.map((measure) =>
        measure.flatMap((event) =>
          event.kind === 'note'
            ? event.chord.pitches.map((pitch) => pitch.accidental)
            : [],
        ),
      ),
    ).toEqual([['natural'], [null]])
  })
})
