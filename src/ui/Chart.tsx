import type { KeyboardEvent } from 'react'
import type { Action } from '../core/edit.ts'
import type { Section, Song } from '../core/model.ts'

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

      {song.chart.map((section, index) => (
        <article className="section" key={index}>
          <div className="section-head">
            <input
              className="section-name"
              aria-label={`Section ${index + 1} name`}
              placeholder="Verse 1"
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
