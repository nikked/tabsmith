import { useRef, useState, type KeyboardEvent } from 'react'
import type { Action } from '../core/edit.ts'
import { SECTION_NAMES, suggestedName, type Section, type Song } from '../core/model.ts'

type Props = {
  readonly song: Song
  readonly dispatch: (action: Action) => void
}

/**
 * One is allowed through even though it means nothing, because it is the first
 * keystroke of twelve — rejecting it would empty the field under the typist.
 * The render is what decides a repeat is worth printing.
 */
/**
 * A tab in a section body is a jump to the next tab stop, which is how two
 * blocks are made to start at the same column. Inserted through execCommand so
 * the browser keeps its own undo history — assigning to value would throw that
 * away, and React would not see an input event either.
 */
const insertTab = (field: HTMLTextAreaElement): void => {
  if (document.execCommand?.('insertText', false, '\t')) return
  const { selectionStart: from, selectionEnd: to, value } = field
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setValue?.call(field, `${value.slice(0, from)}\t${value.slice(to)}`)
  field.setSelectionRange(from + 1, from + 1)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Tab types a tab here rather than leaving the field. Shift+Tab still moves
 * focus, so the body is not a keyboard trap.
 */
const onBodyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
  if (event.key !== 'Tab') return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  insertTab(event.currentTarget)
}

const parseRepeat = (raw: string): number | undefined => {
  const value = Number(raw)
  return raw === '' || !Number.isInteger(value) || value < 1 ? undefined : value
}

export function Chart({ song, dispatch }: Props) {
  const setSection = (index: number, section: Section) =>
    dispatch({ kind: 'setSection', index, section })
  const articles = useRef<Record<number, HTMLElement | null>>({})
  const bodies = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const [drag, setDrag] = useState<{ readonly from: number; readonly to: number } | null>(
    null,
  )

  // The same drop rule as the tab's rows: past every other section whose
  // middle is above the pointer, which is the index moveSection takes.
  const dropIndex = (from: number, y: number): number =>
    song.chart.filter((_, index) => {
      const node = articles.current[index]
      if (index === from || node == null) return false
      const box = node.getBoundingClientRect()
      return box.top + box.height / 2 < y
    }).length

  const dropMark = (index: number): string => {
    if (drag === null || drag.to === drag.from) return ''
    if (index === drag.from) return ' lifted'
    if (index !== drag.to) return ''
    return drag.to > drag.from ? ' drop-below' : ' drop-above'
  }

  return (
    <section className="chart">
      <div className="meta">
        <input
          className="title"
          aria-label="Song title"
          placeholder="Song title"
          value={song.title}
          onChange={(event) => dispatch({ kind: 'setTitle', title: event.target.value })}
        />
        <input
          className="tempo"
          aria-label="Tempo"
          placeholder="70 bpm"
          value={song.tempo}
          onChange={(event) => dispatch({ kind: 'setTempo', tempo: event.target.value })}
        />
      </div>

      <datalist id="section-names">
        {SECTION_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {song.chart.map((section, index) => (
        <article
          className={`section${dropMark(index)}`}
          key={index}
          ref={(node) => {
            articles.current[index] = node
          }}
        >
          <div className="section-head">
            {song.chart.length > 1 && (
              <button
                type="button"
                className="section-grip"
                title="Drag to move this section"
                aria-label={`Move section ${index + 1}`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDrag({ from: index, to: index })
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                  setDrag({ from: index, to: dropIndex(index, event.clientY) })
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    dispatch({
                      kind: 'moveSection',
                      index,
                      to: dropIndex(index, event.clientY),
                    })
                  }
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
              >
                ⠿
              </button>
            )}
            <input
              className="section-name"
              aria-label={`Section ${index + 1} name`}
              list="section-names"
              placeholder={suggestedName(index)}
              value={section.name}
              onChange={(event) =>
                setSection(index, { ...section, name: event.target.value })
              }
            />
            <label className="repeat">
              ×
              <input
                className="section-repeat"
                type="number"
                min={1}
                aria-label={`Section ${index + 1} repeat`}
                placeholder="1"
                value={section.repeat ?? ''}
                onChange={(event) =>
                  setSection(index, {
                    ...section,
                    repeat: parseRepeat(event.target.value),
                  })
                }
              />
            </label>
            <button
              type="button"
              title="Move this section up"
              disabled={index === 0}
              onClick={() => dispatch({ kind: 'moveSection', index, to: index - 1 })}
            >
              ↑
            </button>
            <button
              type="button"
              title="Move this section down"
              disabled={index === song.chart.length - 1}
              onClick={() => dispatch({ kind: 'moveSection', index, to: index + 1 })}
            >
              ↓
            </button>
            <button
              type="button"
              title="Split this section in two at the caret"
              // Focus stays on the button, so Cmd/Ctrl+Z reaches the editor's
              // undo rather than the body's own, which knows nothing of the split.
              onClick={() =>
                dispatch({
                  kind: 'splitSection',
                  index,
                  at: bodies.current[index]?.selectionStart ?? 0,
                })
              }
            >
              ✂
            </button>
            <button
              type="button"
              title="Duplicate this section"
              onClick={() => dispatch({ kind: 'duplicateSection', index })}
            >
              ⧉
            </button>
            <button
              type="button"
              title="Add a section below"
              onClick={() => dispatch({ kind: 'addSection', after: index })}
            >
              +
            </button>
            <button
              type="button"
              title="Remove this section"
              disabled={song.chart.length <= 1}
              onClick={() => dispatch({ kind: 'removeSection', index })}
            >
              −
            </button>
          </div>
          <textarea
            ref={(node) => {
              bodies.current[index] = node
            }}
            aria-label={`Section ${index + 1} chords`}
            spellCheck={false}
            rows={Math.max(2, section.body.split('\n').length + 1)}
            value={section.body}
            onChange={(event) =>
              setSection(index, { ...section, body: event.target.value })
            }
            onKeyDown={onBodyKeyDown}
          />
        </article>
      ))}
    </section>
  )
}
