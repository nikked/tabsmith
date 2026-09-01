import { useEffect, useReducer, useState } from 'react'
import {
  apply,
  initialState,
  retuneDropsNotes,
  songHasContent,
} from '../core/edit.ts'
import { TUNINGS } from '../core/model.ts'
import { load, save } from '../storage.ts'
import { Chart } from './Chart.tsx'
import { Output } from './Output.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { TabGrid } from './TabGrid.tsx'

export default function App() {
  const [state, dispatch] = useReducer(apply, undefined, () => initialState(load()))
  const [mode, setMode] = useState<'edit' | 'ascii'>('edit')

  useEffect(() => {
    save(state.song)
  }, [state.song])

  const selectTuning = (name: string) => {
    const tuning = TUNINGS.find((candidate) => candidate.name === name)
    if (tuning === undefined) return
    const dropped = state.song.tab.tuning.strings.length - tuning.strings.length
    if (
      retuneDropsNotes(state.song.tab, tuning) &&
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

  const clear = () => {
    if (
      songHasContent(state.song) &&
      !window.confirm('Clear the song and everything in it? This cannot be undone.')
    ) {
      return
    }
    dispatch({ kind: 'reset' })
  }

  return (
    <main>
      <header>
        <h1>tabsmith</h1>
        <select
          value={state.song.tab.tuning.name}
          onChange={(event) => selectTuning(event.target.value)}
        >
          {TUNINGS.map((tuning) => (
            <option key={tuning.name} value={tuning.name}>
              {tuning.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => dispatch({ kind: 'setTabFirst', tabFirst: !state.song.tabFirst })}
        >
          {state.song.tabFirst ? 'Tab first' : 'Tab last'}
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
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
          {state.song.tabFirst && <TabGrid state={state} dispatch={dispatch} />}
          <Chart song={state.song} dispatch={dispatch} />
          {!state.song.tabFirst && <TabGrid state={state} dispatch={dispatch} />}
          <Shortcuts />
        </>
      ) : (
        <Output song={state.song} />
      )}
    </main>
  )
}
