import { useId } from 'react'
import type { Action } from '../core/edit.ts'
import type { Song, Synth } from '../core/model.ts'
import { suggestionsFor, synthNames } from '../core/synths.ts'

type Props = {
  readonly song: Song
  /** Every song on the shelf, for what earlier songs set these synths to. */
  readonly songs: readonly Song[]
  readonly dispatch: (action: Action) => void
}

function Options({
  id,
  values,
}: {
  readonly id: string
  readonly values: readonly string[]
}) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  )
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
  slots,
  values,
  suggestions,
  onChange,
}: {
  readonly kind: 'Dial' | 'Knob'
  readonly row: number
  readonly slots: number
  readonly values: readonly string[]
  readonly suggestions: readonly string[]
  readonly onChange: (values: readonly string[]) => void
}) {
  const list = useId()
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
          <input
            aria-label={`${kind} ${index + 1}`}
            list={list}
            placeholder="—"
            value={value}
            onChange={(event) =>
              onChange(values.map((each, i) => (i === index ? event.target.value : each)))
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
      <Options id={list} values={suggestions} />
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
  readonly names: string
  readonly slots: number
  readonly dispatch: (action: Action) => void
}) {
  const sounds = useId()
  const set = (next: Synth) => dispatch({ kind: 'setSynth', index, synth: next })
  const used = suggestionsFor(songs, synth.name)
  return (
    <div
      className="synth"
      style={{
        gridTemplateColumns: `7rem repeat(${slots}, minmax(5rem, 9.5rem)) auto auto`,
      }}
    >
      <input
        className="synth-name"
        aria-label={`Synth ${index + 1} name`}
        list={names}
        placeholder="Synth"
        style={{ gridRow: 1, gridColumn: 1 }}
        value={synth.name}
        onChange={(event) => set({ ...synth, name: event.target.value })}
      />
      <input
        className="synth-sound"
        aria-label={`Synth ${index + 1} sound`}
        list={sounds}
        placeholder="Sound"
        style={{ gridRow: 1, gridColumn: `2 / span ${slots}` }}
        value={synth.sound}
        onChange={(event) => set({ ...synth, sound: event.target.value })}
      />
      <Options id={sounds} values={used.sounds} />
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
        slots={slots}
        values={synth.dials}
        suggestions={used.dials}
        onChange={(dials) => set({ ...synth, dials })}
      />
      <Controls
        kind="Knob"
        row={3}
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
export function Synths({ song, songs, dispatch }: Props) {
  const names = useId()
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
    <section className="synths" aria-label="Synths">
      {song.synths.map((synth, index) => (
        <SynthEditor
          key={index}
          synth={synth}
          index={index}
          songs={songs}
          names={names}
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
      <Options id={names} values={known} />
    </section>
  )
}
