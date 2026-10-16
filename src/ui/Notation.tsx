import {
  breakLines,
  CLEF,
  firstNote,
  KEY_ACCIDENTAL,
  lastNote,
  layout,
  ledgers,
  NAME,
  NAME_ROOM,
  ottavaOf,
  ottavaRuns,
  ownTip,
  PAD,
  pitchesAt,
  reach,
  shiftedHeads,
  signatureOf,
  stemsUp,
  yOf,
  type Piece,
  type Pitches,
  type Reach,
} from '../core/engrave.ts'
import {
  beamGroups,
  type Accidental,
  type Ottava,
  type System,
  type Value,
} from '../core/notation.ts'

/**
 * Drawn in staff spaces, the gap between two lines, and sized in ems so the
 * staff grows and shrinks with the text size Practice picks.
 */
const SPACE_EM = 0.65
const OTTAVA_MARK = 2.4

/**
 * SMuFL code points in the bundled notation font, a subset of Bravura. Its em
 * is four staff spaces, and each glyph's baseline is the line or space it
 * belongs on, so a glyph is placed at its note's y with no offset.
 */
const SMUFL = {
  gClef: '\uE050',
  noteheadWhole: '\uE0A2',
  noteheadHalf: '\uE0A3',
  noteheadBlack: '\uE0A4',
  flag8thUp: '\uE240',
  flag8thDown: '\uE241',
  restWhole: '\uE4E3',
  restHalf: '\uE4E4',
  restQuarter: '\uE4E5',
  rest8th: '\uE4E6',
} as const

const GLYPH: Readonly<Record<Accidental, string>> = {
  flat: '\uE260',
  natural: '\uE261',
  sharp: '\uE262',
}

// Bravura's widths, in staff spaces: a black or half notehead, and each
// accidental, so an accidental is set a small gap clear of its head.
const HEAD = 1.18
const ACCIDENTAL_WIDTH: Readonly<Record<Accidental, number>> = {
  flat: 0.904,
  natural: 0.672,
  sharp: 0.996,
}

const noteheadOf = (value: Value): string =>
  value === 8
    ? SMUFL.noteheadWhole
    : value === 4
      ? SMUFL.noteheadHalf
      : SMUFL.noteheadBlack

const REST: Readonly<Record<Value, { readonly glyph: string; readonly y: number }>> = {
  // A whole rest hangs from the second line down; the rest sit on the middle one.
  8: { glyph: SMUFL.restWhole, y: 1 },
  4: { glyph: SMUFL.restHalf, y: 2 },
  2: { glyph: SMUFL.restQuarter, y: 2 },
  1: { glyph: SMUFL.rest8th, y: 2 },
}

const BEAM = 0.5

const stemX = (x: number, up: boolean): number => (up ? x + 0.53 : x - 0.53)

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
  const shifted = shiftedHeads(pitches)
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
          <text x={headX(i)} y={yOf(pitch.step)} textAnchor="middle" className="music">
            {noteheadOf(value)}
          </text>
          {pitch.accidental !== null && (
            <text
              x={headX(i) - HEAD / 2 - 0.35 - ACCIDENTAL_WIDTH[pitch.accidental]}
              y={yOf(pitch.step)}
              className="music"
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

function Rest({ value, x }: { readonly value: Value; readonly x: number }) {
  const { glyph, y } = REST[value]
  return (
    <text x={x} y={y} textAnchor="middle" className="music">
      {glyph}
    </text>
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
        // A flag hangs off the stem's end from the stem's left edge.
        <text x={first - 0.065} y={tip} className="music">
          {up ? SMUFL.flag8thUp : SMUFL.flag8thDown}
        </text>
      )}
    </g>
  )
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
          {/* The G clef curls round the second line up, where G is. */}
          <text x={0.3} y={yOf(2)} className="music">
            {SMUFL.gClef}
          </text>
          {signatureOf(fifths).map(({ step, accidental }, i) => (
            <text
              key={i}
              x={CLEF + (i + 0.5) * KEY_ACCIDENTAL}
              y={yOf(step)}
              textAnchor="middle"
              className="music"
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
