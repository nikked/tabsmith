import type { RefObject } from 'react'
import type { Settings } from '../sync.ts'
import { Sync } from './Sync.tsx'

type Props = {
  readonly dialog: RefObject<HTMLDialogElement | null>
  readonly syncWith: Settings | null
  readonly syncNote: string | null
  readonly onBackUp: () => void
  readonly onConnect: (to: Settings | null) => void
  readonly onSync: () => void
}

/**
 * What is set for the whole app on this device rather than for a song: the
 * backup and the database sync, in one dialog. A song's own actions are on the
 * ⋯ beside it on Home.
 */
export function SettingsDialog({
  dialog,
  syncWith,
  syncNote,
  onBackUp,
  onConnect,
  onSync,
}: Props) {
  return (
    <dialog ref={dialog} className="settings-dialog">
      <h2>Settings</h2>
      {/* A dialog form closes it, the way Escape and a click outside do. */}
      <form method="dialog">
        <button type="submit" className="dialog-close" aria-label="Close" title="Close">
          ✕
        </button>
      </form>
      <div className="shelf-actions">
        <button type="button" className="tint-green" onClick={onBackUp}>
          Back up all songs
        </button>
      </div>
      <Sync
        syncWith={syncWith}
        syncNote={syncNote}
        onConnect={onConnect}
        onSync={onSync}
      />
    </dialog>
  )
}
