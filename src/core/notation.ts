import { KEYS, type Column, type Key, type Score, type Tuning } from './model.ts'

/**
 * Where a note sits on a treble staff, in steps of a line or a space: 0 is the
 * bottom line (E4), 8 the top one (F5), and anything outside takes ledger lines.
 * The accidental is the one drawn: null when the key signature already says it.
 */
export type Accidental = 'flat' | 'sharp' | 'natural'

export type Pitch = { readonly step: number; readonly accidental: Accidental | null }

/** The notes of one tab column, lowest first, and the chord they make when they make one. */
/**
 * A chord too far above or below the staff is written an octave nearer and
 * marked to be played where it sounds: 8va up, 8vb down.
 */
export type Ottava = '8va' | '8vb' | null

/** A stretch moved an octave nearer, one way or the other. */
export type Shift = Exclude<Ottava, null>

export type Chord = {
  readonly pitches: readonly Pitch[]
  readonly name: string | null
  readonly ottava: Ottava
}

/** A note value in eighths: an eighth, a quarter, a half or a whole. */
export type Value = 1 | 2 | 4 | 8

/** A note or a rest, `at` eighths into its bar. */
export type Event =
  | {
      readonly kind: 'note'
      readonly chord: Chord
      readonly value: Value
      readonly at: number
    }
  | { readonly kind: 'rest'; readonly value: Value; readonly at: number }

export type Measure = readonly Event[]

/**
 * One tab row's worth of measures under the row's title and note, so the staff
 * breaks where the tab does and is headed the way the tab is.
 */
export type System = {
  readonly title: string
  readonly note: string
  readonly measures: readonly Measure[]
}

/** Sharps up, flats down: how many the key signature has. */
export const FIFTHS: Readonly<Record<Key, number>> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
  Am: 0,
  Em: 1,
  Bm: 2,
  'F#m': 3,
  'C#m': 4,
  'G#m': 5,
  Ebm: -6,
  Bbm: -5,
  Fm: -4,
  Cm: -3,
  Gm: -2,
  Dm: -1,
}

const isMinor = (key: Key): boolean => key.endsWith('m')

/** The key's own first note, C = 0: a minor key is its relative major's sixth. */
const tonicOf = (key: Key): number =>
  (((FIFTHS[key] * 7 + (isMinor(key) ? 9 : 0)) % 12) + 12) % 12

/**
 * The keys as a player goes looking for one, up by semitone from C, each major
 * before the minor on the same note. KEYS itself stays round the circle of
 * fifths, which is the order key suggestion breaks its ties in.
 */
export const KEYS_BY_SEMITONE: readonly Key[] = [...KEYS].sort(
  (a, b) => tonicOf(a) - tonicOf(b) || Number(isMinor(a)) - Number(isMinor(b)),
)

const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

type Alter = -1 | 0 | 1

/** The pitch class of each letter unaltered, C first. */
const NATURALS = [0, 2, 4, 5, 7, 9, 11] as const

// The order sharps and flats are added to a key signature, by letter: F C G D
// A E B, and back the other way.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] as const
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] as const

/** How a key signature alters each letter, C first. */
const signature = (fifths: number): readonly Alter[] =>
  NATURALS.map((_, letter) =>
    SHARP_ORDER.slice(0, Math.max(fifths, 0)).some((sharp) => sharp === letter)
      ? 1
      : FLAT_ORDER.slice(0, Math.max(-fifths, 0)).some((flat) => flat === letter)
        ? -1
        : 0,
  )

/**
 * A pitch class as a letter and an alteration: the key's own note when it has
 * one, then a plain letter, and only then a sharp or a flat.
 */
const spell = (
  pc: number,
  key: readonly Alter[],
  sharps: boolean,
): readonly [letter: number, alter: Alter] => {
  const inKey = NATURALS.findIndex(
    (natural, letter) => (natural + (key[letter] ?? 0) + 12) % 12 === pc,
  )
  if (inKey >= 0) return [inKey, key[inKey] ?? 0]
  const plain = NATURALS.findIndex((natural) => natural === pc)
  if (plain >= 0) return [plain, 0]
  return sharps
    ? [NATURALS.findIndex((natural) => natural === pc - 1), 1]
    : [NATURALS.findIndex((natural) => natural === pc + 1), -1]
}

const DRAWN: Readonly<Record<Alter, Accidental>> = {
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
}

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
 * Spelled in the key, `fifths` sharps or flats; a note outside it goes sharp or
 * flat as `sharps` says, and shows only what the key signature does not.
 */
