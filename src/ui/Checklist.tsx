import { useEffect, useEffectEvent, useRef } from 'react'
import { isOpen } from '../core/model.ts'

export type ChecklistItem = {
  /** Stable across edits, so a row keeps its field while others come and go. */
  readonly key: string
  readonly text: string
  readonly done: boolean
  readonly indented: boolean
}

type Props = {
  readonly title: string
  readonly items: readonly ChecklistItem[]
  /**
   * At `index` among the items; indented to carry on under the same one, as
   * Enter in an indented one does.
   */
  readonly onAdd: (index: number, indented: boolean) => void
  readonly onText: (index: number, text: string) => void
  readonly onToggle: (index: number) => void
  readonly onIndent: (index: number, indented: boolean) => void
  readonly onRemove: (index: number) => void
  readonly onClearDone: () => void
  /** Asked for once, from a count of what is left: the first item still to do takes focus. */
  readonly focusFirstOpen?: boolean
  readonly onFocused?: () => void
}

/**
 * A list of things to do: a box to tick and the text beside it. A ticked item
 * stays, struck through, until Clear done, so what got done since last time
 * can be seen. Enter in an item starts a new one right below it, at its
 * indent, the way a list is typed; + Add puts one at the end.
 * Tab puts an item under the one above, one level deep, and Shift+Tab takes it
 * back out; where neither changes anything, they move focus as anywhere else.
 */
export function Checklist({
  title,
  items,
  onAdd,
  onText,
  onToggle,
  onIndent,
  onRemove,
  onClearDone,
  focusFirstOpen = false,
  onFocused,
}: Props) {
  const list = useRef<HTMLUListElement>(null)
  // Set by adding, so the new item takes the typing once it is drawn; any
  // other change leaves focus where it is.
  const focusAt = useRef<number | null>(null)

  useEffect(() => {
    if (focusAt.current === null) return
    const index = focusAt.current
    focusAt.current = null
    list.current
      ?.querySelectorAll<HTMLTextAreaElement>('.checklist-text textarea')
      [index]?.focus()
  }, [items.length])

  const focusOpen = useEffectEvent(() => {
    const index = items.findIndex(isOpen)
    const field = list.current?.querySelectorAll<HTMLTextAreaElement>(
      '.checklist-text textarea',
    )[index]
    field?.focus()
    field?.scrollIntoView({ block: 'center' })
    onFocused?.()
  })

  useEffect(() => {
    if (focusFirstOpen) focusOpen()
  }, [focusFirstOpen])

  const add = (index: number, indented: boolean) => {
    focusAt.current = index
    onAdd(index, indented)
  }

  return (
    <section className="checklist" aria-label={title}>
      <h3 className="checklist-title">{title}</h3>
      {items.length > 0 && (
        <ul ref={list}>
          {items.map((item, index) => (
            <li
              key={item.key}
              className={
                [item.done && 'done', item.indented && index > 0 && 'indented']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              <input
                type="checkbox"
                aria-label={`Done: ${item.text === '' ? 'empty item' : item.text}`}
                checked={item.done}
                onChange={() => onToggle(index)}
              />
              {/* A textarea so a long item wraps; the copy of its text the span
                  carries sizes it, so it grows a line at a time with no script. */}
              <span className="checklist-text" data-text={item.text}>
                <textarea
                  rows={1}
                  aria-label={`${title} ${index + 1}`}
                  placeholder="To do"
                  value={item.text}
                  // An item is one line of thought: a pasted break is a space.
                  onChange={(event) =>
                    onText(index, event.target.value.replace(/\n/g, ' '))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Tab') {
                      if (event.ctrlKey || event.metaKey || event.altKey) return
                      const indented = !event.shiftKey
                      if (index === 0 || item.indented === indented) return
                      event.preventDefault()
                      onIndent(index, indented)
                      return
                    }
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    add(index + 1, index > 0 && item.indented)
                  }}
                />
              </span>
              <button type="button" title="Remove" onClick={() => onRemove(index)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="checklist-actions">
        <button type="button" className="chip" onClick={() => add(items.length, false)}>
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
