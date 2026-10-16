import {
  beamGroups,
  type Accidental,
  type Event,
  type Measure,
  type Ottava,
  type Pitch,
  type System,
  type Value,
} from '../core/notation.ts'

/**
 * Drawn in staff spaces, the gap between two lines, and sized in ems so the
 * staff grows and shrinks with the text size Practice picks.
 */
const SPACE_EM = 0.65
const CLEF = 3.4
const KEY_ACCIDENTAL = 1
// A key signature's flats are set larger than a note's, as its sharps already read.
const KEY_FLAT = 1.3
const NOTE = 4.5
const EIGHTH = 3.8
const ACCIDENTAL = 1.6
const STEM = 3.5
const PAD = 2
const NAME = 1.6
const NAME_ROOM = 2.5
const OTTAVA_ROOM = 2
const OTTAVA_MARK = 2.4

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
const yOf = (step: number): number => (8 - step) / 2

// Where a treble key signature puts its sharps and flats, in the order a key
// adds them: F C G D A E B, and B E A D G C F.
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4] as const
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1] as const

const signatureOf = (
  fifths: number,
): readonly { readonly step: number; readonly accidental: Accidental }[] =>
  fifths >= 0
    ? SHARP_STEPS.slice(0, fifths).map((step) => ({ step, accidental: 'sharp' }))
    : FLAT_STEPS.slice(0, -fifths).map((step) => ({ step, accidental: 'flat' }))

// How far below a note's line or space each glyph's baseline goes, so its
// middle sits on the note: a flat's bowl is low in the glyph, a sharp's middle high.
const DROP: Readonly<Record<Accidental, number>> = {
  flat: 0.2,
  sharp: 0.65,
  natural: 0.45,
}

const GLYPH: Readonly<Record<Accidental, string>> = {
  flat: '♭',
  sharp: '♯',
  natural: '♮',
}

// The clef and key signature already hold the first note off the bar line, so
// only half the pad a measure opens with follows them.
const startOf = (first: boolean, fifths: number): number =>
  first ? CLEF + Math.abs(fifths) * KEY_ACCIDENTAL + PAD / 2 : PAD

