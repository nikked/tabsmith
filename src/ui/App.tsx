import { useEffect, useReducer, useRef, useState } from 'react'
import { initialTimeline, songHasContent, step } from '../core/edit.ts'
import {
  activeSetlists,
  addSetlist,
  addToSetlist,
  deleteSetlist,
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
import { merge, mergeSetlists } from '../core/sync.ts'
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
  setlistsToWire,
  syncLibrary,
  toWire,
  type Settings,
} from '../sync.ts'
import { Chart } from './Chart.tsx'
import { Menu, MenuChecks, MenuItems, type MenuItem } from './Menu.tsx'
import { Paste } from './Paste.tsx'
import { Prompt } from './Prompt.tsx'
import { Practice } from './Practice.tsx'
import { Shortcuts } from './Shortcuts.tsx'
import { SongTree } from './SongList.tsx'
import { SongsPage } from './SongsPage.tsx'
import { Sync } from './Sync.tsx'
import { TabGrid } from './TabGrid.tsx'
import { Toggle } from './Toggle.tsx'

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

/** What a Prompt is open for, and which song or setlist it is about. */
type Asking =
  | { readonly kind: 'copy'; readonly song: string }
  | { readonly kind: 'rename'; readonly song: string }
  | { readonly kind: 'delete'; readonly song: string }
  | { readonly kind: 'newSetlist'; readonly adding: string | null }
  | { readonly kind: 'renameSetlist'; readonly id: string }
  | { readonly kind: 'deleteSetlist'; readonly id: string }

export default function App() {
  const [library, setLibrary] = useState<Library>(openingLibrary)
  const [timeline, dispatch] = useReducer(step, undefined, () =>
    initialTimeline(openEntry(library).song),
  )
  const state = timeline.present
  const [mode, setMode] = useState<'songs' | 'edit' | 'practice'>('edit')
  const [error, setError] = useState<string | null>(null)
  const [shared, setShared] = useState<Song | null>(null)
  const [copied, setCopied] = useState(false)
  const [syncWith, setSyncWith] = useState<Settings | null>(loadSettings)
  const [syncNote, setSyncNote] = useState<string | null>(null)
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
    const merged = mergeSetlists(
      merge(withOpenSong(here, song, Date.now()), pulled.records),
      pulled.setlists,
    )
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

  /**
   * Picking a song is mostly to play it, so it opens in Practice. Opening from a
   * setlist makes it the one Practice steps through; from All songs, none.
   */
  const openFrom = (song: string, setlist: string | null) => {
    switchTo(song)
    setActiveSetlist(setlist)
    setMode('practice')
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
   * The rows the sheet holds, deleted songs and setlists included, so a backup
   * is a copy of the sheet that does not need the sheet.
   */
  const backUp = () => {
    const saved = withOpenSong(library, state.song, Date.now())
    const rows = { songs: toWire(saved), setlists: setlistsToWire(saved) }
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
          <Menu label="+ New" title="New song">
            <MenuItems items={adding} />
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
          <Toggle
            label="View"
            options={[
              { value: 'songs', label: 'Songs' },
              { value: 'practice', label: 'Practice' },
              { value: 'edit', label: 'Edit' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <div className="settings">
            <Menu label={copied ? 'Link copied' : '⋯'} title="Settings">
              <MenuItems
                items={[
                  { label: 'Copy song as link', onSelect: () => void share(state.song) },
                  { label: 'Export file…', onSelect: () => void saveToDisk(state.song) },
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
          onDelete={askToDelete}
          onToggleSetlist={toggleSetlist}
          onNewSetlist={() => setAsking({ kind: 'newSetlist', adding: null })}
          onRenameSetlist={(id) => setAsking({ kind: 'renameSetlist', id })}
          onDeleteSetlist={(id) => setAsking({ kind: 'deleteSetlist', id })}
          onRemoveFromSetlist={(setlist, song) =>
            changeSetlists((current, at) => removeFromSetlist(current, setlist, song, at))
          }
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
              <Chart song={state.song} dispatch={dispatch} />
              <TabGrid
                state={state}
                dispatch={dispatch}
                onShowKeys={() => show(guide.current)}
              />
              <Shortcuts guide={guide} onShowKeys={() => show(guide.current)} />
              <div className="song-actions">
                <Menu label="Setlists ▾" title="Setlists this song is in">
                  <MenuChecks
                    items={activeSetlists(library).map((setlist) => ({
                      id: setlist.id,
                      label: setlist.name,
                      checked: setlist.songs.includes(library.open),
                      onToggle: () => toggleSetlist(setlist.id, library.open),
                    }))}
                  />
                  <MenuItems
                    items={[
                      {
                        label: 'New setlist…',
                        onSelect: () =>
                          setAsking({ kind: 'newSetlist', adding: library.open }),
                        quiet: true,
                      },
                    ]}
                  />
                </Menu>
                <button
                  type="button"
                  onClick={() => setAsking({ kind: 'copy', song: library.open })}
                >
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
                  onClick={() => askToDelete(library.open)}
                >
                  Delete song…
                </button>
              </div>
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
                updatedAt: at,
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
