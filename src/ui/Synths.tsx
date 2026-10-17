import { useRef, type KeyboardEvent } from 'react'
import type { Action } from '../core/edit.ts'
import { stepRow, type Cell } from '../core/fields.ts'
import type { Song, Synth } from '../core/model.ts'
import { suggestionsFor, synthNames } from '../core/synths.ts'
import { Suggest } from './Suggest.tsx'

type Props = {
  readonly song: Song
  /** Every song on the shelf, for what earlier songs set these synths to. */
  readonly songs: readonly Song[]
  readonly dispatch: (action: Action) => void
}

/**
 * One kind of control as a row of the synth's grid, each slot in the column of
 * its number so Knob 2 sits under Dial 2. A slot is added at the end and only
 * the last one taken away: removing one from the middle would renumber the
 * rest, and Knob 2 is a knob, not a list position. The buttons keep their own
 * columns past the widest row, so they line up whatever each row holds.
 */
function Controls({
  kind,
  row,
  field,
  slots,
  values,
  suggestions,
  onChange,
}: {
  readonly kind: 'Dial' | 'Knob'
  readonly row: number
  /** This row's number among every field row of the synths, for the arrows. */
  readonly field: number
  readonly slots: number
  readonly values: readonly string[]
  readonly suggestions: readonly string[]
  readonly onChange: (values: readonly string[]) => void
}) {
  return (
    <>
      <span className="synth-kind" style={{ gridRow: row, gridColumn: 1 }}>
        {kind}s
      </span>
      {values.map((value, index) => (
        <label
          key={index}
          className="synth-control"
          style={{ gridRow: row, gridColumn: index + 2 }}
        >
          <span>{index + 1}</span>
          <Suggest
            cell={{ row: field, col: index + 1 }}
            label={`${kind} ${index + 1}`}
            placeholder="—"
            value={value}
            suggestions={suggestions}
            onChange={(typed) =>
              onChange(values.map((each, i) => (i === index ? typed : each)))
            }
          />
        </label>
      ))}
      <button
        type="button"
        title={`Add ${kind.toLowerCase()} ${values.length + 1}`}
        style={{ gridRow: row, gridColumn: slots + 2 }}
        onClick={() => onChange([...values, ''])}
      >
        +
      </button>
      {values.length > 0 && (
        <button
          type="button"
          title={`Remove ${kind.toLowerCase()} ${values.length}`}
          style={{ gridRow: row, gridColumn: slots + 3 }}
          onClick={() => onChange(values.slice(0, -1))}
        >
          −
        </button>
      )}
    </>
  )
}

function SynthEditor({
  synth,
  index,
  songs,
  names,
  slots,
  dispatch,
}: {
  readonly synth: Synth
  readonly index: number
  readonly songs: readonly Song[]
  readonly names: readonly string[]
  readonly slots: number
  readonly dispatch: (action: Action) => void
}) {
  const set = (next: Synth) => dispatch({ kind: 'setSynth', index, synth: next })
  const used = suggestionsFor(songs, synth.name)
  return (
    <div
      className="synth"
      style={{
        // Narrowed to fit a phone rather than run off its side; anywhere wider
        // every column has room to reach its full width.
        gridTemplateColumns: `minmax(4rem, 7rem) repeat(${slots}, minmax(3.5rem, 9.5rem)) auto auto`,
      }}
    >
      <Suggest
        cell={{ row: index * 3, col: 0 }}
        className="synth-name"
        label={`Synth ${index + 1} name`}
        placeholder="Synth"
        style={{ gridRow: 1, gridColumn: 1 }}
        value={synth.name}
        suggestions={names}
        onChange={(name) => set({ ...synth, name })}
      />
      <Suggest
        cell={{ row: index * 3, col: 1 }}
        className="synth-sound"
        label={`Synth ${index + 1} sound`}
        placeholder="Sound"
        style={{ gridRow: 1, gridColumn: `2 / span ${slots}` }}
        value={synth.sound}
        suggestions={used.sounds}
        onChange={(sound) => set({ ...synth, sound })}
      />
      <button
        type="button"
        title="Remove this synth"
        style={{ gridRow: 1, gridColumn: slots + 3 }}
        onClick={() => dispatch({ kind: 'removeSynth', index })}
      >
        ✕
      </button>
      <Controls
        kind="Dial"
        row={2}
        field={index * 3 + 1}
        slots={slots}
        values={synth.dials}
        suggestions={used.dials}
        onChange={(dials) => set({ ...synth, dials })}
      />
      <Controls
        kind="Knob"
        row={3}
        field={index * 3 + 2}
        slots={slots}
        values={synth.knobs}
        suggestions={used.knobs}
        onChange={(knobs) => set({ ...synth, knobs })}
      />
    </div>
  )
}

/**
 * The synth patches a song needs, set before it starts. A synth already used
 * in another song can be added in one press, named as it was there; anything
 * typed is suggested from what that same synth was set to before.
 */
const cellOf = (node: Element): Cell | null => {
  const row = Number(node.getAttribute('data-row'))
  const col = Number(node.getAttribute('data-col'))
  return node.hasAttribute('data-row') && Number.isFinite(row) && Number.isFinite(col)
    ? { row, col }
    : null
}

export function Synths({ song, songs, dispatch }: Props) {
  const section = useRef<HTMLElement>(null)

  // Up and down walk the fields like a table, through every synth in turn. A
  // suggestion list that is open has the arrows first and says so.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
    ) {
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const from = event.target instanceof Element ? cellOf(event.target) : null
    const fields = [...(section.current?.querySelectorAll('[data-row]') ?? [])]
    if (from === null) return
    const cells = fields.flatMap((node) => {
      const cell = cellOf(node)
      return cell === null ? [] : [{ cell, node }]
    })
    const to = stepRow(
      cells.map(({ cell }) => cell),
      from,
      event.key === 'ArrowDown' ? 1 : -1,
    )
    const next = cells.find(({ cell }) => cell.row === to?.row && cell.col === to.col)
    if (next === undefined || !(next.node instanceof HTMLInputElement)) return
    event.preventDefault()
    next.node.focus()
  }
  const known = synthNames(songs)
  const missing = known.filter(
    (name) =>
      !song.synths.some(
        (synth) => synth.name.trim().toLowerCase() === name.toLowerCase(),
      ),
  )
  // Every synth gets the columns of the fullest one, so the slots and buttons
  // of one line up under the other's.
  const slots = Math.max(
    1,
    ...song.synths.flatMap((synth) => [synth.dials.length, synth.knobs.length]),
  )
  return (
    <section ref={section} className="synths" aria-label="Synths" onKeyDown={onKeyDown}>
      {song.synths.map((synth, index) => (
        <SynthEditor
          key={index}
          synth={synth}
          index={index}
          songs={songs}
          names={known}
          slots={slots}
          dispatch={dispatch}
        />
      ))}
      <div className="synth-add">
        {missing.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            onClick={() => dispatch({ kind: 'addSynth', name })}
          >
            + {name}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => dispatch({ kind: 'addSynth', name: '' })}
        >
          + Synth
        </button>
      </div>
    </section>
  )
}
