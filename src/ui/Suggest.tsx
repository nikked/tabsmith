import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { matching } from '../core/suggest.ts'

type Props = {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly suggestions: readonly string[]
  readonly label: string
  readonly placeholder?: string
  readonly className?: string
  /** Placement of the whole field, for a field that is a grid or flex item. */
  readonly style?: CSSProperties
}

/**
 * A text field offering what has been typed before, in a list drawn here
 * rather than the browser's own: a datalist pops up in whatever shape the
 * browser likes, and none of it can be styled. Anything can still be typed.
 */
export function Suggest({
  value,
  onChange,
  suggestions,
  label,
  placeholder,
  className,
  style,
}: Props) {
  const list = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const shown = open ? matching(suggestions, value) : []

  const pick = (choice: string) => {
    onChange(choice)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setOpen(true)
      setActive((at) => {
        const count = matching(suggestions, value).length
        return count === 0 ? -1 : (at + step + count) % count
      })
      return
    }
    if (event.key === 'Enter' && shown[active] !== undefined) {
      event.preventDefault()
      pick(shown[active])
      return
    }
    if (event.key === 'Escape' && shown.length > 0) {
      // Only this list closes: an Escape with nothing open is the page's.
      event.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <span className="suggest" style={style}>
      <input
        className={className}
        aria-label={label}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown.length > 0}
        aria-controls={list}
        aria-activedescendant={
          shown[active] === undefined ? undefined : `${list}-${active}`
        }
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
      />
      {shown.length > 0 && (
        <ul id={list} role="listbox" className="suggest-list">
          {shown.map((choice, index) => (
            <li
              key={choice}
              id={`${list}-${index}`}
              role="option"
              aria-selected={index === active}
              // Down, not click: a click lands after the field's blur has
              // already closed the list.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(choice)
              }}
            >
              {choice}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
