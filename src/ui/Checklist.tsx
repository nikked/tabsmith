import { useEffect, useRef } from 'react'

export type ChecklistItem = {
  /** Stable across edits, so a row keeps its field while others come and go. */
  readonly key: string
  readonly text: string
  readonly done: boolean
}

type Props = {
  readonly title: string
  readonly items: readonly ChecklistItem[]
  readonly onAdd: () => void
  readonly onText: (index: number, text: string) => void
  readonly onToggle: (index: number) => void
  readonly onRemove: (index: number) => void
  readonly onClearDone: () => void
}

/**
 * A list of things to do: a box to tick and the text beside it. A ticked item
 * stays, struck through, until Clear done, so what got done since last time
 * can be seen. Enter in an item starts the next one, the way a list is typed.
 */
export function Checklist({
  title,
  items,
  onAdd,
  onText,
  onToggle,
  onRemove,
  onClearDone,
}: Props) {
  const list = useRef<HTMLUListElement>(null)
  // Set by adding, so the new item takes the typing once it is drawn; any
  // other change leaves focus where it is.
  const focusLast = useRef(false)

  useEffect(() => {
    if (!focusLast.current) return
    focusLast.current = false
    const fields = list.current?.querySelectorAll<HTMLInputElement>('input[type="text"]')
    fields?.[fields.length - 1]?.focus()
  }, [items.length])

  const add = () => {
    focusLast.current = true
    onAdd()
  }

  return (
    <section className="checklist" aria-label={title}>
      <h3 className="checklist-title">{title}</h3>
      {items.length > 0 && (
        <ul ref={list}>
          {items.map((item, index) => (
            <li key={item.key} className={item.done ? 'done' : undefined}>
              <input
                type="checkbox"
                aria-label={`Done: ${item.text === '' ? 'empty item' : item.text}`}
                checked={item.done}
                onChange={() => onToggle(index)}
              />
              <input
                type="text"
                aria-label={`${title} ${index + 1}`}
                placeholder="To do"
                value={item.text}
                onChange={(event) => onText(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  add()
                }}
              />
              <button type="button" title="Remove" onClick={() => onRemove(index)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="checklist-actions">
        <button type="button" className="chip" onClick={add}>
          + Add
        </button>
        {items.some((item) => item.done) && (
          <button type="button" className="chip" onClick={onClearDone}>
            Clear done
          </button>
        )}
      </div>
    </section>
  )
}
