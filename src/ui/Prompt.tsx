import { useState, type ReactNode } from 'react'

type Props = {
  readonly heading: string
  readonly children: ReactNode
  readonly label: string
  readonly initial: string
  readonly confirm: string
  readonly danger?: boolean
  readonly accepts: (value: string) => boolean
  readonly onConfirm: (value: string) => void
  readonly onClose: () => void
}

/**
 * Defined once, outside the component: a ref callback that is a new function on
 * every render is called again on every render, and would reopen the dialog
 * the moment it closes.
 *
 * The field is focused here, once the dialog is open. React's autoFocus runs
 * before this, while the dialog is still hidden, so it does nothing; and Safari
 * then focuses the dialog itself, leaving a hardware keyboard — an iPad's
 * folio — typing into nothing.
 */
const openOnMount = (dialog: HTMLDialogElement | null) => {
  if (dialog === null || dialog.open) return
  dialog.showModal()
  dialog.querySelector('input')?.focus()
}

/**
 * One line of text and a button that waits for the right one. Mounted only
 * while asking, and opened as it mounts, so each question starts from its own
 * initial value rather than from whatever the last one was left holding.
 * Closing is unmounting; the dialog's own close event is only for Escape.
 */
export function Prompt({
  heading,
  children,
  label,
  initial,
  confirm,
  danger = false,
  accepts,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(initial)

  return (
    <dialog ref={openOnMount} className="prompt" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!accepts(value)) return
          onConfirm(value)
          onClose()
        }}
      >
        <h2>{heading}</h2>
        <p>{children}</p>
        <input
          aria-label={label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="shelf-actions">
          <button
            type="submit"
            className={danger ? 'danger' : undefined}
            disabled={!accepts(value)}
          >
            {confirm}
          </button>
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  )
}
