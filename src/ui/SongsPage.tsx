import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { z } from 'zod'
import {
  clockOf,
  DEFAULT_DIRECTION,
  hasStructure,
  hasTab,
  hasTodo,
  sortSongs,
  titleOf,
  type Direction,
  type Entry,
  type Library,
  type SongOrder,
} from '../core/library.ts'
import {
  activeBandTodos,
  clearDoneBandTodos,
  removeBandTodo,
  setBandField,
  setBandTodoText,
  toggleBandTodo,
} from '../core/bandTodos.ts'
import { listEnter } from '../core/markdown.ts'
import { isOpen } from '../core/model.ts'
import { songFacts } from '../core/render.ts'
import { activeSetlists, setlistsWith, songsOf } from '../core/setlists.ts'
import { Checklist } from './Checklist.tsx'
import { MarkdownLines } from './MarkdownLines.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import { Menu, MenuChecks, MenuItems, type MenuItem } from './Menu.tsx'
import { Toggle } from './Toggle.tsx'

/**
 * Types `text` over the selection through execCommand, so the browser keeps
 * its own undo history and React sees the input, the way Chart's Tab does.
 */
const insertText = (field: HTMLTextAreaElement, text: string): void => {
  if (document.execCommand?.('insertText', false, text)) return
  const { selectionStart: from, selectionEnd: to, value } = field
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setValue?.call(field, `${value.slice(0, from)}${text}${value.slice(to)}`)
  field.setSelectionRange(from + text.length, from + text.length)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Enter in a list item starts the next one at its depth, and in an empty one
 * takes the bullet away, so a list is typed the way it is in an editor.
 */
const onNotesKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  const field = event.currentTarget
  const { selectionStart: at, selectionEnd, value } = field
  if (at !== selectionEnd) return
  const start = value.lastIndexOf('\n', at - 1) + 1
  const end = value.indexOf('\n', at)
  const enter = listEnter(
    value.slice(start, at),
    value.slice(at, end === -1 ? undefined : end),
  )
  if (enter === null) return
  event.preventDefault()
  if (enter.kind === 'continue') {
    insertText(field, `\n${enter.marker}`)
    return
  }
  field.setSelectionRange(start, at)
  insertText(field, '')
  // Chrome leaves the caret before the line break when the line it emptied is
  // the last, so what is typed next would join the item above.
  field.setSelectionRange(start, start)
}

/** An arrow up and one down side by side, the one in force drawn full and the other faint. */
const DirectionIcon = ({ direction }: { readonly direction: Direction }) => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 14V2M2 5l3-3 3 3" opacity={direction === 'asc' ? 1 : 0.35} />
    <path d="M11 2v12M8 11l3 3 3-3" opacity={direction === 'desc' ? 1 : 0.35} />
  </svg>
)

/** A plus drawn rather than typed, so it sits level with the word beside it. */
const PlusIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="12"
    height="12"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M8 2.5v11M2.5 8h11" />
  </svg>
)

/** A funnel, the usual mark for narrowing a list. */
const FunnelIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  >
    <path d="M2 3h12l-4.6 5.4v4.8l-2.8 1.4V8.4z" />
  </svg>
)

type Props = {
  readonly library: Library
  /** The setlist it was opened from, or null from All songs. */
  readonly onOpen: (song: string, setlist: string | null) => void
  /** Sync and settings, shown in the Setlists heading where Home has no header row. */
  readonly controls: ReactNode
  /** Straight to Edit, where a song's todos are ticked off. */
  readonly onEdit: (song: string) => void
  readonly onRename: (song: string) => void
  readonly onCopy: (song: string) => void
  readonly onCopyLink: (song: string) => void
  readonly onExport: (song: string) => void
  /** The ways to start a song: blank, pasted or from a file. */
  readonly adding: readonly MenuItem[]
  readonly onDelete: (song: string) => void
  readonly onToggleSetlist: (setlist: string, song: string) => void
  readonly onNewSetlist: () => void
  readonly onRenameSetlist: (setlist: string) => void
  readonly onDeleteSetlist: (setlist: string) => void
  readonly onMoveSetlist: (setlist: string, step: -1 | 1) => void
  readonly onRemoveFromSetlist: (setlist: string, song: string) => void
  readonly onPlace: (setlist: string, song: string, to: number) => void
  readonly onAddBandTodo: () => void
  /** Any other change to the band's todos or ideas, stamped with when it was made. */
  readonly onBandEdit: (edit: (library: Library, at: number) => Library) => void
}

