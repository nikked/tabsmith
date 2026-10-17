import type { Settings } from '../sync.ts'

type Props = {
  readonly syncWith: Settings | null
  readonly syncNote: string | null
  readonly onConnect: (to: Settings | null) => void
  readonly onSync: () => void
}

/**
 * Set up once per device and then left alone, so it is in Settings rather than
 * on the shelf you open every time you switch songs.
 */
export function Sync({ syncWith, syncNote, onConnect, onSync }: Props) {
  return (
    <section className="sync-section" aria-label="Database sync">
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
          <button type="submit" className="tint-blue">
            Connect
          </button>
        </form>
      ) : (
        <div className="shelf-actions">
          <button type="button" className="tint-blue" onClick={onSync}>
            Sync now
          </button>
          <button type="button" className="tint-red" onClick={() => onConnect(null)}>
            Disconnect
          </button>
        </div>
      )}
      {syncNote !== null && <p className="sync-note">{syncNote}</p>}
    </section>
  )
}
