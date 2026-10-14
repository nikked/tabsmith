import { beamGroups, type Chord, type Measure, type System } from '../core/notation.ts'

/**
 * Drawn in staff spaces, the gap between two lines, and sized in ems so the
 * staff grows and shrinks with the text size Practice picks.
 */
const SPACE_EM = 0.65
const CLEF = 5
const NOTE = 4.5
const ACCIDENTAL = 1.6
const STEM = 3.5
const PAD = 2
const NAME = 1.6
const NAME_ROOM = 2.5

/**
 * The room one quarter takes across the staff: a flat goes in front of it, and
 * a chord name above is never allowed to run into the next one.
 */
const textWidth = (text: string): number =>
  text === '' ? 0 : text.length * NAME * 0.62 + 1

const slotOf = (chord: Chord): { readonly lead: number; readonly body: number } => ({
  lead: chord.pitches.some((pitch) => pitch.accidental !== null) ? ACCIDENTAL : 0,
  body: Math.max(NOTE, textWidth(chord.name ?? '')),
})

/** Steps run up from the bottom line, y runs down from the top one. */
const yOf = (step: number): number => (8 - step) / 2

const startOf = (first: boolean): number => (first ? CLEF : 0) + PAD

/** Where each quarter's heads are centred, and where the measure ends. */
const layout = (
  measure: Measure,
  first: boolean,
): { readonly xs: readonly number[]; readonly width: number } =>
  measure.reduce<{ readonly xs: readonly number[]; readonly width: number }>(
    ({ xs, width }, chord) => {
      const { lead, body } = slotOf(chord)
      return { xs: [...xs, width + lead + body / 2], width: width + lead + body }
    },
    { xs: [], width: startOf(first) },
  )

const measureWidth = (measure: Measure, first: boolean): number =>
  layout(measure, first).width + PAD

/**
 * Measures set into lines as wide as the room, each line opening on a clef the
 * way printed music does. Broken here rather than left to the browser to wrap,
 * because only here is it known which measure starts a line and needs the clef.
 * A measure wider than the room still gets a line of its own.
 */
const breakLines = (
  measures: readonly Measure[],
  room: number,
): readonly (readonly Measure[])[] =>
  measures.reduce<{
    readonly lines: readonly (readonly Measure[])[]
    readonly used: number
  }>(
    ({ lines, used }, measure) => {
      const current = lines.at(-1)
      const after = used + measureWidth(measure, false)
      return current !== undefined && current.length > 0 && after <= room
        ? { lines: [...lines.slice(0, -1), [...current, measure]], used: after }
        : { lines: [...lines, [measure]], used: measureWidth(measure, true) }
    },
    { lines: [], used: 0 },
  ).lines

/**
 * Which way each stem in a measure points: a beamed group's notes share one
 * direction, as the Beamed group draws them, and anything else picks its own.
 */
const stemDirections = (measure: Measure): readonly boolean[] => {
  const groups = beamGroups(measure)
  if (groups === null) return measure.map((chord) => stemsUp(chord.pitches))
  return groups.flatMap((group) => {
    const up = stemsUp(group.flatMap((i) => measure[i]?.pitches ?? []))
    return group.map(() => up)
  })
}

/**
 * How far a system reaches past the staff, so every measure in it lines up:
 * out to its furthest head, stem or beam and no further, with room for chord
 * names on top when there are any.
 */
