import type { RefObject } from 'react'
import type { Settings } from '../sync.ts'

type Props = {
  readonly dialog: RefObject<HTMLDialogElement | null>
  readonly syncWith: Settings | null
  readonly syncNote: string | null
  readonly onConnect: (to: Settings | null) => void
  readonly onSync: () => void
}

/**
 * Set up once per device and then left alone, so it is out of the shelf you
 * open every time you switch songs.
 */
export function Sync({ dialog, syncWith, syncNote, onConnect, onSync }: Props) {
  return (
    <dialog ref={dialog} className="sync-dialog">
      <h2>Database sync</h2>
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
