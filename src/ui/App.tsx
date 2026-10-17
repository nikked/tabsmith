import { useEffect, useReducer, useRef, useState } from 'react'
import { addBandTodo } from '../core/bandTodos.ts'
import { initialTimeline, songHasContent, step } from '../core/edit.ts'
import {
  addSetlist,
  addToSetlist,
  deleteSetlist,
  moveSetlist,
  nextPosition,
  placeInSetlist,
  placeOf,
  removeFromSetlist,
  renameSetlist,
} from '../core/setlists.ts'
import {
  addEntry,
  openEntry,
  openSong,
  removeEntry,
  retitle,
  titleOf,
  withOpenSong,
  type Library,
} from '../core/library.ts'
import { emptySong, type Song } from '../core/model.ts'
import {
  acknowledge,
  forgetSent,
  merge,
  mergeBand,
  mergeSetlists,
  mergeTodos,
} from '../core/sync.ts'
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
  pendingCount,
  setlistsToWire,
  todosToWire,
  bandToWire,
  syncLibrary,
  toWire,
  type Settings,
} from '../sync.ts'
import { Chart } from './Chart.tsx'
import type { MenuItem } from './Menu.tsx'
import { Paste } from './Paste.tsx'
import { Prompt } from './Prompt.tsx'
import { Practice } from './Practice.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { SongTree } from './SongList.tsx'
import { SongsPage } from './SongsPage.tsx'
import { SettingsDialog } from './Settings.tsx'
import { Sync } from './Sync.tsx'
import { TabGrid } from './TabGrid.tsx'
import { Toggle } from './Toggle.tsx'
import { loadMode, saveMode, type Mode } from '../screen.ts'

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

/**
 * How long to wait before trying again after `failures` syncs in a row did not
 * get through: soon at first, for a connection that only blinked, then backing
 * off to once a minute so a long dead spell does not keep the radio busy.
 */
const retryAfter = (failures: number): number =>
  Math.min(60_000, 5_000 * 2 ** (failures - 1))

/** What a Prompt is open for, and which song or setlist it is about. */
type Asking =
  | { readonly kind: 'copy'; readonly song: string }
  | { readonly kind: 'rename'; readonly song: string }
  | { readonly kind: 'delete'; readonly song: string }
  | { readonly kind: 'newSetlist'; readonly adding: string | null }
  | { readonly kind: 'renameSetlist'; readonly id: string }
  | { readonly kind: 'deleteSetlist'; readonly id: string }

/** A cog, the usual mark for settings. */
const CogIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <circle cx="8" cy="8" r="4.4" />
    <circle cx="8" cy="8" r="1.8" />
    <path d="M8 1.4v2.2M8 12.4v2.2M1.4 8h2.2M12.4 8h2.2M3.33 3.33l1.56 1.56M11.11 11.11l1.56 1.56M3.33 12.67l1.56-1.56M11.11 4.89l1.56-1.56" />
  </svg>
)

/** Two arrows chasing each other round, the usual mark for syncing. */
const SyncIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13.5 6.5A5.5 5.5 0 0 0 3.6 4.3M2.5 9.5a5.5 5.5 0 0 0 9.9 2.2" />
    <path d="M3.4 1.8v2.7h2.7M12.6 14.2v-2.7H9.9" />
  </svg>
)

