import {
  beamGroups,
  type Accidental,
  type Event,
  type Measure,
  type Ottava,
  type Pitch,
  type Shift,
  type System,
} from './notation.ts'

/*
 * Where notation goes on the staff, in staff spaces, the gap between two
 * lines: how wide each note and measure is, where lines break, which way stems
 * point and how far a system reaches. Drawing it is the UI's job.
 */

export const CLEF = 3.4
export const KEY_ACCIDENTAL = 1.1
const NOTE = 4.5
const EIGHTH = 3.8
const ACCIDENTAL = 1.6
const STEM = 3.5
export const PAD = 2
export const NAME = 1.6
export const NAME_ROOM = 2.5
const OTTAVA_ROOM = 2
// How far the G clef's curl and tail reach past the top and bottom lines (SMuFL
// gClef bounds), which a system with every note inside the staff must still clear.
const CLEF_ABOVE = 1.4
const CLEF_BELOW = 1.65

/**
 * The room one note or rest takes across the staff, an eighth a little less
 * than the rest. A chord name above is never allowed to run into the next one.
 * An accidental fits in the gap to the note before, so heads stay evenly apart;
 * only a measure's first note, with no note before it, makes room for one.
 */
const textWidth = (text: string): number =>
  text === '' ? 0 : text.length * NAME * 0.62 + 1

const slotOf = (
  event: Event,
  opening: boolean,
): { readonly lead: number; readonly body: number } =>
  event.kind === 'rest'
    ? { lead: 0, body: NOTE }
    : {
        lead:
          opening && event.chord.pitches.some((pitch) => pitch.accidental !== null)
            ? ACCIDENTAL
            : 0,
        body: Math.max(
          event.value === 1 ? EIGHTH : NOTE,
          textWidth(event.chord.name ?? ''),
        ),
      }

/** Steps run up from the bottom line, y runs down from the top one. */
export const yOf = (step: number): number => (8 - step) / 2

// Where a treble key signature puts its sharps and flats, in the order a key
// adds them: F C G D A E B, and B E A D G C F.
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4] as const
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1] as const

export const signatureOf = (
  fifths: number,
): readonly { readonly step: number; readonly accidental: Accidental }[] =>
  fifths >= 0
    ? SHARP_STEPS.slice(0, fifths).map((step) => ({ step, accidental: 'sharp' }))
    : FLAT_STEPS.slice(0, -fifths).map((step) => ({ step, accidental: 'flat' }))

// The clef and key signature already hold the first note off the bar line, so
// only half the pad a measure opens with follows them.
const startOf = (first: boolean, fifths: number): number =>
  first ? CLEF + Math.abs(fifths) * KEY_ACCIDENTAL + PAD / 2 : PAD

/** Where each note or rest is centred, and where the measure ends. */
export const layout = (
  measure: Measure,
  first: boolean,
  fifths: number,
): { readonly xs: readonly number[]; readonly width: number } =>
  measure.reduce<{ readonly xs: readonly number[]; readonly width: number }>(
    ({ xs, width }, event, i) => {
      const { lead, body } = slotOf(event, i === 0)
      return { xs: [...xs, width + lead + body / 2], width: width + lead + body }
    },
    { xs: [], width: startOf(first, fifths) },
  )

const measureWidth = (measure: Measure, first: boolean, fifths: number): number =>
  layout(measure, first, fifths).width + PAD

/**
 * A measure, or as much of one as fits a line: only its last piece closes on a
 * bar line. `bar` is which of the system's measures it is from, so a note in it
 * can be traced back to its column of tab.
 */
export type Piece = {
  readonly measure: Measure
  readonly closed: boolean
  readonly bar: number
}

/**
 * A measure too wide for a line goes on over as many lines as it needs, cut
 * between notes, rather than running off the side of a phone.
 */
const piecesOf = (
  measure: Measure,
  bar: number,
  room: number,
  fifths: number,
): readonly Piece[] => {
  const parts = measure.reduce<readonly Measure[]>((parts, event) => {
    const current = parts.at(-1)
    return current !== undefined &&
      measureWidth([...current, event], true, fifths) <= room
      ? [...parts.slice(0, -1), [...current, event]]
      : [...parts, [event]]
  }, [])
  return parts.length === 0
    ? [{ measure, closed: true, bar }]
    : parts.map((part, i) => ({ measure: part, closed: i === parts.length - 1, bar }))
}

/**
 * Measures set into lines as wide as the room, each line opening on a clef and
 * the key signature the way printed music does. Broken here rather than left to
 * the browser to wrap, because only here is it known which measure starts a
 * line and needs them.
 */
export const breakLines = (
  measures: readonly Measure[],
  room: number,
  fifths: number,
): readonly (readonly Piece[])[] =>
  measures
    .flatMap((measure, bar) => piecesOf(measure, bar, room, fifths))
    .reduce<{
      readonly lines: readonly (readonly Piece[])[]
      readonly used: number
    }>(
      ({ lines, used }, piece) => {
        const current = lines.at(-1)
        const after = used + measureWidth(piece.measure, false, fifths)
        return current !== undefined && current.length > 0 && after <= room
          ? { lines: [...lines.slice(0, -1), [...current, piece]], used: after }
          : {
              lines: [...lines, [piece]],
              used: measureWidth(piece.measure, true, fifths),
            }
      },
      { lines: [], used: 0 },
    ).lines