/** Where each note or rest is centred, and where the measure ends. */
const layout = (
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

/** A measure, or as much of one as fits a line: only its last piece closes on a bar line. */
type Piece = { readonly measure: Measure; readonly closed: boolean }

/**
 * A measure too wide for a line goes on over as many lines as it needs, cut
 * between notes, rather than running off the side of a phone.
 */
const piecesOf = (measure: Measure, room: number, fifths: number): readonly Piece[] => {
  const parts = measure.reduce<readonly Measure[]>((parts, event) => {
    const current = parts.at(-1)
    return current !== undefined &&
      measureWidth([...current, event], true, fifths) <= room
      ? [...parts.slice(0, -1), [...current, event]]
      : [...parts, [event]]
  }, [])
  return parts.length === 0
    ? [{ measure, closed: true }]
    : parts.map((part, i) => ({ measure: part, closed: i === parts.length - 1 }))
}

/**
 * Measures set into lines as wide as the room, each line opening on a clef and
 * the key signature the way printed music does. Broken here rather than left to
 * the browser to wrap, because only here is it known which measure starts a
 * line and needs them.
 */
const breakLines = (
  measures: readonly Measure[],
  room: number,
  fifths: number,
): readonly (readonly Piece[])[] =>
  measures
    .flatMap((measure) => piecesOf(measure, room, fifths))
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

const pitchesAt = (measure: Measure, i: number): Pitches => {
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
 * out to its furthest head, stem or beam and no further, with room for chord
 * names on top when there are any.
 */
type Reach = { readonly above: number; readonly below: number; readonly named: boolean }

const reach = (system: System): Reach => {
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
  const top = Math.min(0, ...extents.map((extent) => extent.top))
  const bottom = Math.max(4, ...extents.map((extent) => extent.bottom))
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
const ledgers = (step: number): readonly number[] =>
  step <= -2
    ? Array.from({ length: Math.floor(-step / 2) }, (_, i) => -2 * (i + 1))
    : step >= 10
      ? Array.from({ length: Math.floor((step - 8) / 2) }, (_, i) => 10 + 2 * i)
      : []

const BEAM = 0.5

type Pitches = readonly Pitch[]

/** Stems go on the side away from the middle line, where the notes sit lower. */
const stemsUp = (pitches: Pitches): boolean =>
  pitches.reduce((sum, pitch) => sum + pitch.step, 0) / pitches.length < 4

const stemX = (x: number, up: boolean): number => (up ? x + 0.6 : x - 0.6)

/** Where a stem ends when nothing else decides it: a stem's length past the furthest head. */
const ownTip = (pitches: Pitches, up: boolean): number =>
  up
    ? Math.min(yOf(pitches.at(-1)?.step ?? 0) - STEM, 2)
    : Math.max(yOf(pitches[0]?.step ?? 0) + STEM, 2)

/**
 * A note or chord: its heads, open for a half or a whole, and a stem out to
 * `tip` unless it is a whole. A head a step from the one below it moves across
 * the stem, as two heads on neighbouring lines and spaces cannot share a column.
 */
function Note({
  pitches,
  x,
  up,
  tip,
  value,
}: {
  readonly pitches: Pitches
  readonly x: number
  readonly up: boolean
  readonly tip: number
  readonly value: Value
}) {
  const low = pitches[0]?.step ?? 0
  const high = pitches.at(-1)?.step ?? 0
  const shifted = pitches.reduce<readonly boolean[]>(
    (acc, pitch, i) => [
      ...acc,
      i > 0 && pitch.step - (pitches[i - 1]?.step ?? 0) === 1 && acc[i - 1] !== true,
    ],
    [],
  )
  const headX = (i: number): number =>
    shifted[i] === true ? (up ? x + 1.2 : x - 1.2) : x
  return (
    <g>
      {[...new Set(pitches.flatMap((pitch) => ledgers(pitch.step)))].map((step) => {
        // Only under the heads that sit on or past it, so a head moved across
        // the stem inside the staff does not drag the line out to it.
        const xs = pitches.flatMap((pitch, i) =>
          ledgers(pitch.step).includes(step) ? [headX(i)] : [],
        )
        return (
          <line
            key={step}
            x1={Math.min(...xs) - 1}
            x2={Math.max(...xs) + 1}
            y1={yOf(step)}
            y2={yOf(step)}
            className="ledger"
          />
        )
      })}
      {pitches.map((pitch, i) => (
        <g key={i}>
          <ellipse
            cx={headX(i)}
            cy={yOf(pitch.step)}
            rx={0.62}
            ry={0.44}
            transform={`rotate(-20 ${headX(i)} ${yOf(pitch.step)})`}
            className={value >= 4 ? 'open' : undefined}
          />
          {pitch.accidental !== null && (
            <text
              x={headX(i) - 0.85}
              y={yOf(pitch.step) + DROP[pitch.accidental]}
              textAnchor="end"
              className="accidental"
            >
              {GLYPH[pitch.accidental]}
            </text>
          )}
        </g>
      ))}
      {value !== 8 && (
        <line
          x1={stemX(x, up)}
          x2={stemX(x, up)}
          y1={up ? yOf(low) : yOf(high)}
          y2={tip}
          className="stem"
        />
      )}
    </g>
  )
}

/**
 * A whole rest hangs from the second line down and a half sits on the middle
 * one; a quarter and an eighth are drawn as their usual squiggle and hook.
 */
function Rest({ value, x }: { readonly value: Value; readonly x: number }) {
  switch (value) {
    case 8:
      return <rect x={x - 0.6} y={1} width={1.2} height={0.5} className="rest" />
    case 4:
      return <rect x={x - 0.6} y={1.5} width={1.2} height={0.5} className="rest" />
    case 2:
      return (
        <path
          d={`M${x - 0.2} 0.7 L${x + 0.5} 1.6 L${x - 0.2} 2.3 L${x + 0.5} 3 Q${x - 0.6} 2.8 ${x + 0.1} 3.7`}
          className="rest-stroke"
        />
      )
    case 1:
      return (
        <g>
          <circle cx={x - 0.35} cy={1.6} r={0.3} className="rest" />
          <path
            d={`M${x - 0.35} 1.75 Q${x + 0.1} 1.8 ${x + 0.5} 1.3 L${x - 0.1} 3.1`}
            className="rest-stroke thin"
          />
        </g>
      )
  }
}

/**
 * Eighths beamed together: one stem direction for the group, every stem run
 * out to one flat beam past the furthest note. A group of one is flagged.
 */
function Beamed({
  chords,
  xs,
}: {
  readonly chords: readonly Pitches[]
  readonly xs: readonly number[]
}) {
  const up = stemsUp(chords.flat())
  const tips = chords.map((pitches) => ownTip(pitches, up))
  const tip = up ? Math.min(...tips) : Math.max(...tips)
  const first = stemX(xs[0] ?? 0, up)
  const last = stemX(xs.at(-1) ?? 0, up)
  return (
    <g>
      {chords.map((pitches, i) => (
        <Note key={i} pitches={pitches} x={xs[i] ?? 0} up={up} tip={tip} value={1} />
      ))}
      {chords.length > 1 ? (
        <rect
          x={first}
          y={up ? tip : tip - BEAM}
          width={last - first}
          height={BEAM}
          className="beam"
        />
      ) : (
        <path
          d={
            up
              ? `M${first} ${tip} c0.2 1.2 1.7 1.5 1.3 3.2`
              : `M${first} ${tip} c0.2 -1.2 1.7 -1.5 1.3 -3.2`
          }
          className="flag"
        />
      )}
    </g>
  )
}

type Run = { readonly ottava: '8va' | '8vb'; readonly from: number; readonly to: number }

/** Notes under one 8va or 8vb, rests between them and all, so each run gets one bracket. */
const ottavaRuns = (measure: Measure): readonly Run[] =>
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

const firstNote = (measure: Measure): number =>
  measure.findIndex((event) => event.kind === 'note')
const lastNote = (measure: Measure): number =>
  measure.findLastIndex((event) => event.kind === 'note')

const ottavaOf = (measure: Measure, i: number): Ottava => {
  const event = measure[i]
  return event?.kind === 'note' ? event.chord.ottava : null
}

/**
 * The ottava the measures either side of this one on its line leave off and
 * pick up with, so a bracket carries over a bar line rather than starting again.
 */
type Neighbours = { readonly before: Ottava; readonly after: Ottava }

function MeasureStaff({
  piece,
  first,
  fifths,
  reach: { above, below, named },
  neighbours: { before, after },
}: {
  readonly piece: Piece
  readonly first: boolean
  readonly fifths: number
  readonly reach: Reach
  readonly neighbours: Neighbours
}) {
  const { measure, closed } = piece
  const { xs, width: notes } = layout(measure, first, fifths)
  const groups = beamGroups(measure)
  const beamed = new Set(groups.flat())
  const width = notes + PAD
  const height = above + 4 + below
  return (
    <svg
      viewBox={`0 ${-above} ${width} ${height}`}
      style={{ width: `${width * SPACE_EM}em`, height: `${height * SPACE_EM}em` }}
    >
      {[0, 1, 2, 3, 4].map((line) => (
        <line key={line} x1={0} x2={width} y1={line} y2={line} className="staff-line" />
      ))}
      {first && (
        <>
          <text x={0.3} y={4.9} className="clef">
            𝄞
          </text>
          {signatureOf(fifths).map(({ step, accidental }, i) => (
            <text
              key={i}
              x={CLEF + (i + 0.5) * KEY_ACCIDENTAL}
              y={yOf(step) + DROP[accidental] * (accidental === 'flat' ? KEY_FLAT : 1)}
              textAnchor="middle"
              className={accidental === 'flat' ? 'accidental key-flat' : 'accidental'}
            >
              {GLYPH[accidental]}
            </text>
          ))}
        </>
      )}
      {measure.map((event, i) => {
        const x = xs[i] ?? 0
        if (event.kind === 'rest') return <Rest key={i} value={event.value} x={x} />
        if (beamed.has(i)) return null
        const up = stemsUp(event.chord.pitches)
        return (
          <Note
            key={i}
            pitches={event.chord.pitches}
            x={x}
            up={up}
            tip={ownTip(event.chord.pitches, up)}
            value={event.value}
          />
        )
      })}
      {groups.map((group) => (
        <Beamed
          key={group.join()}
          chords={group.map((i) => pitchesAt(measure, i))}
          xs={group.map((i) => xs[i] ?? 0)}
        />
      ))}
      {measure.map((event, i) =>
        event.kind === 'note' && event.chord.name !== null ? (
          <text
            key={i}
            x={xs[i] ?? 0}
            y={-above + NAME}
            textAnchor="middle"
            className="chord-name"
          >
            {event.chord.name}
          </text>
        ) : null,
      )}
      {ottavaRuns(measure).map(({ ottava, from, to }) => {
        const carriedIn = from === firstNote(measure) && before === ottava
        const carriedOn = to === lastNote(measure) && after === ottava
        const start = carriedIn ? 0 : (xs[from] ?? 0) - 0.8
        const line = carriedIn ? 0 : start + OTTAVA_MARK
        const end = carriedOn ? width : (xs[to] ?? 0) + 0.8
        const y =
          ottava === '8va' ? -above + (named ? NAME_ROOM : 0) + 1.4 : 4 + below - 0.4
        const rule = y - 0.45
        return (
          <g key={from}>
            {!carriedIn && (
              <text x={start} y={y} className="ottava">
                {ottava}
              </text>
            )}
            {end > line && (
              <line x1={line} x2={end} y1={rule} y2={rule} className="ottava-line" />
            )}
            {!carriedOn && end > line && (
              <line
                x1={end}
                x2={end}
                y1={rule}
                y2={rule + (ottava === '8va' ? 1 : -1)}
                className="ottava-hook"
              />
            )}
          </g>
        )
      })}
      {closed && <line x1={width} x2={width} y1={0} y2={4} className="measure-end" />}
    </svg>
  )
}

const INSET_EM = 1.25

/**
 * The tab again as treble-clef notation in the song's key, `fifths` sharps or
 * flats, with a staff per row of tab broken into lines that fit `width`, in
 * ems. That is the width of the page's column, not of this box: the box is as
 * wide as its lines, so measuring it would shrink the lines to fit themselves.
 */
export function Notation({
  systems,
  width,
  fifths,
}: {
  readonly systems: readonly System[]
  readonly width: number
  readonly fifths: number
}) {
  const room = (width - 2 * INSET_EM) / SPACE_EM
  return (
    <div
      className="notation"
      style={{ padding: `1em ${INSET_EM}em` }}
      aria-label="Notation"
    >
      {systems.map((system, row) => {
        const extent = reach(system)
        return (
          <div key={row}>
            {system.title !== '' && <h4>{system.title}</h4>}
            {system.note !== '' && <p className="tab-note">{system.note}</p>}
            {breakLines(system.measures, room, fifths).map((line, index) => (
              <div key={index} className="notation-line">
                {line.map((piece, bar) => {
                  const previous = line[bar - 1]?.measure
                  const next = line[bar + 1]?.measure
                  return (
                    <MeasureStaff
                      key={bar}
                      piece={piece}
                      first={bar === 0}
                      fifths={fifths}
                      reach={extent}
                      neighbours={{
                        before:
                          previous === undefined
                            ? null
                            : ottavaOf(previous, lastNote(previous)),
                        after:
                          next === undefined ? null : ottavaOf(next, firstNote(next)),
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