const reach = (system: System): { readonly above: number; readonly below: number } => {
  const extents = system.measures.flatMap((measure) => {
    const ups = stemDirections(measure)
    return measure.map((chord, i) => {
      const high = yOf(chord.pitches.at(-1)?.step ?? 0)
      const low = yOf(chord.pitches[0]?.step ?? 0)
      return ups[i] === true
        ? { top: high - STEM, bottom: low + 0.5 }
        : { top: high - 0.5, bottom: low + STEM }
    })
  })
  const top = Math.min(0, ...extents.map((extent) => extent.top))
  const bottom = Math.max(4, ...extents.map((extent) => extent.bottom))
  const named = system.measures.flat().some((chord) => chord.name !== null)
  return {
    above: -top + 0.5 + (named ? NAME_ROOM : 0),
    below: bottom - 4 + 0.5,
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

type Pitches = Chord['pitches']

/** Stems go on the side away from the middle line, where the notes sit lower. */
const stemsUp = (pitches: Pitches): boolean =>
  pitches.reduce((sum, pitch) => sum + pitch.step, 0) / pitches.length < 4

const stemX = (x: number, up: boolean): number => (up ? x + 0.6 : x - 0.6)

/** Where a stem ends when nothing else decides it: a stem's length past the furthest head. */
const ownTip = (pitches: Pitches, up: boolean): number =>
  up ? yOf(pitches.at(-1)?.step ?? 0) - STEM : yOf(pitches[0]?.step ?? 0) + STEM

/**
 * A note or chord: its heads, and a stem out to `tip`. A head a step from the
 * one below it moves across the stem, as two heads on neighbouring lines and
 * spaces cannot share a column.
 */
function Note({
  pitches,
  x,
  up,
  tip,
}: {
  readonly pitches: Pitches
  readonly x: number
  readonly up: boolean
  readonly tip: number
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
      {[...new Set(pitches.flatMap((pitch) => ledgers(pitch.step)))].map((step) => (
        <line
          key={step}
          x1={Math.min(...pitches.map((_, i) => headX(i))) - 1}
          x2={Math.max(...pitches.map((_, i) => headX(i))) + 1}
          y1={yOf(step)}
          y2={yOf(step)}
          className="ledger"
        />
      ))}
      {pitches.map((pitch, i) => (
        <g key={i}>
          <ellipse
            cx={headX(i)}
            cy={yOf(pitch.step)}
            rx={0.62}
            ry={0.44}
            transform={`rotate(-20 ${headX(i)} ${yOf(pitch.step)})`}
          />
          {pitch.accidental !== null && (
            <text
              x={headX(i) - 0.85}
              y={yOf(pitch.step) + 0.45}
              textAnchor="end"
              className="accidental"
            >
              {pitch.accidental === 'flat' ? '♭' : '♯'}
            </text>
          )}
        </g>
      ))}
      <line
        x1={stemX(x, up)}
        x2={stemX(x, up)}
        y1={up ? yOf(low) : yOf(high)}
        y2={tip}
        className="stem"
      />
    </g>
  )
}

/**
 * Eighths beamed together: one stem direction for the group, every stem run
 * out to one flat beam past the furthest note. A group of one is flagged.
 */
function Beamed({
  chords,
  xs,
}: {
  readonly chords: readonly Chord[]
  readonly xs: readonly number[]
}) {
  const up = stemsUp(chords.flatMap((chord) => chord.pitches))
  const tips = chords.map((chord) => ownTip(chord.pitches, up))
  const tip = up ? Math.min(...tips) : Math.max(...tips)
  const first = stemX(xs[0] ?? 0, up)
  const last = stemX(xs.at(-1) ?? 0, up)
  return (
    <g>
      {chords.map((chord, i) => (
        <Note key={i} pitches={chord.pitches} x={xs[i] ?? 0} up={up} tip={tip} />
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

function MeasureStaff({
  measure,
  first,
  above,
  below,
}: {
  readonly measure: Measure
  readonly first: boolean
  readonly above: number
  readonly below: number
}) {
  const { xs, width: notes } = layout(measure, first)
  const groups = beamGroups(measure)
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
        <text x={0.3} y={4.9} className="clef">
          𝄞
        </text>
      )}
      {groups === null
        ? measure.map((chord, i) => {
            const up = stemsUp(chord.pitches)
            return (
              <Note
                key={i}
                pitches={chord.pitches}
                x={xs[i] ?? 0}
                up={up}
                tip={ownTip(chord.pitches, up)}
              />
            )
          })
        : groups.map((group) => (
            <Beamed
              key={group.join()}
              chords={group.flatMap((i) => measure[i] ?? [])}
              xs={group.map((i) => xs[i] ?? 0)}
            />
          ))}
      {measure.map((chord, i) => {
        const x = xs[i] ?? 0
        return (
          <g key={i}>
            {chord.name !== null && (
              <text x={x} y={-above + NAME} textAnchor="middle" className="chord-name">
                {chord.name}
              </text>
            )}
          </g>
        )
      })}
      <line x1={width} x2={width} y1={0} y2={4} className="measure-end" />
    </svg>
  )
}

const INSET_EM = 1.25

/**
 * The tab again as treble-clef notation, one note or chord per column played,
 * with a staff per row of tab broken into lines that fit `width`, in ems. That
 * is the width of the page's column, not of this box: the box is as wide as
 * its lines, so measuring it would shrink the lines to fit themselves.
 */
export function Notation({
  systems,
  width,
}: {
  readonly systems: readonly System[]
  readonly width: number
}) {
  const room = (width - 2 * INSET_EM) / SPACE_EM
  return (
    <div
      className="notation"
      style={{ padding: `1em ${INSET_EM}em` }}
      aria-label="Notation"
    >
      {systems.map((system, row) => {
        const { above, below } = reach(system)
        return (
          <div key={row}>
            {system.title !== '' && <h4>{system.title}</h4>}
            {system.note !== '' && <p className="tab-note">{system.note}</p>}
            {breakLines(system.measures, room).map((line, index) => (
              <div key={index} className="notation-line">
                {line.map((measure, bar) => (
                  <MeasureStaff
                    key={bar}
                    measure={measure}
                    first={bar === 0}
                    above={above}
                    below={below}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
