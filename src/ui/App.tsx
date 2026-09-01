import { useEffect, useReducer, useRef, useState } from 'react'
import {
  apply,
  initialState,
  retuneDropsNotes,
  songHasContent,
} from '../core/edit.ts'
import { TUNINGS } from '../core/model.ts'
import { decode, encode, filenameFor, load, save } from '../storage.ts'
import { Chart } from './Chart.tsx'
import { Output } from './Output.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { TabGrid } from './TabGrid.tsx'

/**
 * Asking where to put a file is Chromium-only, and no other browser has an
 * equivalent — Firefox and Safari can only drop it in the download folder. So
 * the capability is read once and the button is labelled for what it will
 * actually do, rather than promising a dialog that will never open.
 */
const pickPath = window.showSaveFilePicker?.bind(window)

export default function App() {
  const [state, dispatch] = useReducer(apply, undefined, () => initialState(load()))
  const [mode, setMode] = useState<'edit' | 'ascii'>('edit')
  const [error, setError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

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

  const saveToDisk = async () => {
    const text = encode(state.song)
    const name = filenameFor(state.song)

    if (pickPath === undefined) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
      return
    }

    try {
      const handle = await pickPath({
        suggestedName: name,
        types: [
          { description: 'tabsmith song', accept: { 'application/json': ['.json'] } },
        ],
      })
      const file = await handle.createWritable()
      await file.write(text)
      await file.close()
      setError(null)
    } catch (error) {
      // Dismissing the dialog is a decision, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
      setError('Could not save that file.')
    }
  }

  const loadFromDisk = async (file: File) => {
    const result = decode(await file.text())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    if (
      songHasContent(state.song) &&
      !window.confirm('Replace the song you have open? This cannot be undone.')
    ) {
      return
    }
    dispatch({ kind: 'load', song: result.song })
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
        <button type="button" onClick={() => void saveToDisk()}>
          {pickPath === undefined ? 'Download' : 'Save as…'}
        </button>
        <button type="button" onClick={() => picker.current?.click()}>
          Load
        </button>
        <input
          ref={picker}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) void loadFromDisk(file)
          }}
        />
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
      {error !== null && (
        <p className="error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
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
