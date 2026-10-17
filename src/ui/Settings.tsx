import type { RefObject } from 'react'

type Props = {
  readonly dialog: RefObject<HTMLDialogElement | null>
  readonly onBackUp: () => void
  readonly onSync: () => void
}

/**
 * What is set for the whole app on this device rather than for a song. A song's
 * own actions are on the ⋯ beside it on Home.
 */
export function SettingsDialog({ dialog, onBackUp, onSync }: Props) {
  return (
    <dialog ref={dialog} className="settings-dialog">
      <h2>Settings</h2>
      <div className="shelf-actions">
        <button type="button" onClick={onBackUp}>
          Back up all songs
        </button>
        <button type="button" onClick={onSync}>
          Database sync
        </button>
      </div>
      <form method="dialog">
        <button type="submit">Done</button>
      </form>
    </dialog>
  )
}
