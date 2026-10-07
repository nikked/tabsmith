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
import { merge } from '../core/sync.ts'
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
import { forgetLink, linkedSong, toLink } from '../share.ts'
import {
  loadSettings,
  saveSettings,
  syncLibrary,
  toWire,
  type Settings,
} from '../sync.ts'
import { Chart } from './Chart.tsx'
import { Menu, MenuItems, type MenuItem } from './Menu.tsx'
import { Paste } from './Paste.tsx'
import { Prompt } from './Prompt.tsx'
import { Practice } from './Practice.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { SongList } from './SongList.tsx'
import { Sync } from './Sync.tsx'
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

/** Long enough that a burst of typing is one sync rather than one per key. */
const SYNC_DELAY = 3000

export default function App() {
  const [library, setLibrary] = useState<Library>(openingLibrary)
  const [timeline, dispatch] = useReducer(step, undefined, () =>
    initialTimeline(openEntry(library).song),
  )
  const state = timeline.present
  const [mode, setMode] = useState<'edit' | 'practice'>('edit')
  const [error, setError] = useState<string | null>(null)
  const [shared, setShared] = useState<Song | null>(null)
  const [copied, setCopied] = useState(false)
  const [syncWith, setSyncWith] = useState<Settings | null>(loadSettings)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [asking, setAsking] = useState<'copy' | 'delete' | null>(null)
  const guide = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const paste = useRef<HTMLDialogElement>(null)
  const syncDialog = useRef<HTMLDialogElement>(null)

  // The editor holds the open song while it is being written; this is how it
  // gets back to the shelf, which is the thing that is actually persisted.
  useEffect(() => {
    setLibrary((current) => withOpenSong(current, state.song, Date.now()))
  }, [state.song])

  useEffect(() => {
    saveLibrary(library)
  }, [library])

  // A sync answers after the render that sent it, so it reads the shelf and
  // the editor as they are when the answer lands rather than as they were.
  const latest = useRef({ library, song: state.song })
  useEffect(() => {
    latest.current = { library, song: state.song }
  })

  /**
   * Typing during a sync is not lost: the merge runs on what is here now, and
   * the editor is only reloaded when the open song is one the sync replaced or
   * deleted. A sync that brought nothing newer leaves the shelf as it was,
   * which is what keeps this from triggering itself forever.
   */
  const sync = async (to: Settings) => {
    setSyncNote('Syncing…')
    const { pulled, tooLong } = await syncLibrary(to, latest.current.library)
    if (!pulled.ok) {
      setSyncNote(pulled.error)
      return
    }
    const { library: here, song } = latest.current
    const merged = merge(withOpenSong(here, song, Date.now()), pulled.records)
    setLibrary(merged)
    const open = openEntry(merged).song
    if (open !== song) dispatch({ kind: 'load', song: open })
    const synced = `Synced at ${new Date().toLocaleTimeString()}.`
    setSyncNote(
      tooLong.length === 0
        ? synced
        : `${synced} Too long to sync, kept on this device: ${tooLong.join(', ')}.`,
    )
  }

  // Coming back to the tab is when another device is most likely to have
  // written something, so that syncs straight away rather than on the next edit.
  useEffect(() => {
    if (syncWith === null) return
    const run = () => void sync(syncWith)
    const timer = window.setTimeout(run, SYNC_DELAY)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [library, syncWith])

  const connect = (to: Settings | null) => {
    saveSettings(to)
    setSyncWith(to)
    setSyncNote(null)
  }

  /**
   * A song can arrive in the address bar. It is shown rather than shelved: a
   * link someone sent you is something to read, and whether to keep it is your
   * decision, not the sender's.
   */
  useEffect(() => {
    const read = () => {
      void linkedSong(location.hash).then((result) => {
        if (result === null) return
        forgetLink()
        if (result.ok) setShared(result.song)
        else setError(result.error)
      })
    }
    read()
    // Pasting a link into a tab that already has tabsmith open changes only the
    // fragment, which is not a navigation — without this, nothing would happen.
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

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

  /**
   * showModal throws on a dialog that is already open, so ask first. Its first
   * field is focused by hand: Safari focuses the dialog itself, which leaves a
   * hardware keyboard — an iPad's folio — typing into nothing.
   */
  const show = (dialog: HTMLDialogElement | null) => {
    if (dialog === null || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('input, textarea')?.focus()
  }

  /**
   * Every way a song reaches the shelf goes through here, so whatever is being
   * edited is written back before the shelf changes under it. An import arrives
   * after reading a file, and a sync may have landed meanwhile, so it adds to
   * the shelf as it is then.
   */
  const shelve = (song: Song) => {
    const entry = { id: newId(), song, updatedAt: Date.now() }
    setLibrary((current) =>
      addEntry(withOpenSong(current, state.song, Date.now()), entry),
    )
    dispatch({ kind: 'load', song })
    setError(null)
  }

  const switchTo = (id: string) => {
    const next = library.songs.find((entry) => entry.id === id)
    if (next === undefined || id === library.open) return
    setLibrary(openSong(withOpenSong(library, state.song, Date.now()), id))
    dispatch({ kind: 'load', song: next.song })
  }

  const openTitle = titleOf(openEntry(library))

  const deleteOpen = () => {
    const saved = withOpenSong(library, state.song, Date.now())
    const next = removeEntry(saved, saved.open, Date.now())
    setLibrary(next)
    dispatch({ kind: 'load', song: openEntry(next).song })
  }

  /** An empty song has nothing in it to lose, so it goes without the question. */
  const askToDelete = () => {
    if (songHasContent(state.song)) setAsking('delete')
    else deleteOpen()
  }

  const saveFile = async (text: string, name: string, description: string) => {
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
        types: [{ description, accept: { 'application/json': ['.json'] } }],
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

  const saveToDisk = () =>
    saveFile(encode(state.song), filenameFor(state.song), 'tabsmith song')

  /**
   * The rows the sheet holds, deleted songs included, so a backup is a copy of
   * the sheet that does not need the sheet.
   */
  const backUp = () => {
    const rows = toWire(withOpenSong(library, state.song, Date.now()))
    const day = new Date().toISOString().slice(0, 10)
    return saveFile(
      JSON.stringify(rows, null, 2),
      `tabsmith-backup-${day}.json`,
      'tabsmith backup',
    )
  }

  /**
   * Copied rather than opened: the whole song is in the link, so there is
   * nothing to visit and nothing to wait for.
   */
  const share = async () => {
    try {
      await navigator.clipboard.writeText(await toLink(state.song))
      setError(null)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy the link.')
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

  const adding: readonly MenuItem[] = [
    { label: 'Blank song', onSelect: () => shelve(emptySong()) },
    { label: 'Paste from text…', onSelect: () => show(paste.current) },
    { label: 'Import file…', onSelect: () => picker.current?.click() },
  ]

  if (shared !== null) {
    return (
      <Practice
        song={shared}
        onLeave={() => setShared(null)}
        onKeep={() => {
          shelve(shared)
          setShared(null)
        }}
      />
    )
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
        <Menu label="+ New" title="New song">
          <MenuItems items={adding} />
        </Menu>
        <Menu label="Songs ▾" title="Songs">
          <SongList library={library} onOpen={switchTo} />
        </Menu>
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
        <div className="view-toggle" data-mode={mode} role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={mode === 'edit'}
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            aria-pressed={mode === 'practice'}
            onClick={() => setMode('practice')}
          >
            Practice
          </button>
        </div>
        <div className="settings">
          <Menu label={copied ? 'Link copied' : '⋯'} title="Settings">
            <MenuItems
              items={[
                { label: 'Copy song as link', onSelect: () => void share() },
                { label: 'Export file…', onSelect: () => void saveToDisk() },
                { label: 'Back up all songs…', onSelect: () => void backUp() },
                {
                  label: 'Database sync…',
                  onSelect: () => show(syncDialog.current),
                },
              ]}
            />
          </Menu>
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
      <div className="workspace">
        <aside className="shelf-side" aria-label="Songs">
          <SongList library={library} onOpen={switchTo} />
        </aside>
        {mode === 'practice' ? (
          <Practice song={state.song} onLeave={() => setMode('edit')} />
        ) : (
          <div className="editing">
            <Chart song={state.song} dispatch={dispatch} />
            <TabGrid
              state={state}
              dispatch={dispatch}
              onShowKeys={() => show(guide.current)}
            />
            <Shortcuts guide={guide} onShowKeys={() => show(guide.current)} />
            <div className="song-actions">
              <button type="button" onClick={() => setAsking('copy')}>
                Copy song…
              </button>
              <button
                type="button"
                className="danger"
                disabled={library.songs.length <= 1}
                title={
                  library.songs.length <= 1
                    ? 'Your only song cannot be deleted'
                    : undefined
                }
                onClick={askToDelete}
              >
                Delete song…
              </button>
            </div>
          </div>
        )}
      </div>
      <Paste paste={paste} onImport={shelve} />
      {asking === 'copy' && (
        <Prompt
          heading="Copy song"
          label="Name of the copy"
          initial={`${openTitle} (copy)`}
          confirm="Copy"
          accepts={(name) => name.trim() !== ''}
          onConfirm={(name) => shelve({ ...state.song, title: name.trim() })}
          onClose={() => setAsking(null)}
        >
          The copy joins your songs and opens; {openTitle} stays as it is.
        </Prompt>
      )}
      {asking === 'delete' && (
        <Prompt
          heading={`Delete ${openTitle}`}
          label="Song name"
          initial=""
          confirm="Delete this song"
          danger
          accepts={(name) => name === openTitle}
          onConfirm={deleteOpen}
          onClose={() => setAsking(null)}
        >
          This cannot be undone. Type <strong>{openTitle}</strong> to confirm.
        </Prompt>
      )}
      <Sync
        dialog={syncDialog}
        syncWith={syncWith}
        syncNote={syncNote}
        onConnect={connect}
        onSync={() => {
          if (syncWith !== null) void sync(syncWith)
        }}
      />
    </main>
  )
}
