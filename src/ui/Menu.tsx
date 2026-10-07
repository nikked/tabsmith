import { useId, type ReactNode } from 'react'

export type MenuItem = {
  readonly label: string
  readonly onSelect: () => void
  readonly quiet?: boolean
}

type Props = {
  readonly label: ReactNode
  readonly title: string
  readonly children: ReactNode
}

/**
 * A popover rather than a hand-rolled dropdown, for the same reason the keys
 * guide is a <dialog>: Escape, a click outside and the stacking are the
 * browser's. A button marked data-closes-menu closes it, since that one is a
 * whole action; the rest — opening a group, dragging a song, a nested menu's
 * own button — leave it open around them.
 */
export function Menu({ label, title, children }: Props) {
  const id = useId()
  const anchor = `--menu-${id.replaceAll(':', '')}`

  return (
    <>
      <button
        type="button"
        className="menu-open"
        aria-label={title}
        title={title}
        popoverTarget={id}
        style={{ anchorName: anchor }}
      >
        {label}
      </button>
      <div
        id={id}
        popover="auto"
        className="menu"
        style={{ positionAnchor: anchor }}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-closes-menu]') !== null
          ) {
            event.currentTarget.hidePopover()
          }
        }}
      >
        {children}
      </div>
    </>
  )
}

export function MenuItems({ items }: { readonly items: readonly MenuItem[] }) {
  return items.map((item) => (
    <button
      key={item.label}
      type="button"
      className={item.quiet === true ? 'quiet' : undefined}
      data-closes-menu
      onClick={item.onSelect}
    >
      {item.label}
    </button>
  ))
}

export type MenuCheck = {
  readonly id: string
  readonly label: string
  readonly checked: boolean
  readonly onToggle: () => void
}

/**
 * Settings rather than actions, so ticking one leaves the menu open: putting a
 * song in three setlists is three ticks, not three trips to the menu.
 */
export function MenuChecks({ items }: { readonly items: readonly MenuCheck[] }) {
  return items.map((item) => (
    <label key={item.id} className="menu-check">
      <input type="checkbox" checked={item.checked} onChange={item.onToggle} />
      {item.label}
    </label>
  ))
}
