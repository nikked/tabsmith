import { useRef, useState, type KeyboardEvent } from 'react'
import type { Action } from '../core/edit.ts'
import {
  KEYS,
  SECTION_NAMES,
  suggestedName,
  type Key,
  type Section,
  type Song,
} from '../core/model.ts'
import { KEYS_BY_SEMITONE, suggestKey } from '../core/notation.ts'
import { NotedLines } from './NotedLines.tsx'
import { SongNotes } from './SongNotes.tsx'
import { Suggest } from './Suggest.tsx'
import { Synths } from './Synths.tsx'

type Props = {
  readonly song: Song
  /** Every song on the shelf, for the synth settings earlier songs used. */
  readonly songs: readonly Song[]
  readonly dispatch: (action: Action) => void
  /** Opened from a todo count on Home, so the first todo left takes focus. */
  readonly focusTodo: boolean
  readonly onTodoFocused: () => void
}

/** Digits only, and nothing typed or a zero is no tempo at all. */
const bpmOf = (text: string): number | null => {
  const bpm = Number(text.replace(/\D/g, '').slice(0, 3))
  return bpm > 0 ? bpm : null
}

const keyOf = (value: string): Key | null => KEYS.find((key) => key === value) ?? null

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

export function Chart({ song, songs, dispatch, focusTodo, onTodoFocused }: Props) {
  const setSection = (index: number, section: Section) =>
    dispatch({ kind: 'setSection', index, section })
  const articles = useRef<Record<number, HTMLElement | null>>({})
  const bodies = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const mirrors = useRef<Record<number, HTMLPreElement | null>>({})
  const suggested = suggestKey(song.tab)
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
        <div className="facts">
          <label className="chip bpm">
            <input
              aria-label="Tempo in bpm"
              inputMode="numeric"
              placeholder="70"
              value={song.bpm ?? ''}
              onChange={(event) =>
                dispatch({ kind: 'setBpm', bpm: bpmOf(event.target.value) })
              }
            />
            bpm
          </label>
          <span className="chip select">
            <select
              aria-label="Key"
              value={song.key ?? ''}
              onChange={(event) =>
                dispatch({ kind: 'setKey', key: keyOf(event.target.value) })
              }
            >
              <option value="">No key</option>
              {KEYS_BY_SEMITONE.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </span>
          {song.key === null && suggested !== null && (
            <button
              type="button"
              className="chip suggest-key"
              title="Suggested from the notes in the tab"
              onClick={() => dispatch({ kind: 'setKey', key: suggested })}
            >
              Use {suggested}?
            </button>
          )}
          <label className="chip">
            <input
              aria-label="Song note"
              placeholder="Note"
              // An input does not grow with its text, so the pill is sized to it.
              size={Math.max(song.note.length, 4)}
              value={song.note}
              onChange={(event) =>
                dispatch({ kind: 'setNote', note: event.target.value })
              }
            />
          </label>
        </div>
      </div>

      <Synths song={song} songs={songs} dispatch={dispatch} />

      <SongNotes
        song={song}
        dispatch={dispatch}
        focusTodo={focusTodo}
        onTodoFocused={onTodoFocused}
      />

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
            <Suggest
              className="section-name"
              label={`Section ${index + 1} name`}
              placeholder={suggestedName(index)}
              value={section.name}
              suggestions={SECTION_NAMES}
              onChange={(name) => setSection(index, { ...section, name })}
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
          {/* A textarea cannot colour part of its text, so the body is drawn
              again underneath it with the notes set apart, and the field on
              top shows only its caret and selection. */}
          <div className="section-body">
            <pre
              ref={(node) => {
                mirrors.current[index] = node
              }}
              className="body-mirror"
              aria-hidden="true"
            >
              <NotedLines body={section.body} />
            </pre>
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
              onScroll={(event) => {
                const mirror = mirrors.current[index]
                if (mirror != null) mirror.scrollLeft = event.currentTarget.scrollLeft
              }}
            />
          </div>
        </article>
      ))}
    </section>
  )
}