export const writtenPitch = (
  sounding: number,
  fifths: number,
  sharps: boolean,
): Pitch => {
  const written = sounding + 12
  const key = signature(fifths)
  const [letter, alter] = spell(written % 12, key, sharps)
  const octave = Math.floor((written - alter) / 12) - 1
  return {
    step: octave * 7 + letter - (4 * 7 + 2),
    accidental: alter === key[letter] ? null : DRAWN[alter],
  }
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

// Other ways a chart writes a chord the shapes above already name.
const SUFFIX_ALIASES: Readonly<Record<string, string>> = {
  min: 'm',
  maj: '',
  M7: 'maj7',
  sus: 'sus4',
  '+': 'aug',
  o: 'dim',
}

// A root and its sign: H is B the way Finnish and German charts write it.
const ROOT = /^([A-H])([#b]?)/

const rootClass = (letter: string, sign: string): number =>
  letter === 'H'
    ? (11 + (sign === '#' ? 1 : sign === 'b' ? -1 : 0) + 12) % 12
    : pitchClass(letter + sign)

// The lowest note of a pitch class from E2 up, or from E3 up, where a guitar's
// low strings and the strings above them sit.
const fromE = (pc: number, e: number): number => e + ((pc - 4 + 12) % 12)

/**
 * The notes a chord name is played with, as MIDI numbers lowest first: the bass
 * (the root, or the note after a slash) low, the chord's notes above it. Null
 * for a name that is no chord the shapes above know.
 */
export const chordNotes = (name: string): readonly number[] | null => {
  const [main = '', over, ...more] = name.trim().split('/')
  const root = ROOT.exec(main)
  if (root === null || more.length > 0) return null
  const [whole, letter = '', sign = ''] = root
  const written = main.slice(whole.length)
  const suffix = SUFFIX_ALIASES[written] ?? written
  const shape = SHAPES.find(([each]) => each === suffix)
  if (shape === undefined) return null
  const bassOf = over === undefined ? null : ROOT.exec(over)
  if (over !== undefined && (bassOf === null || bassOf[0] !== over)) return null
  const rootPc = rootClass(letter, sign)
  const bassPc = bassOf === null ? rootPc : rootClass(bassOf[1] ?? '', bassOf[2] ?? '')
  const upper = [
    ...new Set(shape[1].map((step) => fromE((rootPc + step) % 12, 52))),
  ].sort((a, b) => a - b)
  return [fromE(bassPc, 40), ...upper]
}

export const chordName = (sounding: readonly number[]): string | null => {
  const chord = identify(sounding)
  if (chord === null) return null
  const names = chord.sharps ? SHARP_NAMES : FLAT_NAMES
  const slash = chord.root === chord.bass ? '' : `/${names[chord.bass] ?? ''}`
  return `${names[chord.root] ?? ''}${chord.suffix}${slash}`
}

/** The fretted notes of one tab column, as MIDI numbers. */
export const columnPitches = (
  column: Column,
  open: readonly number[],
): readonly number[] =>
  column.cells.flatMap((cell, slot) => {
    const string = open[slot]
    return cell?.kind === 'fret' && string !== undefined ? [string + cell.fret] : []
  })

/** The chord a tab column's notes make, named as the staff names it. */
export const recognizedChord = (column: Column, open: readonly number[]): string | null =>
  chordName(columnPitches(column, open))

/**
 * Each column the player left unnamed given the name the staff would give its
 * notes, so the tab says what is played without anyone typing it. A typed name
 * always wins: it may be the chord the band calls it rather than what the
 * strings spell.
 */
export const recognizedChords = (score: Score): Score => {
  const open = openPitches(score.tuning)
  return {
    ...score,
    rows: score.rows.map((row) => ({
      ...row,
      bars: row.bars.map((bar) => ({
        columns: bar.columns.map((column) => {
          if ((column.chord ?? '').trim() !== '') return column
          const name = recognizedChord(column, open)
          return name === null ? column : { ...column, chord: name }
        }),
      })),
    })),
  }
}

// Two strings on the same note are one head on the staff.
const sameNote = (a: Pitch, b: Pitch): boolean =>
  a.step === b.step && a.accidental === b.accidental

/**
 * Without a key, a lone note is spelled with flats, the way it is usually named
 * over a tab, and a chord in the key it is written in.
 */
const chordOf = (
  column: Column,
  open: readonly number[],
  fifths: number | null,
): Chord | null => {
  const sounding = columnPitches(column, open)
  if (sounding.length === 0) return null
  const sharps = fifths === null ? (identify(sounding)?.sharps ?? false) : fifths > 0
  return {
    pitches: sounding
      .map((note) => writtenPitch(note, fifths ?? 0, sharps))
      .sort((a, b) => a.step - b.step)
      .filter((pitch, i, all) => i === 0 || !sameNote(pitch, all[i - 1] ?? pitch)),
    name: chordName(sounding),
    ottava: null,
  }
}

const lowest = (chord: Chord): number => chord.pitches[0]?.step ?? 0
const highest = (chord: Chord): number => chord.pitches.at(-1)?.step ?? 0

// Three ledger lines out is where a note stops reading at a glance: the third
// line above the staff, and the third below it.
const far: Readonly<Record<Shift, (chord: Chord) => boolean>> = {
  '8va': (chord) => lowest(chord) >= 14,
  '8vb': (chord) => highest(chord) <= -6,
}

// A note between two far ones still goes in with them if, an octave nearer, it
// needs no more than one ledger line on the other side of the staff.
const fits: Readonly<Record<Shift, (chord: Chord) => boolean>> = {
  '8va': (chord) => lowest(chord) - 7 >= -2,
  '8vb': (chord) => highest(chord) + 7 <= 10,
}

// Two ledger lines out: next to a stretch, a note this far goes in with it.
const near: Readonly<Record<Shift, (chord: Chord) => boolean>> = {
  '8va': (chord) => lowest(chord) >= 12,
  '8vb': (chord) => highest(chord) <= -4,
}

// Four ledger lines out: a stretch that never gets this far reads well enough
// where it is, so it is left alone.
const peaks: Readonly<Record<Shift, (chord: Chord) => boolean>> = {
  '8va': (chord) => highest(chord) >= 16,
  '8vb': (chord) => lowest(chord) <= -8,
}

const OCTAVE: Readonly<Record<Shift, number>> = { '8va': -7, '8vb': 7 }

type Placed = { readonly chord: Chord; readonly i: number }

/**
 * The notes of a row, in order, with every stretch that opens and closes on a
 * note three ledger lines out, and climbs to four somewhere, written an octave
 * nearer under 8va or 8vb. A lone note that far keeps its ledger lines. What
 * lies between goes in too, as long as each note still reads moved; one that
 * does not breaks the stretch. Notes two ledger lines out just before or after
 * it go in with it. Empty columns are kept as they are.
 */
export const placeOctaves = (
  chords: readonly (Chord | null)[],
): readonly (Chord | null)[] => {
  const marked = (ottava: Shift): ReadonlySet<number> => {
    const notes = chords.flatMap((chord, i): readonly Placed[] =>
      chord === null ? [] : [{ chord, i }],
    )
    // A note that would not read moved splits the row into stretches that can.
    const segments = notes.reduce<readonly (readonly Placed[])[]>(
      (all, note) =>
        fits[ottava](note.chord)
          ? [...all.slice(0, -1), [...(all.at(-1) ?? []), note]]
          : [...all, []],
      [[]],
    )
    return new Set(
      segments.flatMap((segment) => {
        const farOut = segment.flatMap((note, k) => (far[ottava](note.chord) ? [k] : []))
        const first = farOut[0]
        const last = farOut.at(-1)
        if (first === undefined || last === undefined || first === last) return []
        if (!segment.slice(first, last + 1).some((note) => peaks[ottava](note.chord))) {
          return []
        }
        const isNear = (note: Placed) => near[ottava](note.chord)
        const from = segment.slice(0, first).findLastIndex((note) => !isNear(note)) + 1
        const after = segment.slice(last + 1).findIndex((note) => !isNear(note))
        const to = after === -1 ? segment.length : last + 1 + after
        return segment.slice(from, to).map((note) => note.i)
      }),
    )
  }
  const up = marked('8va')
  const down = marked('8vb')
  const ottavaAt = (i: number): Ottava => (up.has(i) ? '8va' : down.has(i) ? '8vb' : null)
  return chords.map((chord, i) => {
    const ottava = ottavaAt(i)
    return chord === null || ottava === null
      ? chord
      : {
          ...chord,
          pitches: chord.pitches.map((pitch) => ({
            ...pitch,
            step: pitch.step + OCTAVE[ottava],
          })),
          ottava,
        }
  })
}

const VALUES: readonly Value[] = [8, 4, 2, 1]

/** The longest plain value that fits, so nothing runs past what was written. */
const longest = (span: number): Value => VALUES.find((value) => value <= span) ?? 1

const rests = (at: number, span: number): readonly Event[] => {
  if (span <= 0) return []
  const value = longest(span)
  return [{ kind: 'rest', value, at }, ...rests(at + value, span - value)]
}

/**
 * Each column is an eighth, so a note lasts until the next one or the bar line:
 * notes in neighbouring columns are eighths, a note with a column of room after
 * it a quarter. A length no single value has is rounded down, and rests make up
 * the difference, as they do for columns before the first note.
 */
export const rhythm = (chords: readonly (Chord | null)[]): Measure => {
  const notes = chords.flatMap((chord, at) => (chord === null ? [] : [{ chord, at }]))
  return [
    ...rests(0, notes[0]?.at ?? chords.length),
    ...notes.flatMap(({ chord, at }, i): readonly Event[] => {
      const span = (notes[i + 1]?.at ?? chords.length) - at
      const value = longest(span)
      return [{ kind: 'note', chord, value, at }, ...rests(at + value, span - value)]
    }),
  ]
}

/** Accidentals last to the bar line, for the same written letter and octave. */
const measureAccidentals = (
  chords: readonly (Chord | null)[],
  fifths: number,
): readonly (Chord | null)[] => {
  const key = signature(fifths)
  const current = new Map<number, Accidental>()
  return chords.map((chord) => {
    if (chord === null) return null
    const pitches = chord.pitches.map((pitch): Pitch => {
      const letter = (((pitch.step + 2) % 7) + 7) % 7
      const initial = DRAWN[key[letter] ?? 0]
      const alteration = pitch.accidental ?? initial
      const previous = current.get(pitch.step) ?? initial
      current.set(pitch.step, alteration)
      return { ...pitch, accidental: alteration === previous ? null : alteration }
    })
    return { ...chord, pitches }
  })
}

export const notation = (score: Score, key: Key | null): readonly System[] => {
  const open = openPitches(score.tuning)
  const fifths = key === null ? null : FIFTHS[key]
  return score.rows.map((row) => {
    // Placed across the whole row, so a stretch under 8va can run over a bar line.
    const placed = placeOctaves(
      row.bars.flatMap((bar) =>
        bar.columns.map((column) => chordOf(column, open, fifths)),
      ),
    )
    const starts = row.bars.reduce<readonly number[]>(
      (at, bar) => [...at, (at.at(-1) ?? 0) + bar.columns.length],
      [0],
    )
    return {
      title: row.title ?? '',
      note: row.note ?? '',
      measures: row.bars.map((_, b) =>
        rhythm(
          measureAccidentals(
            placed.slice(starts[b] ?? 0, starts[b + 1] ?? placed.length),
            fifths ?? 0,
          ),
        ),
      ),
    }
  })
}

const HALF_BAR = 4

/**
 * Eighth notes side by side are beamed, in groups that do not cross the middle
 * of a 4/4 bar, so two beats read at a glance. A rest or a longer note breaks a
 * group, and a lone eighth is a group of one, flagged. Indexes into the
 * measure, so the beams can be drawn over the notes already laid out.
 */
export const beamGroups = (measure: Measure): readonly (readonly number[])[] =>
  measure.reduce<readonly (readonly number[])[]>((groups, event, i) => {
    if (event.kind !== 'note' || event.value !== 1) return groups
    const group = groups.at(-1)
    const before = measure[i - 1]
    return group !== undefined &&
      group.at(-1) === i - 1 &&
      before !== undefined &&
      Math.floor(before.at / HALF_BAR) === Math.floor(event.at / HALF_BAR)
      ? [...groups.slice(0, -1), [...group, i]]
      : [...groups, [i]]
  }, [])

/**
 * The key the tab's notes fit best: the major scale holding the most of them,
 * the one with fewer sharps or flats when two hold as many. Its relative minor
 * instead when that tonic is played more often than the major's. Null for a tab
 * with no notes.
 */
export const suggestKey = (score: Score): Key | null => {
  const open = openPitches(score.tuning)
  const counts = score.rows
    .flatMap((row) => row.bars.flatMap((bar) => bar.columns))
    .flatMap((column) =>
      column.cells.flatMap((cell, slot) => {
        const string = open[slot]
        return cell?.kind === 'fret' && string !== undefined
          ? [(string + cell.fret) % 12]
          : []
      }),
    )
    .reduce<readonly number[]>(
      (tally, pc) => tally.map((count, i) => (i === pc ? count + 1 : count)),
      Array.from({ length: 12 }, () => 0),
    )
  if (counts.every((count) => count === 0)) return null
  const countOf = (pc: number): number => counts[((pc % 12) + 12) % 12] ?? 0
  const tonic = (key: Key): number => FIFTHS[key] * 7
  const fit = (key: Key): number =>
    // C major's naturals, as steps above a tonic, are every major scale.
    NATURALS.reduce<number>((sum, step) => sum + countOf(tonic(key) + step), 0)
  const majors = KEYS.filter((key) => !key.endsWith('m'))
  const best = [...majors].sort(
    (a, b) => fit(b) - fit(a) || Math.abs(FIFTHS[a]) - Math.abs(FIFTHS[b]),
  )[0]
  if (best === undefined) return null
  const minor = KEYS.find((key) => key.endsWith('m') && FIFTHS[key] === FIFTHS[best])
  return minor !== undefined && countOf(tonic(best) + 9) > countOf(tonic(best))
    ? minor
    : best
}