/**
 * A song being dragged: where it came from (a setlist, or All songs when
 * null), where it would land, and where the pointer is, for the label that
 * follows it.
 */
type Drag = {
  readonly song: string
  readonly from: string | null
  readonly over: string | null
  readonly to: number
  readonly x: number
  readonly y: number
}

/**
 * The setlist under a point and the index a song dropped there lands at: past
 * every other song in it whose middle is above the point, the index
 * placeInSetlist takes. Read from the page rather than from refs, because a
 * song can be dragged from one list into another.
 */
const dropAt = (x: number, y: number, song: string) => {
  const card = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-setlist]')
  if (card == null) return { over: null, to: 0 }
  const rows = [...card.querySelectorAll<HTMLElement>('li[data-song]')].filter(
    (row) => row.dataset.song !== song,
  )
  const to = rows.filter((row) => {
    const box = row.getBoundingClientRect()
    return box.top + box.height / 2 < y
  }).length
  return { over: card.dataset.setlist ?? null, to }
}

/**
 * Which filters were left on, kept per browser like the sidebar's folds: how
 * this person likes to look at the list, not something about the songs.
 */
const FILTERS = 'tabsmith.songFilters'

const filters = z.object({
  tab: z.boolean(),
  structure: z.boolean(),
  // Added later, so filters saved before it read as off.
  todo: z.boolean().default(false),
})

type Filters = z.infer<typeof filters>

const rememberedFilters = (): Filters => {
  try {
    const result = filters.safeParse(JSON.parse(localStorage.getItem(FILTERS) ?? 'null'))
    return result.success ? result.data : { tab: false, structure: false, todo: false }
  } catch {
    return { tab: false, structure: false, todo: false }
  }
}

// With the time too: two songs edited the same day still need telling apart.
const edited = (entry: Entry): string =>
  entry.updatedAt === 0
    ? '—'
    : `${new Date(entry.updatedAt).toLocaleDateString()} ${clockOf(entry.updatedAt)}`

/**
 * Every song and every setlist, laid out to be arranged rather than switched
 * between: setlists on one side, all songs on the other, and a song dragged
 * from anywhere into a setlist lands where it is dropped.
 */
