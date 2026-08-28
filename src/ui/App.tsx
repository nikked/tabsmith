import { useReducer, useState } from 'react'
import { apply, initialState, retuneDropsNotes } from '../core/edit.ts'
import { TUNINGS } from '../core/model.ts'
import { Output } from './Output.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { TabGrid } from './TabGrid.tsx'

export default function App() {
  const [state, dispatch] = useReducer(apply, undefined, initialState)
  const [mode, setMode] = useState<'edit' | 'ascii'>('edit')

  const selectTuning = (name: string) => {
    const tuning = TUNINGS.find((candidate) => candidate.name === name)
    if (tuning === undefined) return
    const dropped = state.score.tuning.strings.length - tuning.strings.length
    if (
      retuneDropsNotes(state.score, tuning) &&
      !window.confirm(
        `Switching to ${tuning.name} drops the top ${dropped} string${
          dropped === 1 ? '' : 's'
        }, and the notes on them. This cannot be undone. Continue?`,
      )
    ) {
      return
    }
    dispatch({ kind: 'retune', tuning })
  }

  return (
    <main>
      <header>
        <h1>tabsmith</h1>
        <select
          value={state.score.tuning.name}
          onChange={(event) => selectTuning(event.target.value)}
        >
          {TUNINGS.map((tuning) => (
            <option key={tuning.name} value={tuning.name}>
              {tuning.name}
            </option>
          ))}
        </select>
        <div className="modes" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={mode === 'edit'}
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            aria-pressed={mode === 'ascii'}
            onClick={() => setMode('ascii')}
          >
            ASCII
          </button>
        </div>
      </header>
      {mode === 'edit' ? (
        <>
          <TabGrid state={state} dispatch={dispatch} />
          <Shortcuts />
        </>
      ) : (
        <Output score={state.score} />
      )}
    </main>
  )
}
