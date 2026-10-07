import { useState, type PointerEvent } from 'react'
import { z } from 'zod'
import {
  byEdited,
  byTitle,
  hasStructure,
  hasTab,
  matching,
  openEntry,
  titleOf,
  type Entry,
  type Library,
} from '../core/library.ts'
import { activeSetlists, setlistsWith, songsOf } from '../core/setlists.ts'
import { Menu, MenuChecks, MenuItems } from './Menu.tsx'
import { Toggle } from './Toggle.tsx'

type Props = {
  readonly library: Library
  /** The setlist it was opened from, or null from All songs. */
  readonly onOpen: (song: string, setlist: string | null) => void
  readonly onRename: (song: string) => void
  readonly onCopy: (song: string) => void
  readonly onCopyLink: (song: string) => void
  readonly onExport: (song: string) => void
  readonly onDelete: (song: string) => void
  readonly onToggleSetlist: (setlist: string, song: string) => void
  readonly onNewSetlist: () => void
  readonly onRenameSetlist: (setlist: string) => void
  readonly onDeleteSetlist: (setlist: string) => void
  readonly onRemoveFromSetlist: (setlist: string, song: string) => void
  readonly onPlace: (setlist: string, song: string, to: number) => void
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

const filters = z.object({ tab: z.boolean(), structure: z.boolean() })

type Filters = z.infer<typeof filters>

const rememberedFilters = (): Filters => {
  try {
    const result = filters.safeParse(JSON.parse(localStorage.getItem(FILTERS) ?? 'null'))
    return result.success ? result.data : { tab: false, structure: false }
  } catch {
    return { tab: false, structure: false }
  }
}

const edited = (entry: Entry): string =>
  entry.updatedAt === 0 ? '—' : new Date(entry.updatedAt).toLocaleDateString()

/**
 * Every song and every setlist, laid out to be arranged rather than switched
 * between: setlists on one side, all songs on the other, and a song dragged
 * from anywhere into a setlist lands where it is dropped.
 */
export function SongsPage(props: Props) {
  const { library, onOpen, onPlace } = props
  const open = openEntry(library).id
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<'name' | 'edited'>('name')
  const [drag, setDrag] = useState<Drag | null>(null)

  const sorted = order === 'name' ? byTitle(library.songs) : byEdited(library.songs)
  const [only, setOnly] = useState(rememberedFilters)
  const shown = matching(sorted, query).filter(
    (entry) => (!only.tab || hasTab(entry)) && (!only.structure || hasStructure(entry)),
  )

  // Built on the latest filters, like the sidebar's folds, so two in a row both land.
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
      <section className="setlists-panel">
        <div className="panel-head">
          <h2>Setlists</h2>
          <button type="button" onClick={props.onNewSetlist}>
            + New setlist
          </button>
        </div>
        {activeSetlists(library).length === 0 && (
          <p className="panel-empty">
            No setlists yet. Make one, then drag songs into it from All songs.
          </p>
        )}
        {activeSetlists(library).map((setlist) => {
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
                      className={`${entry.id === open ? 'current' : ''}${mark(setlist.id, others, entry)}`}
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
          <h2>All songs</h2>
          <input
            type="search"
            className="song-search"
            placeholder="Find a song"
            aria-label="Find a song"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="filter"
            aria-pressed={only.tab}
            title="Only songs with something written in the tab"
            onClick={() => flip('tab')}
          >
            Has tab
          </button>
          <button
            type="button"
            className="filter"
            aria-pressed={only.structure}
            title="Only songs with at least two parts written out"
            onClick={() => flip('structure')}
          >
            Has structure
          </button>
          <Toggle
            small
            label="Order"
            options={[
              { value: 'name', label: 'Name' },
              { value: 'edited', label: 'Last edited' },
            ]}
            value={order}
            onChange={setOrder}
          />
        </div>
        {shown.length === 0 ? (
          <p className="panel-empty">
            {query.trim() === ''
              ? 'No song has everything those filters ask for.'
              : `No song matches “${query.trim()}”${only.tab || only.structure ? ' with those filters' : ''}.`}
          </p>
        ) : (
          <ul className="song-rows">
            {shown.map((entry) => {
              const title = titleOf(entry)
              const inSetlists = setlistsWith(library, entry.id)
              return (
                <li key={entry.id} className={entry.id === open ? 'current' : undefined}>
                  <button type="button" {...grip(entry.id, null, title)}>
                    ⠿
                  </button>
                  <button
                    type="button"
                    className="pick"
                    onClick={() => onOpen(entry.id, null)}
                  >
                    <span className="song-title">{title}</span>
                    {entry.song.tempo !== '' && (
                      <span className="song-tempo">{entry.song.tempo}</span>
                    )}
                  </button>
                  <span className="song-setlists">
                    {inSetlists.map((setlist) => (
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
