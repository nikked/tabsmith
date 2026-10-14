import type { Column, Score, Tuning } from './model.ts'

/**
 * Where a note sits on a treble staff, in steps of a line or a space: 0 is the
 * bottom line (E4), 8 the top one (F5), and anything outside takes ledger lines.
 */
export type Accidental = 'flat' | 'sharp'

export type Pitch = { readonly step: number; readonly accidental: Accidental | null }

/**
 * The notes of one tab column, lowest first, played together as one quarter,
 * and the chord they make when they make one.
 */
export type Chord = { readonly pitches: readonly Pitch[]; readonly name: string | null }

export type Measure = readonly Chord[]

/**
 * One tab row's worth of measures under the row's title and note, so the staff
 * breaks where the tab does and is headed the way the tab is.
 */
export type System = {
  readonly title: string
  readonly note: string
  readonly measures: readonly Measure[]
}

const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

/** Where each of the twelve notes sits among the seven letters, C = 0. */
type Spelling = readonly (readonly [letter: number, accidental: Accidental | null])[]

const FLATS: Spelling = [
  [0, null],
  [1, 'flat'],
  [1, null],
  [2, 'flat'],
  [2, null],
  [3, null],
  [4, 'flat'],
  [4, null],
  [5, 'flat'],
  [5, null],
  [6, 'flat'],
  [6, null],
]

const SHARPS: Spelling = [
  [0, null],
  [0, 'sharp'],
  [1, null],
  [1, 'sharp'],
  [2, null],
  [3, null],
  [3, 'sharp'],
  [4, null],
  [4, 'sharp'],
  [5, null],
  [5, 'sharp'],
  [6, null],
]

const pitchClass = (name: string): number => {
  const base = PITCH_CLASS[name.charAt(0).toUpperCase()] ?? 0
  const accidental = name.charAt(1)
  return (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12
}

/**
 * A tuning names its strings by letter only, so the octaves are worked out:
 * the lowest string sits where a guitar's or a bass's does, and each string
 * above is the next note of its name up from the one below. MIDI numbers, top
 * string first like the tab.
 */
export const openPitches = (tuning: Tuning): readonly number[] => {
  const lowestOctave = tuning.strings.length <= 4 ? 1 : 2
  const lowToHigh = [...tuning.strings]
    .reverse()
    .reduce<readonly number[]>((pitches, name) => {
      const pc = pitchClass(name)
      const below = pitches.at(-1)
      if (below === undefined) return [(lowestOctave + 1) * 12 + pc]
      return [...pitches, below + 1 + ((pc - below - 1 + 120) % 12)]
    }, [])
  return [...lowToHigh].reverse()
}

/**
 * Guitar is written an octave above where it sounds, so it sits on the staff.
 * A lone note is spelled with flats, the way it is usually named over a tab.
 */
export const writtenPitch = (sounding: number, sharps = false): Pitch => {
  const written = sounding + 12
  const octave = Math.floor(written / 12) - 1
  const [letter, accidental] = (sharps ? SHARPS : FLATS)[written % 12] ?? [0, null]
  return { step: octave * 7 + letter - (4 * 7 + 2), accidental }
}

const FLAT_NAMES = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const
const SHARP_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

// Intervals above the root, the commoner name first where two read the same
// notes (Bm7 over D6). Only exact matches are named: a guess at a chord with
// notes left out or added is worse on a stand than no name at all.
const SHAPES: readonly (readonly [suffix: string, intervals: readonly number[]])[] = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['5', [0, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['add9', [0, 2, 4, 7]],
  ['dim', [0, 3, 6]],
  ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['aug', [0, 4, 8]],
]

type Identified = {
  readonly root: number
  readonly suffix: string
  readonly bass: number
  readonly sharps: boolean
}

// Roots whose keys are written in sharps: the major ones for a chord with a
// major third, the minor ones (Em, Bm, F#m) for any other.
const SHARP_MAJOR = new Set([2, 4, 7, 9, 11])
const SHARP_MINOR = new Set([4, 6, 11])

const matches = (want: readonly number[], intervals: readonly number[]): boolean =>
  want.length === intervals.length && want.every((step, i) => step === intervals[i])

/**
 * The chord a set of sounding notes makes, read with the lowest note as the
 * root first. Failing that, the commonest shape on any other root wins, and
 * goes over the bass as a slash chord. Null for a single note or anything
 * that matches no shape.
 */
const identify = (sounding: readonly number[]): Identified | null => {
  const bass = Math.min(...sounding) % 12
  const classes = [...new Set(sounding.map((note) => note % 12))]
  if (classes.length < 2) return null
  const intervalsFrom = (root: number): readonly number[] =>
    classes.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b)
  const found =
    SHAPES.map(([suffix, want]) => ({ suffix, want, root: bass })).find(({ want }) =>
      matches(want, intervalsFrom(bass)),
    ) ??
    SHAPES.flatMap(([suffix, want]) =>
      classes.filter((pc) => pc !== bass).map((root) => ({ suffix, want, root })),
    ).find(({ want, root }) => matches(want, intervalsFrom(root)))
  if (found === undefined) return null
  const major = found.want.includes(4)
  return {
    root: found.root,
    suffix: found.suffix,
    bass,
    sharps: (major ? SHARP_MAJOR : SHARP_MINOR).has(found.root),
  }
}

export const chordName = (sounding: readonly number[]): string | null => {
  const chord = identify(sounding)
  if (chord === null) return null
  const names = chord.sharps ? SHARP_NAMES : FLAT_NAMES
  const slash = chord.root === chord.bass ? '' : `/${names[chord.bass] ?? ''}`
  return `${names[chord.root] ?? ''}${chord.suffix}${slash}`
}

// Two strings on the same note are one head on the staff.
const sameNote = (a: Pitch, b: Pitch): boolean =>
  a.step === b.step && a.accidental === b.accidental

const chordOf = (column: Column, open: readonly number[]): Chord => {
  const sounding = column.cells.flatMap((cell, slot) => {
    const string = open[slot]
    return cell?.kind === 'fret' && string !== undefined ? [string + cell.fret] : []
  })
  const sharps = identify(sounding)?.sharps ?? false
  return {
    pitches: sounding
      .map((note) => writtenPitch(note, sharps))
      .sort((a, b) => a.step - b.step)
      .filter((pitch, i, all) => i === 0 || !sameNote(pitch, all[i - 1] ?? pitch)),
    name: chordName(sounding),
  }
}

/** Each column with a note in it becomes one quarter; empty columns are only room. */
export const notation = (score: Score): readonly System[] => {
  const open = openPitches(score.tuning)
  return score.rows.map((row) => ({
    title: row.title ?? '',
    note: row.note ?? '',
    measures: row.bars.map((bar) =>
      bar.columns
        .map((column) => chordOf(column, open))
        .filter((chord) => chord.pitches.length > 0),
    ),
  }))
}

const BEAT = 4

/**
 * A measure of more than one beat's worth of single notes reads as a run, so
 * it is set in eighths beamed four to a group. Anything with a chord in it, or
 * short enough to read note by note, stays in quarters: null. Indexes into the
 * measure, so the beams can be drawn over the notes already laid out.
 */
export const beamGroups = (measure: Measure): readonly (readonly number[])[] | null => {
  if (measure.length <= BEAT || measure.some((chord) => chord.pitches.length > 1)) {
    return null
  }
  return Array.from({ length: Math.ceil(measure.length / BEAT) }, (_, group) =>
    measure.map((_, i) => i).slice(group * BEAT, group * BEAT + BEAT),
  )
}
