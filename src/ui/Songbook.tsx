import type { RefObject } from 'react'
import { openEntry, titleOf, type Library } from '../core/library.ts'
import type { Settings } from '../sync.ts'

type Props = {
  readonly shelf: RefObject<HTMLDialogElement | null>
  readonly library: Library
  readonly onOpen: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly onNew: () => void
  readonly onImport: () => void
  readonly onPaste: () => void
  readonly onDemo: () => void
  readonly onExport: () => void
  readonly onShare: () => void
  readonly copied: boolean
  readonly onClear: () => void
  readonly syncWith: Settings | null
  readonly syncNote: string | null
  readonly onConnect: (to: Settings | null) => void
  readonly onSync: () => void
}

/**
 * The shelf. Everything that acts on a whole song lives here rather than in the
 * header: on a phone the header is the scarcest space on the page, and none of
 * these is something you reach for while writing.
 *
 * Same <dialog> arrangement as the keys guide — Escape, the backdrop and the
 * focus trap are the browser's, and whether it is open is the element's own
 * business rather than a second copy of that fact in React.
 */
export function Songbook({
  shelf,
  library,
  onOpen,
  onDelete,
  onNew,
  onImport,
  onPaste,
  onDemo,
  onExport,
  onShare,
  copied,
  onClear,
  syncWith,
  syncNote,
  onConnect,
  onSync,
}: Props) {
  const open = openEntry(library)

  return (
    <dialog ref={shelf} className="songbook">
      <h2>Songs</h2>
      <ul>
        {library.songs.map((entry) => (
          <li key={entry.id} className={entry.id === open.id ? 'current' : undefined}>
            <button
              type="button"
              className="pick"
              aria-current={entry.id === open.id}
              onClick={() => onOpen(entry.id)}
            >
              {titleOf(entry)}
            </button>
            <button
              type="button"
              className="drop"
              title={`Delete ${titleOf(entry)}`}
              disabled={library.songs.length <= 1}
              onClick={() => onDelete(entry.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="shelf-actions">
        <button type="button" onClick={onNew}>
          New song
        </button>
        <button type="button" onClick={onPaste}>
          Paste…
        </button>
        <button type="button" onClick={onImport}>
          Import file…
        </button>
        <button type="button" className="quiet" onClick={onDemo}>
          Demo
        </button>
      </div>

      <h3>{titleOf(open)}</h3>
      <div className="shelf-actions">
        <button type="button" onClick={onExport}>
          Export…
        </button>
        <button type="button" onClick={onShare}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button type="button" className="quiet" onClick={onClear}>
          Clear
        </button>
      </div>

      <h3>Database sync</h3>
      {syncWith === null ? (
        <form
          className="sync"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            onConnect({
              url: String(data.get('url')),
              token: String(data.get('token')),
            })
          }}
        >
          <input name="url" type="url" placeholder="Database URL" required />
          <input name="token" type="password" placeholder="Token" required />
          <button type="submit">Connect</button>
        </form>
      ) : (
        <div className="shelf-actions">
          <button type="button" onClick={onSync}>
            Sync now
          </button>
          <button type="button" className="quiet" onClick={() => onConnect(null)}>
            Disconnect
          </button>
        </div>
      )}
      {syncNote !== null && <p className="sync-note">{syncNote}</p>}

      <form method="dialog">
        <button type="submit">Done</button>
      </form>
    </dialog>
  )
}