export const pitchesAt = (measure: Measure, i: number): Pitches => {
  const event = measure[i]
  return event?.kind === 'note' ? event.chord.pitches : []
}

/**
 * Which way each stem in a measure points: a beamed group's notes share one
 * direction, as the Beamed group draws them, and anything else picks its own.
 */
const stemDirections = (measure: Measure): readonly boolean[] => {
  const shared = new Map(
    beamGroups(measure).flatMap((group) => {
      const up = stemsUp(group.flatMap((i) => pitchesAt(measure, i)))
      return group.map((i) => [i, up] as const)
    }),
  )
  return measure.map((_, i) => shared.get(i) ?? stemsUp(pitchesAt(measure, i)))
}

/**
 * How far a system reaches past the staff, so every measure in it lines up:
 * out to its furthest head, stem or beam, or the clef if that reaches further,
 * with room for chord names on top when there are any.
 */
export type Reach = {
  readonly above: number
  readonly below: number
  readonly named: boolean
}

export const reach = (system: System): Reach => {
  const extents = system.measures.flatMap((measure) => {
    const ups = stemDirections(measure)
    return measure.flatMap((event, i) => {
      if (event.kind === 'rest') return []
      const high = yOf(event.chord.pitches.at(-1)?.step ?? 0)
      const low = yOf(event.chord.pitches[0]?.step ?? 0)
      const stem = event.value === 8 ? 0.5 : STEM
      return ups[i] === true
        ? [{ top: high - stem, bottom: low + 0.5 }]
        : [{ top: high - 0.5, bottom: low + stem }]
    })
  })
  const top = Math.min(-CLEF_ABOVE, ...extents.map((extent) => extent.top))
  const bottom = Math.max(4 + CLEF_BELOW, ...extents.map((extent) => extent.bottom))
  const notes = system.measures
    .flat()
    .flatMap((event) => (event.kind === 'note' ? [event.chord] : []))
  const named = notes.some((chord) => chord.name !== null)
  const up = notes.some((chord) => chord.ottava === '8va')
  const down = notes.some((chord) => chord.ottava === '8vb')
  return {
    above: -top + 0.5 + (named ? NAME_ROOM : 0) + (up ? OTTAVA_ROOM : 0),
    below: bottom - 4 + 0.5 + (down ? OTTAVA_ROOM : 0),
    named,
  }
}

// Ledger lines fall on the even steps outside the staff, out to the note.
export const ledgers = (step: number): readonly number[] =>
  step <= -2
    ? Array.from({ length: Math.floor(-step / 2) }, (_, i) => -2 * (i + 1))
    : step >= 10
      ? Array.from({ length: Math.floor((step - 8) / 2) }, (_, i) => 10 + 2 * i)
      : []

export type Pitches = readonly Pitch[]

/** Stems go on the side away from the middle line, where the notes sit lower. */
export const stemsUp = (pitches: Pitches): boolean =>
  pitches.reduce((sum, pitch) => sum + pitch.step, 0) / pitches.length < 4

/** Where a stem ends when nothing else decides it: a stem's length past the furthest head. */
export const ownTip = (pitches: Pitches, up: boolean): number =>
  up
    ? Math.min(yOf(pitches.at(-1)?.step ?? 0) - STEM, 2)
    : Math.max(yOf(pitches[0]?.step ?? 0) + STEM, 2)

export type Run = { readonly ottava: Shift; readonly from: number; readonly to: number }

/** Notes under one 8va or 8vb, rests between them and all, so each run gets one bracket. */
export const ottavaRuns = (measure: Measure): readonly Run[] =>
  measure.reduce<readonly Run[]>((runs, event, i) => {
    const ottava = event.kind === 'note' ? event.chord.ottava : null
    if (ottava === null) return runs
    const last = runs.at(-1)
    return last !== undefined &&
      last.ottava === ottava &&
      measure.slice(last.to + 1, i).every((between) => between.kind === 'rest')
      ? [...runs.slice(0, -1), { ...last, to: i }]
      : [...runs, { ottava, from: i, to: i }]
  }, [])

export const firstNote = (measure: Measure): number =>
  measure.findIndex((event) => event.kind === 'note')
export const lastNote = (measure: Measure): number =>
  measure.findLastIndex((event) => event.kind === 'note')

export const ottavaOf = (measure: Measure, i: number): Ottava => {
  const event = measure[i]
  return event?.kind === 'note' ? event.chord.ottava : null
}

/**
 * Which heads of a chord move across the stem: a head a step from the one
 * below it, as two heads on neighbouring lines and spaces cannot share a
 * column, unless that one has already moved.
 */
export const shiftedHeads = (pitches: Pitches): readonly boolean[] =>
  pitches.reduce<readonly boolean[]>(
    (acc, pitch, i) => [
      ...acc,
      i > 0 && pitch.step - (pitches[i - 1]?.step ?? 0) === 1 && acc[i - 1] !== true,
    ],
    [],
  )
