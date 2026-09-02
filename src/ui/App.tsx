import { useEffect, useReducer, useRef, useState } from 'react'
import { apply, initialState, songHasContent } from '../core/edit.ts'
import type { Song } from '../core/model.ts'
import { DEMO } from '../demo.ts'
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

/**
 * An empty editor on a first visit says nothing about what any of this is for,
 * so the demo stands in until there is something saved to load instead. Null
 * only when there is no demo to fall back on either.
 */
const openingSong = (): Song | null => load() ?? (DEMO.ok ? DEMO.song : null)

export default function App() {
  const [state, dispatch] = useReducer(apply, undefined, () =>
    initialState(openingSong()),
  )
  const [mode, setMode] = useState<'edit' | 'ascii'>('edit')
  const [error, setError] = useState<string | null>(null)
  const guide = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    save(state.song)
  }, [state.song])

  /** showModal throws on a dialog that is already open, so ask first. */
  const showKeys = () => {
    const element = guide.current
    if (element !== null && !element.open) element.showModal()
  }

  /** Replaces the open song, so it asks the same way Open and Clear do. */
  const loadDemo = () => {
    if (!DEMO.ok) {
      setError(DEMO.error)
      return
    }
    if (
      songHasContent(state.song) &&
      !window.confirm(
        'Replace the song you have open with the demo? This cannot be undone.',
      )
    ) {
      return
    }
    setError(null)
    dispatch({ kind: 'load', song: DEMO.song })
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
        <h1>
          <img src="/favicon.svg" alt="" width="20" height="20" />
          tabsmith
        </h1>
        <div className="files" role="group" aria-label="File">
          <button type="button" onClick={() => picker.current?.click()}>
            Open…
          </button>
          <button type="button" onClick={() => void saveToDisk()}>
            {pickPath === undefined ? 'Download' : 'Save as…'}
          </button>
        </div>
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
        <div className="document" role="group" aria-label="Document">
          <button type="button" className="quiet" onClick={loadDemo}>
            Demo
          </button>
          <button type="button" className="quiet" onClick={clear}>
            Clear
          </button>
        </div>
        <div className="segmented modes" role="group" aria-label="View">
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
          <Chart song={state.song} dispatch={dispatch} />
          <TabGrid state={state} dispatch={dispatch} onShowKeys={showKeys} />
          <Shortcuts guide={guide} onShowKeys={showKeys} />
        </>
      ) : (
        <Output song={state.song} />
      )}
    </main>
  )
}
