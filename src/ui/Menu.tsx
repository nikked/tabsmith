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
 * browser's. Any button in it closes it, since each one is a whole action rather
 * than a setting.
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
            event.target.closest('button') !== null
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
      onClick={item.onSelect}
    >
      {item.label}
    </button>
  ))
}
