import type { RefObject } from 'react'
import type { Theme } from '../screen.ts'
import { Toggle } from './Toggle.tsx'

type Props = {
  readonly dialog: RefObject<HTMLDialogElement | null>
  readonly theme: Theme
  readonly onTheme: (theme: Theme) => void
  readonly onBackUp: () => void
  readonly onSync: () => void
}

/**
 * What is set for the whole app on this device rather than for a song. A song's
 * own actions are on the ⋯ beside it on Home.
 */
export function SettingsDialog({ dialog, theme, onTheme, onBackUp, onSync }: Props) {
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
      <h3>Theme</h3>
      <Toggle
        small
        label="Theme"
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'System' },
        ]}
        value={theme}
        onChange={onTheme}
      />

      <form method="dialog">
        <button type="submit">Done</button>
      </form>
    </dialog>
  )
}