export function SongsPage(props: Props) {
  const { library, onOpen, onPlace } = props
  const bandTodos = activeBandTodos(library)
  // The checklist counts rows; the library knows items by id.
  const onBandTodo = (
    index: number,
    edit: (library: Library, id: string, at: number) => Library,
  ) => {
    const todo = bandTodos[index]
    if (todo !== undefined) props.onBandEdit((current, at) => edit(current, todo.id, at))
  }
  const [writingNotes, setWritingNotes] = useState(false)
  const [order, setOrder] = useState<SongOrder>('name')
  const [direction, setDirection] = useState<Direction>(DEFAULT_DIRECTION.name)
  const orderBy = (next: SongOrder) => {
    setOrder(next)
    setDirection(DEFAULT_DIRECTION[next])
  }
  const [drag, setDrag] = useState<Drag | null>(null)

  const sorted = sortSongs(library.songs, order, direction)
  const [only, setOnly] = useState(rememberedFilters)
  const shown = sorted.filter(
    (entry) =>
      (!only.tab || hasTab(entry)) &&
      (!only.structure || hasStructure(entry)) &&
      (!only.todo || hasTodo(entry)),
  )

  // Built on the latest filters, like the sidebar's folds, so two in a row both land.
  const filtering = only.tab || only.structure || only.todo
  const flip = (filter: keyof Filters) =>
    setOnly((current) => {
      const next = { ...current, [filter]: !current[filter] }
      localStorage.setItem(FILTERS, JSON.stringify(next))
      return next
    })

  // Pointer events rather than HTML drag and drop, which a phone does not do.
  // Capture, not the drag state, says whether this grip is being dragged: a
  // quick flick can let go before the render that would have recorded it.
  const grip = (song: string, from: string | null, title: string) => ({
    className: 'grip',
    'aria-label': `Drag ${title}`,
    title: from === null ? 'Drag into a setlist' : 'Drag to move',
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const { clientX: x, clientY: y } = event
      setDrag({ song, from, ...dropAt(x, y, song), x, y })
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      const { clientX: x, clientY: y } = event
      setDrag({ song, from, ...dropAt(x, y, song), x, y })
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        const { over, to } = dropAt(event.clientX, event.clientY, song)
        if (over !== null) onPlace(over, song, to)
      }
      setDrag(null)
    },
    onPointerCancel: () => setDrag(null),
  })

  /**
   * The line a drop would land on, drawn on the row it would land next to. The
   * dragged song is counted out of the list the same way dropAt counts it.
   */
  const mark = (setlist: string, others: readonly Entry[], entry: Entry): string => {
    if (drag === null) return ''
    if (entry.id === drag.song) return drag.from === setlist ? ' lifted' : ''
    if (drag.over !== setlist) return ''
    const index = others.indexOf(entry)
    if (index === drag.to) return ' drop-above'
    return drag.to === others.length && index === others.length - 1 ? ' drop-below' : ''
  }

  const dragged = library.songs.find((entry) => entry.id === drag?.song)

  return (
    <div className={`songs-page${drag === null ? '' : ' dragging'}`}>
      {/* The notes first: on a narrow screen they are what is read before the list. */}
      <div className="band-boxes">
        <section className="band-box band-notes" aria-label="Band notes">
          {writingNotes || library.band.ideas.text.trim() === '' ? (
            // A textarea cannot style part of its text, so the notes are drawn again
            // underneath with their Markdown styled, and sized by that copy so the
            // two always wrap alike; the field on top shows only its caret.
            <label className="ideas markdown-field">
              <span className="markdown-mirror" aria-hidden="true">
                <MarkdownLines text={library.band.ideas.text} />
              </span>
              <textarea
                aria-label="Ideas"
                placeholder="Jot something down…"
                value={library.band.ideas.text}
                autoFocus={writingNotes}
                onFocus={(event) => {
                  setWritingNotes(true)
                  const end = event.currentTarget.value.length
                  event.currentTarget.setSelectionRange(end, end)
                }}
                onBlur={() => setWritingNotes(false)}
                onKeyDown={onNotesKeyDown}
                onChange={(event) => {
                  const text = event.target.value
                  props.onBandEdit((current, at) =>
                    setBandField(current, 'ideas', text, at),
                  )
                }}
              />
            </label>
          ) : (
            // Read the way a README is; clicked or tabbed into, it is written in
            // again. A link takes its own click rather than opening the notes.
            <div
              className="markdown-view"
              tabIndex={0}
              aria-label="Ideas, select to edit"
              onClick={(event) => {
                if (!(event.target instanceof HTMLAnchorElement)) setWritingNotes(true)
              }}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setWritingNotes(true)
              }}
            >
              <MarkdownView text={library.band.ideas.text} />
            </div>
          )}
        </section>
        <section className="band-box band-todo" aria-label="Band todos">
          <Checklist
            title="TODO"
            items={bandTodos.map(({ id, text, done }) => ({ key: id, text, done }))}
            onAdd={props.onAddBandTodo}
            onText={(index, text) =>
              onBandTodo(index, (current, id, at) =>
                setBandTodoText(current, id, text, at),
              )
            }
            onToggle={(index) => onBandTodo(index, toggleBandTodo)}
            onRemove={(index) => onBandTodo(index, removeBandTodo)}
            onClearDone={() => props.onBandEdit(clearDoneBandTodos)}
          />
        </section>
      </div>
      <section className="setlists-panel">
        <div className="panel-head">
          <h2>Setlists</h2>
          <button
            type="button"
            className="add-new"
            aria-label="New setlist"
            title="New setlist"
            onClick={props.onNewSetlist}
          >
            <PlusIcon />
            New
          </button>
          <div className="page-controls">{props.controls}</div>
        </div>
        {activeSetlists(library).length === 0 && (
          <p className="panel-empty">
            No setlists yet. Make one, then drag songs into it from All songs.
          </p>
        )}
        {activeSetlists(library).map((setlist, index, shown) => {
          const entries = songsOf(library, setlist)
          const others = entries.filter((entry) => entry.id !== drag?.song)
          return (
            <article
              key={setlist.id}
              data-setlist={setlist.id}
              className={`setlist-card${drag?.over === setlist.id ? ' drop-into' : ''}`}
            >
              <div className="setlist-card-head">
                <h3>{setlist.name}</h3>
                <span className="count">{entries.length}</span>
                <Menu label="⋯" title={`${setlist.name} setlist`}>
                  <MenuItems
                    items={[
                      {
                        label: 'Move up',
                        onSelect: () => props.onMoveSetlist(setlist.id, -1),
                        keepsOpen: true,
                        disabled: index === 0,
                      },
                      {
                        label: 'Move down',
                        onSelect: () => props.onMoveSetlist(setlist.id, 1),
                        keepsOpen: true,
                        disabled: index === shown.length - 1,
                      },
                      {
                        label: 'Rename…',
                        onSelect: () => props.onRenameSetlist(setlist.id),
                      },
                      {
                        label: 'Delete setlist…',
                        onSelect: () => props.onDeleteSetlist(setlist.id),
                        quiet: true,
                      },
                    ]}
                  />
                </Menu>
              </div>
              {entries.length === 0 ? (
                <p className="setlist-empty">Drag songs here</p>
              ) : (
                <ol className="song-list">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      data-song={entry.id}
                      className={mark(setlist.id, others, entry).trim() || undefined}
                    >
                      <button
                        type="button"
                        {...grip(entry.id, setlist.id, titleOf(entry))}
                      >
                        ⠿
                      </button>
                      <button
                        type="button"
                        className="pick"
                        onClick={() => onOpen(entry.id, setlist.id)}
                      >
                        {titleOf(entry)}
                      </button>
                      <button
                        type="button"
                        className="drop"
                        aria-label={`Take ${titleOf(entry)} out of ${setlist.name}`}
                        title="Take out of this setlist"
                        onClick={() => props.onRemoveFromSetlist(setlist.id, entry.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          )
        })}
      </section>

      <section className="all-songs">
        <div className="panel-head">
          <h2>
            {filtering
              ? `Songs selected ${shown.length}/${library.songs.length}`
              : 'All songs'}
          </h2>
          <div className="new-song">
            <Menu
              label={
                <>
                  <PlusIcon />
                  New
                </>
              }
              title="New song"
            >
              <MenuItems items={props.adding} />
            </Menu>
          </div>
          <div className="song-order">
            {/* Set now and then, so folded behind one button; lit while any is on,
                since a list missing songs should say why. */}
            <div className={filtering ? 'song-filters on' : 'song-filters'}>
              <Menu
                label={<FunnelIcon />}
                title={filtering ? 'Filter songs (on)' : 'Filter songs'}
              >
                <MenuChecks
                  items={[
                    {
                      id: 'tab',
                      label: 'Has tab',
                      checked: only.tab,
                      onToggle: () => flip('tab'),
                    },
                    {
                      id: 'structure',
                      label: 'Has structure',
                      checked: only.structure,
                      onToggle: () => flip('structure'),
                    },
                    {
                      id: 'todo',
                      label: 'Has TODO',
                      checked: only.todo,
                      onToggle: () => flip('todo'),
                    },
                  ]}
                />
              </Menu>
            </div>
            <Toggle
              small
              label="Order"
              options={[
                { value: 'name', label: 'Name' },
                { value: 'edited', label: 'Last edited' },
                { value: 'bpm', label: 'BPM' },
              ]}
              value={order}
              onChange={orderBy}
            />
            <button
              type="button"
              className="song-direction"
              aria-label={direction === 'asc' ? 'Ascending' : 'Descending'}
              title={direction === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
            >
              <DirectionIcon direction={direction} />
            </button>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="panel-empty">No song has everything those filters ask for.</p>
        ) : (
          <ul className="song-rows">
            {shown.map((entry) => {
              const title = titleOf(entry)
              const inSetlists = setlistsWith(library, entry.id)
              const todos = entry.song.todos.filter(isOpen)
              return (
                <li key={entry.id}>
                  <button type="button" {...grip(entry.id, null, title)}>
                    ⠿
                  </button>
                  <button
                    type="button"
                    className="pick"
                    onClick={() => onOpen(entry.id, null)}
                  >
                    <span className="song-title">{title}</span>
                    {songFacts(entry.song).length > 0 && (
                      <span className="song-facts">
                        {songFacts(entry.song).join(' · ')}
                      </span>
                    )}
                  </button>
                  {todos.length > 0 && (
                    <button
                      type="button"
                      className="song-todos"
                      // One todo is short enough to read on hover; more are counted.
                      title={
                        todos.length === 1
                          ? todos[0]?.text
                          : `${todos.length} todos still to do, in Edit`
                      }
                      onClick={() => props.onEdit(entry.id)}
                    >
                      {/* As many as fit on the row's one line; the rest wrap out of sight. */}
                      <span className="song-todo-texts">
                        {todos.map((todo, index) => (
                          <span key={index}>{todo.text}</span>
                        ))}
                      </span>
                      <span className="chip song-todo">{todos.length}</span>
                    </button>
                  )}
                  <span className="song-setlists">
                    {/* Only the setlist that matters most, so a row stays one line. */}
                    {inSetlists.slice(0, 1).map((setlist) => (
                      <span key={setlist.id} className="chip">
                        {setlist.name}
                      </span>
                    ))}
                  </span>
                  <span className="song-edited">{edited(entry)}</span>
                  <Menu label="⋯" title={`${title} actions`}>
                    <MenuItems
                      items={[
                        { label: 'Open', onSelect: () => onOpen(entry.id, null) },
                        { label: 'Rename…', onSelect: () => props.onRename(entry.id) },
                        { label: 'Copy…', onSelect: () => props.onCopy(entry.id) },
                        {
                          label: 'Copy as link',
                          onSelect: () => props.onCopyLink(entry.id),
                        },
                        {
                          label: 'Export file…',
                          onSelect: () => props.onExport(entry.id),
                        },
                      ]}
                    />
                    {activeSetlists(library).length > 0 && (
                      <>
                        <p className="menu-label">Setlists</p>
                        <MenuChecks
                          items={activeSetlists(library).map((setlist) => ({
                            id: setlist.id,
                            label: setlist.name,
                            checked: setlist.songs.includes(entry.id),
                            onToggle: () => props.onToggleSetlist(setlist.id, entry.id),
                          }))}
                        />
                      </>
                    )}
                    {library.songs.length > 1 && (
                      <MenuItems
                        items={[
                          {
                            label: 'Delete…',
                            onSelect: () => props.onDelete(entry.id),
                            quiet: true,
                          },
                        ]}
                      />
                    )}
                  </Menu>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {drag !== null && dragged !== undefined && (
        <div
          className="drag-label"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {titleOf(dragged)}
        </div>
      )}
    </div>
  )
}