export default function App() {
  const [library, setLibrary] = useState<Library>(openingLibrary)
  const [timeline, dispatch] = useReducer(step, undefined, () =>
    initialTimeline(openEntry(library).song),
  )
  const state = timeline.present
  const [mode, setMode] = useState<Mode>(loadMode)
  const [error, setError] = useState<string | null>(null)
  const [shared, setShared] = useState<Song | null>(null)
  const [copied, setCopied] = useState(false)
  const [syncWith, setSyncWith] = useState<Settings | null>(loadSettings)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [failures, setFailures] = useState(0)
  const pending = pendingCount(library)
  // A retry, a reconnect and an edit can all ask at once; one sync at a time.
  // The ref is the guard, read the moment a sync is asked for; the state is
  // the same fact for drawing the turning arrows.
  const syncing = useRef(false)
  // One asked for while another runs, which runs next: the running one may have
  // left out an edit made after it set off.
  const again = useRef(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<Asking | null>(null)
  // The setlist the open song was opened from, so Practice can step through it.
  const [activeSetlist, setActiveSetlist] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  // Full screen is Practice's alone: leaving it brings the header back.
  const focused = full && mode === 'practice'
  const guide = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const paste = useRef<HTMLDialogElement>(null)
  const syncDialog = useRef<HTMLDialogElement>(null)
  const settingsDialog = useRef<HTMLDialogElement>(null)

  // The editor holds the open song while it is being written; this is how it
  // gets back to the shelf, which is the thing that is actually persisted.
  useEffect(() => {
    setLibrary((current) => withOpenSong(current, state.song, Date.now()))
  }, [state.song])

  useEffect(() => {
    saveLibrary(library)
  }, [library])

  useEffect(() => {
    saveMode(mode)
  }, [mode])

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
    if (syncing.current) {
      again.current = true
      return
    }
    syncing.current = true
    setBusy(true)
    try {
      do {
        again.current = false
        await syncOnce(to)
      } while (again.current)
    } finally {
      syncing.current = false
      setBusy(false)
    }
  }

  const syncOnce = async (to: Settings) => {
    setSyncNote('Syncing…')
    const sent = latest.current.library
    const { pulled, tooLong } = await syncLibrary(to, latest.current.library)
    if (!pulled.ok) {
      setSyncNote(pulled.error)
      setFailures((count) => count + 1)
      return
    }
    setFailures(0)
    const { library: here, song } = latest.current
    const at = Date.now()
    const agreed = acknowledge(
      forgetSent(withOpenSong(here, song, at), sent),
      sent,
      pulled,
    )
    const songs = merge(agreed, pulled.records, { at, newId })
    const merged = mergeBand(
      mergeTodos(mergeSetlists(songs.library, pulled.setlists), pulled.todos),
      pulled.band,
    )
    setLibrary(merged)
    const open = openEntry(merged).song
    if (open !== song) dispatch({ kind: 'load', song: open })
    const notes = [
      `Synced at ${new Date().toLocaleTimeString()}.`,
      ...(songs.conflicts.length === 0
        ? []
        : [
            `Changed elsewhere too, so your version was kept as a copy: ${songs.conflicts.join(', ')}.`,
          ]),
      ...(tooLong.length === 0
        ? []
        : [`Too long to sync, kept on this device: ${tooLong.join(', ')}.`]),
    ]
    setSyncNote(notes.join(' '))
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
    // Back on the network is the moment a waiting edit can go up.
    window.addEventListener('online', run)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
    }
  }, [library, syncWith])

  // A sync that did not get through is tried again by itself, not only on the
  // next edit, so nothing waits on someone happening to type.
  useEffect(() => {
    if (syncWith === null || failures === 0) return
    const timer = window.setTimeout(() => void sync(syncWith), retryAfter(failures))
    return () => window.clearTimeout(timer)
  }, [failures, syncWith])

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

  const reading = shared ?? state.song

  /**
   * Full screen hides the header and the sidebar so the song has the whole
   * window, and takes the browser's full screen too where it offers one — an
   * iPhone does not, and there hiding them is still most of the room. A
   * refusal is not worth a message: the page is still the song.
   */
  const goFull = (on: boolean) => {
    setFull(on)
    if (on) void document.documentElement.requestFullscreen?.().catch(() => undefined)
    else if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => undefined)
    }
  }

  // Escape, or the browser's own way out, ends the browser's full screen
  // without asking this page, so the header comes back with it.
  useEffect(() => {
    const sync = () => {
      if (document.fullscreenElement === null) setFull(false)
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
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
   * the shelf as it is then. A new song is one to work on, so it opens in Edit
   * whichever page it was made from.
   */
  const shelve = (song: Song) => {
    const entry = { id: newId(), song, updatedAt: Date.now(), lastSynced: null }
    setLibrary((current) =>
      addEntry(withOpenSong(current, state.song, Date.now()), entry),
    )
    dispatch({ kind: 'load', song })
    setMode('edit')
    setError(null)
  }

  const switchTo = (id: string) => {
    const next = library.songs.find((entry) => entry.id === id)
    if (next === undefined || id === library.open) return
    setLibrary(openSong(withOpenSong(library, state.song, Date.now()), id))
    dispatch({ kind: 'load', song: next.song })
  }

  /**
   * A song picked beside the editor or Practice opens in whichever of them is
   * up, so moving between songs does not throw you out of what you were doing.
   * The songs page has to be left either way, and picking a song there is
   * mostly to play it, so that opens in Practice. Opening from a setlist makes
   * it the one Practice steps through; from All songs, none.
   */
  const openFrom = (song: string, setlist: string | null) => {
    switchTo(song)
    setActiveSetlist(setlist)
    if (mode === 'songs') setMode('practice')
  }

  // Set by a todo count on Home and cleared once the todo has focus, so only
  // that one arrival in the editor moves the focus.
  const [focusTodo, setFocusTodo] = useState(false)
  const editFrom = (song: string) => {
    switchTo(song)
    setActiveSetlist(null)
    setMode('edit')
    setFocusTodo(true)
  }

  /** A song as it is now: the open one as the editor holds it, the rest as shelved. */
  const songOf = (id: string): Song | undefined =>
    id === library.open
      ? state.song
      : library.songs.find((entry) => entry.id === id)?.song

  const titleById = (id: string): string => {
    const entry = library.songs.find((each) => each.id === id)
    return entry === undefined ? '' : titleOf(entry)
  }

  const deleteSong = (id: string) => {
    const saved = withOpenSong(library, state.song, Date.now())
    const next = removeEntry(saved, id, Date.now())
    setLibrary(next)
    if (next.open !== saved.open) dispatch({ kind: 'load', song: openEntry(next).song })
  }

  /** The open song is the editor's, so its title goes through the editor too. */
  const renameSong = (id: string, title: string) => {
    if (id === library.open) dispatch({ kind: 'setTitle', title })
    else setLibrary((current) => retitle(current, id, title, Date.now()))
  }

  /** Setlist edits leave the songs alone, so they never need the editor's copy. */
  const changeSetlists = (edit: (library: Library, at: number) => Library) =>
    setLibrary((current) => edit(current, Date.now()))

  const asked =
    asking?.kind === 'renameSetlist' || asking?.kind === 'deleteSetlist'
      ? library.setlists.find((setlist) => setlist.id === asking.id)
      : undefined

  const toggleSetlist = (setlist: string, song: string) =>
    changeSetlists((current, at) =>
      current.setlists.some((each) => each.id === setlist && each.songs.includes(song))
        ? removeFromSetlist(current, setlist, song, at)
        : addToSetlist(current, setlist, song, at),
    )

  /** An empty song has nothing in it to lose, so it goes without the question. */
  const askToDelete = (id: string) => {
    const song = songOf(id)
    if (song === undefined) return
    if (songHasContent(song)) setAsking({ kind: 'delete', song: id })
    else deleteSong(id)
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

  const saveToDisk = (song: Song) =>
    saveFile(encode(song), filenameFor(song), 'tabsmith song')

  /**
   * The rows the sheet holds, deleted songs, setlists and todos included, so a backup
   * is a copy of the sheet that does not need the sheet.
   */
  const backUp = () => {
    const saved = withOpenSong(library, state.song, Date.now())
    const rows = {
      songs: toWire(saved),
      setlists: setlistsToWire(saved),
      todos: todosToWire(saved),
      band: bandToWire(saved),
    }
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
  const share = async (song: Song) => {
    try {
      await navigator.clipboard.writeText(await toLink(song))
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
        song={reading}
        // A linked song is the only one this view ever shows.
        songId="shared"
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
      {!focused && (
        <header>
          <h1>
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              width="20"
              height="20"
            />
            <span className="brand-name">tabsmith</span>
          </h1>
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
          <Toggle
            label="View"
            options={[
              { value: 'songs', label: 'Home' },
              { value: 'practice', label: 'Perform' },
              { value: 'edit', label: 'Edit' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {copied && (
            <span className="link-copied" role="status">
              Link copied
            </span>
          )}
          <button
            type="button"
            className={busy ? 'sync-now busy' : 'sync-now'}
            aria-label={
              syncWith === null
                ? 'Set up sync'
                : pending > 0
                  ? `Sync now, ${pending} not synced`
                  : 'Sync now'
            }
            title={
              syncWith === null
                ? 'Set up sync'
                : busy
                  ? 'Syncing…'
                  : pending > 0
                    ? `${pending} change${pending === 1 ? '' : 's'} on this device the sheet has not got yet${failures > 0 ? '; trying again' : ''}`
                    : 'Sync now'
            }
            onClick={() =>
              syncWith === null ? show(syncDialog.current) : void sync(syncWith)
            }
          >
            <SyncIcon />
            {/* On the button rather than beside it, so a phone's header keeps
                to one line however many there are. */}
            {syncWith !== null && pending > 0 && (
              <span className="sync-count" aria-hidden="true">
                {pending}
              </span>
            )}
          </button>
          {/* Settings are for the whole app, so they are with the songs on Home
              rather than over a song being written or read. */}
          {mode === 'songs' && (
            <button
              type="button"
              className="settings-open"
              aria-label="Settings"
              title="Settings"
              onClick={() => show(settingsDialog.current)}
            >
              <CogIcon />
            </button>
          )}
        </header>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      {mode === 'songs' ? (
        <SongsPage
          library={library}
          onOpen={openFrom}
          onEdit={editFrom}
          onRename={(song) => setAsking({ kind: 'rename', song })}
          onCopy={(song) => setAsking({ kind: 'copy', song })}
          onCopyLink={(id) => {
            const song = songOf(id)
            if (song !== undefined) void share(song)
          }}
          onExport={(id) => {
            const song = songOf(id)
            if (song !== undefined) void saveToDisk(song)
          }}
          adding={adding}
          onDelete={askToDelete}
          onToggleSetlist={toggleSetlist}
          onNewSetlist={() => setAsking({ kind: 'newSetlist', adding: null })}
          onRenameSetlist={(id) => setAsking({ kind: 'renameSetlist', id })}
          onDeleteSetlist={(id) => setAsking({ kind: 'deleteSetlist', id })}
          onMoveSetlist={(id, step) =>
            changeSetlists((current, at) => moveSetlist(current, id, step, at))
          }
          onRemoveFromSetlist={(setlist, song) =>
            changeSetlists((current, at) => removeFromSetlist(current, setlist, song, at))
          }
          onAddBandTodo={() =>
            changeSetlists((current, at) => addBandTodo(current, newId(), at))
          }
          onBandEdit={changeSetlists}
          onPlace={(setlist, song, to) =>
            changeSetlists((current, at) =>
              placeInSetlist(current, setlist, song, to, at),
            )
          }
        />
      ) : (
        <div className={focused ? 'workspace focused' : 'workspace'}>
          {!focused && (
            <aside className="shelf-side" aria-label="Songs">
              <SongTree library={library} onOpen={openFrom} />
            </aside>
          )}
          {mode === 'practice' ? (
            <Practice
              song={reading}
              songId={library.open}
              onLeave={() => (focused ? goFull(false) : setMode('edit'))}
              full={focused}
              onFull={goFull}
              place={
                activeSetlist === null
                  ? null
                  : placeOf(library, activeSetlist, library.open)
              }
              onStep={switchTo}
            />
          ) : (
            <div className="editing">
              <Chart
                song={state.song}
                songs={library.songs.map((entry) => entry.song)}
                dispatch={dispatch}
                focusTodo={focusTodo}
                onTodoFocused={() => setFocusTodo(false)}
              />
              <TabGrid
                state={state}
                dispatch={dispatch}
                onShowKeys={() => show(guide.current)}
                focusOnOpen={!focusTodo}
              />
              <Shortcuts guide={guide} onShowKeys={() => show(guide.current)} />
            </div>
          )}
        </div>
      )}
      <Paste paste={paste} onImport={shelve} />
      {asking?.kind === 'copy' && (
        <Prompt
          heading="Copy song"
          label="Name of the copy"
          initial={`${titleById(asking.song)} (copy)`}
          confirm="Copy"
          accepts={(name) => name.trim() !== ''}
          onConfirm={(name) => {
            const song = songOf(asking.song)
            if (song !== undefined) shelve({ ...song, title: name.trim() })
          }}
          onClose={() => setAsking(null)}
        >
          The copy joins your songs and opens; {titleById(asking.song)} stays as it is.
        </Prompt>
      )}
      {asking?.kind === 'rename' && (
        <Prompt
          heading="Rename song"
          label="Song name"
          initial={songOf(asking.song)?.title ?? ''}
          confirm="Rename"
          accepts={(name) => name.trim() !== songOf(asking.song)?.title}
          onConfirm={(name) => renameSong(asking.song, name.trim())}
          onClose={() => setAsking(null)}
        >
          Every setlist it is in shows the new name.
        </Prompt>
      )}
      {asking?.kind === 'delete' && (
        <Prompt
          heading={`Delete ${titleById(asking.song)}`}
          label="Song name"
          initial=""
          confirm="Delete this song"
          danger
          accepts={(name) => name === titleById(asking.song)}
          onConfirm={() => deleteSong(asking.song)}
          onClose={() => setAsking(null)}
        >
          It leaves your songs and every setlist. Type{' '}
          <strong>{titleById(asking.song)}</strong> to confirm.
        </Prompt>
      )}
      {asking?.kind === 'newSetlist' && (
        <Prompt
          heading="New setlist"
          label="Setlist name"
          initial=""
          confirm="Create"
          accepts={(name) => name.trim() !== ''}
          onConfirm={(name) =>
            changeSetlists((current, at) =>
              addSetlist(current, {
                id: newId(),
                name: name.trim(),
                songs: asking.adding === null ? [] : [asking.adding],
                active: true,
                position: nextPosition(current),
                updatedAt: at,
                syncedAt: null,
              }),
            )
          }
          onClose={() => setAsking(null)}
        >
          {asking.adding === null
            ? 'A list of songs in the order you play them.'
            : `A list of songs in the order you play them, starting with ${titleById(asking.adding)}.`}
        </Prompt>
      )}
      {asking?.kind === 'renameSetlist' && asked !== undefined && (
        <Prompt
          heading="Rename setlist"
          label="Setlist name"
          initial={asked.name}
          confirm="Rename"
          accepts={(name) => name.trim() !== '' && name.trim() !== asked.name}
          onConfirm={(name) =>
            changeSetlists((current, at) =>
              renameSetlist(current, asked.id, name.trim(), at),
            )
          }
          onClose={() => setAsking(null)}
        >
          The songs in it stay as they are.
        </Prompt>
      )}
      {asking?.kind === 'deleteSetlist' && asked !== undefined && (
        <Prompt
          heading={`Delete ${asked.name}`}
          label="Setlist name"
          initial=""
          confirm="Delete this setlist"
          danger
          accepts={(name) => name === asked.name}
          onConfirm={() =>
            changeSetlists((current, at) => deleteSetlist(current, asked.id, at))
          }
          onClose={() => setAsking(null)}
        >
          The songs in it stay in your songs. Type <strong>{asked.name}</strong> to
          confirm.
        </Prompt>
      )}
      <SettingsDialog
        dialog={settingsDialog}
        onBackUp={() => void backUp()}
        onSync={() => {
          settingsDialog.current?.close()
          show(syncDialog.current)
        }}
      />
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
