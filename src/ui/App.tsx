import { useEffect, useReducer, useRef, useState } from 'react'
import { initialTimeline, songHasContent, step } from '../core/edit.ts'
import {
  addEntry,
  openEntry,
  openSong,
  removeEntry,
  titleOf,
  withOpenSong,
  type Library,
} from '../core/library.ts'
import { emptySong, type Song } from '../core/model.ts'
import { DEMO } from '../demo.ts'
import {
  decode,
  encode,
  filenameFor,
  loadLibrary,
  newId,
  saveLibrary,
  startingLibrary,
} from '../storage.ts'
import { Chart } from './Chart.tsx'
import { Output } from './Output.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { Songbook } from './Songbook.tsx'
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
 * so the demo is the song the shelf starts with.
 */
const openingLibrary = (): Library =>
  loadLibrary() ?? startingLibrary(DEMO.ok ? DEMO.song : emptySong())

export default function App() {
  const [library, setLibrary] = useState<Library>(openingLibrary)
  const [timeline, dispatch] = useReducer(step, undefined, () =>
    initialTimeline(openEntry(library).song),
  )
  const state = timeline.present
  const [mode, setMode] = useState<'edit' | 'ascii'>('edit')
  const [error, setError] = useState<string | null>(null)
  const guide = useRef<HTMLDialogElement>(null)
  const shelf = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  // The editor holds the open song while it is being written; this is how it
  // gets back to the shelf, which is the thing that is actually persisted.
  useEffect(() => {
    setLibrary((current) => withOpenSong(current, state.song))
  }, [state.song])

  useEffect(() => {
    saveLibrary(library)
  }, [library])

  /**
   * Bound on the window rather than the staff, because an edit can be made from
   * a button as easily as from a key. A text field is left alone: the browser
   * keeps its own undo stack for what is typed there, and it is the finer of
   * the two.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const { target } = event
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }
      event.preventDefault()
      dispatch({ kind: event.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** showModal throws on a dialog that is already open, so ask first. */
  const show = (dialog: HTMLDialogElement | null) => {
    if (dialog !== null && !dialog.open) dialog.showModal()
  }

  /**
   * Every way a song reaches the shelf goes through here, so whatever is being
   * edited is written back before the shelf changes under it.
   */
  const shelve = (song: Song) => {
    const entry = { id: newId(), song }
    setLibrary(addEntry(withOpenSong(library, state.song), entry))
    dispatch({ kind: 'load', song })
    setError(null)
  }

  const switchTo = (id: string) => {
    const next = library.songs.find((entry) => entry.id === id)
    if (next === undefined || id === library.open) return
    setLibrary(openSong(withOpenSong(library, state.song), id))
    dispatch({ kind: 'load', song: next.song })
  }

  const deleteSong = (id: string) => {
    const saved = withOpenSong(library, state.song)
    const entry = saved.songs.find((candidate) => candidate.id === id)
    if (entry === undefined) return
    if (
      songHasContent(entry.song) &&
      !window.confirm(`Delete ${titleOf(entry)}? This cannot be undone.`)
    ) {
      return
    }
    const next = removeEntry(saved, id)
    setLibrary(next)
    if (next.open !== saved.open) dispatch({ kind: 'load', song: openEntry(next).song })
  }

  const loadDemo = () => {
    if (!DEMO.ok) {
      setError(DEMO.error)
      return
    }
    shelve(DEMO.song)
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

  /** An imported song joins the shelf rather than replacing what is open. */
  const loadFromDisk = async (file: File) => {
    const result = decode(await file.text())
    if (!result.ok) {
      setError(result.error)
      return
    }
    shelve(result.song)
  }

  return (
    <main>
      <header>
        <h1>
          <img
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            width="20"
            height="20"
          />
          tabsmith
        </h1>
        <button type="button" className="shelf-open" onClick={() => show(shelf.current)}>
          Songs
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
          <TabGrid
            state={state}
            dispatch={dispatch}
            onShowKeys={() => show(guide.current)}
          />
          <Shortcuts guide={guide} onShowKeys={() => show(guide.current)} />
        </>
      ) : (
        <Output song={state.song} />
      )}
      <Songbook
        shelf={shelf}
        library={library}
        onOpen={switchTo}
        onDelete={deleteSong}
        onNew={() => shelve(emptySong())}
        onImport={() => picker.current?.click()}
        onDemo={loadDemo}
        onExport={() => void saveToDisk()}
        onClear={clear}
      />
    </main>
  )
}
