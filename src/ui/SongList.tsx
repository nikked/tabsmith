import { useState } from 'react'
import { z } from 'zod'
import { byTitle, openEntry, titleOf, type Entry, type Library } from '../core/library.ts'
import { activeSetlists, songsOf } from '../core/setlists.ts'

type Props = {
  readonly library: Library
  /** The setlist it was opened from, or null from All songs. */
  readonly onOpen: (song: string, setlist: string | null) => void
}

/** All songs is a group like the setlists, with an id none of them can have. */
const ALL = ''

/**
 * Which groups were left open, by id, kept per browser: it is how this person
 * likes the sidebar, not something about the songs, so it does not sync. A
 * group never touched starts folded, so the sidebar is a short list of names
 * to open rather than every song at once.
 */
const OPEN = 'tabsmith.sidebarOpen'

const remembered = (): Readonly<Record<string, boolean>> => {
  try {
    const result = z
      .record(z.string(), z.boolean())
      .safeParse(JSON.parse(localStorage.getItem(OPEN) ?? '{}'))
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

/**
 * The shelf as a tree, for switching songs while writing: each setlist with its
 * songs in the order they are played, then every song by name. Arranging them
 * is the Songs page's job, so nothing here moves or deletes anything.
 */
export function SongTree({ library, onOpen }: Props) {
  const open = openEntry(library).id
  const [opened, setOpened] = useState(remembered)
  const openIn = (map: Readonly<Record<string, boolean>>, id: string): boolean =>
    map[id] ?? false
  const isOpen = (id: string): boolean => openIn(opened, id)

  // Built on the latest folds rather than this render's, so two toggles in a
  // row both land. Writing the same value twice is harmless, which keeps the
  // write safe inside the updater.
  const toggle = (id: string) =>
    setOpened((current) => {
      const next = { ...current, [id]: !openIn(current, id) }
      localStorage.setItem(OPEN, JSON.stringify(next))
      return next
    })

  const group = (id: string, name: string, entries: readonly Entry[]) => (
    <section key={id} className="setlist">
      <div className="setlist-head">
        <button
          type="button"
          className="setlist-toggle"
          aria-expanded={isOpen(id)}
          onClick={() => toggle(id)}
        >
          <span className="caret" aria-hidden="true">
            ▸
          </span>
          <span className="setlist-name">{name}</span>
          <span className="count">{entries.length}</span>
        </button>
      </div>
      {isOpen(id) &&
        (entries.length === 0 ? (
          <p className="setlist-empty">No songs yet</p>
        ) : (
          <ul className="song-list">
            {entries.map((entry) => (
              <li key={entry.id} className={entry.id === open ? 'current' : undefined}>
                <button
                  type="button"
                  className="pick"
                  aria-current={entry.id === open}
                  onClick={() => onOpen(entry.id, id === ALL ? null : id)}
                >
                  {titleOf(entry)}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )

  return (
    <div className="song-tree">
      {activeSetlists(library).map((setlist) =>
        group(setlist.id, setlist.name, songsOf(library, setlist)),
      )}
      {group(ALL, 'All songs', byTitle(library.songs))}
    </div>
  )
}
