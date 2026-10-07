import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
} from 'react'
import {
  atFirstBar,
  atLastBar,
  removeBarDropsContent,
  removeRowDropsContent,
  retuneDropsNotes,
  type Action,
} from '../core/edit.ts'
import { keyToAction } from '../core/keymap.ts'
import { TUNINGS, type EditorState } from '../core/model.ts'
import { cellText } from '../core/render.ts'
import { Toggle } from './Toggle.tsx'

type Props = {
  readonly state: EditorState
  readonly dispatch: Dispatch<Action>
  readonly onShowKeys: () => void
}

export function TabGrid({ state, dispatch, onShowKeys }: Props) {
  const { cursor } = state
  const score = state.song.tab
  const staff = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
  const chordFields = useRef<Record<string, HTMLInputElement | null>>({})
  const titleFields = useRef<Record<number, HTMLInputElement | null>>({})
  const groups = useRef<Record<number, HTMLDivElement | null>>({})
  const [drag, setDrag] = useState<{ readonly from: number; readonly to: number } | null>(
    null,
  )

  /**
   * Where a row dropped at this height lands: past every other row whose middle
   * is above the pointer. The same index moveRow takes, since it counts the
   * rows with the moved one already lifted out.
   */
  const dropIndex = (from: number, y: number): number =>
    score.rows.filter((_, index) => {
      const node = groups.current[index]
      if (index === from || node == null) return false
      const box = node.getBoundingClientRect()
      return box.top + box.height / 2 < y
    }).length

  // The row a drop would land next to, and on which side, so the line is drawn
  // where the row will actually go.
  const dropMark = (rowIndex: number): string => {
    if (drag === null || drag.to === drag.from) return ''
    if (rowIndex === drag.from) return ' lifted'
    if (rowIndex !== drag.to) return ''
    return drag.to > drag.from ? ' drop-below' : ' drop-above'
  }

  useEffect(() => {
    staff.current?.focus()
  }, [])

  // A row wider than the window scrolls (§1), so the cell being edited has to
  // drag the view along with it or you type into something you cannot see.
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cursor])

  const lowestString = score.tuning.strings.length - 1

  // Vertically a row reads heading, strings, chord fields, and rows stack, so
  // stepping off either end of that lands in the neighbouring row.
  const enterRow = (row: number) => {
    if (cursor.row !== row) {
      dispatch({ kind: 'setCursor', cursor: { row, bar: 0, column: 0, slot: 0 } })
    }
    staff.current?.focus()
  }

  // The staff's keydown handler would read a chord name as a keymap sequence,
  // so the field keeps every key it is given. The arrows are the way out.
  const onChordKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    at: { readonly row: number; readonly bar: number; readonly column: number },
  ) => {
    event.stopPropagation()
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      dispatch({ kind: 'setCursor', cursor: { ...at, slot: lowestString } })
      staff.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      titleFields.current[at.row + 1]?.focus()
    }
  }

  // Same reason as the chord field: these are text, not keymap sequences.
  const onHeadingKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      enterRow(row)
      return
    }
    if (event.key === 'ArrowUp' && row > 0) {
      event.preventDefault()
      chordFields.current[`${row - 1}:0:0`]?.focus()
    }
  }

  const selectTuning = (name: string) => {
    const tuning = TUNINGS.find((candidate) => candidate.name === name)
    if (tuning === undefined) return
    const dropped = score.tuning.strings.length - tuning.strings.length
    if (
      retuneDropsNotes(score, tuning) &&
      !window.confirm(
        `Switching to ${tuning.name} drops the top ${dropped} string${
          dropped === 1 ? '' : 's'
        }, and the notes on them. This cannot be undone. Continue?`,
      )
    ) {
      return
    }
    dispatch({ kind: 'retune', tuning })
  }

  const confirmed = (action: Action): boolean => {
    if (action.kind === 'removeBar' && removeBarDropsContent(score, cursor)) {
      return window.confirm(
        `Delete bar ${cursor.bar + 1} and everything in it? This cannot be undone.`,
      )
    }
    if (action.kind === 'removeRow' && removeRowDropsContent(score, cursor.row)) {
      return window.confirm(
        `Delete row ${cursor.row + 1} and everything in it? This cannot be undone.`,
      )
    }
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '?') {
      event.preventDefault()
      onShowKeys()
      return
    }
    const action = keyToAction(event)
    if (action === null) return
    // Tab off either end of the score is not a bar step, so it is left to the
    // browser and focus leaves the tab instead of being trapped here.
    if (
      action.kind === 'move' &&
      ((action.move === 'prevBar' && atFirstBar(score, cursor)) ||
        (action.move === 'nextBar' && atLastBar(score, cursor)))
    ) {
      return
    }
    event.preventDefault()
    // The chord field is the row under the lowest string, so that is where a
    // further step down goes. It carries no cursor: the cursor stays put and
    // ArrowUp comes back to it.
    if (
      action.kind === 'move' &&
      action.move === 'stringDown' &&
      cursor.slot === lowestString
    ) {
      chordFields.current[`${cursor.row}:${cursor.bar}:${cursor.column}`]?.focus()
      return
    }
    if (action.kind === 'move' && action.move === 'stringUp' && cursor.slot === 0) {
      titleFields.current[cursor.row]?.focus()
      return
    }
    if (!confirmed(action)) return
    dispatch(action)
  }

  return (
    <section className="tab">
      <div className="tab-strip">
        <h2>Tab</h2>
        <span className="select">
          <select
            aria-label="Tuning"
            value={score.tuning.name}
            onChange={(event) => selectTuning(event.target.value)}
          >
            {TUNINGS.map((tuning) => (
              <option key={tuning.name} value={tuning.name}>
                {tuning.name}
              </option>
            ))}
          </select>
        </span>
        <Toggle
          small
          label="Where the tab goes"
          options={[
            { value: 'before', label: 'Before chart' },
            { value: 'after', label: 'After chart' },
          ]}
          value={state.song.tabFirst ? 'before' : 'after'}
          onChange={(place) =>
            dispatch({ kind: 'setTabFirst', tabFirst: place === 'before' })
          }
        />
      </div>
      <div ref={staff} className="staff" tabIndex={0} onKeyDown={onKeyDown}>
        {score.rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            ref={(node) => {
              groups.current[rowIndex] = node
            }}
            className={`row-group${dropMark(rowIndex)}`}
          >
            <div className="row-head">
              {score.rows.length > 1 && (
                <button
                  type="button"
                  className="row-grip"
                  title="Drag to move this row"
                  aria-label={`Move row ${rowIndex + 1}`}
                  // Pointer events rather than HTML drag and drop, which a
                  // phone does not do. Default prevented so pressing the grip
                  // leaves focus on the staff instead of moving it here.
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setDrag({ from: rowIndex, to: rowIndex })
                  }}
                  // Capture, not the drag state, says whether this grip is
                  // being dragged: a quick flick can move and let go before
                  // the render that would have set it.
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                    setDrag({ from: rowIndex, to: dropIndex(rowIndex, event.clientY) })
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      dispatch({
                        kind: 'moveRow',
                        index: rowIndex,
                        to: dropIndex(rowIndex, event.clientY),
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
                ref={(node) => {
                  titleFields.current[rowIndex] = node
                }}
                className="row-title"
                placeholder="Row title"
                value={row.title ?? ''}
                aria-label={`Title for row ${rowIndex + 1}`}
                onChange={(event) =>
                  dispatch({
                    kind: 'setRowHeading',
                    row: rowIndex,
                    title: event.target.value,
                    note: row.note ?? '',
                    aside: row.aside ?? '',
                  })
                }
                onKeyDown={(event) => onHeadingKeyDown(event, rowIndex)}
              />
              <input
                className="row-note"
                placeholder="Note"
                value={row.note ?? ''}
                aria-label={`Note for row ${rowIndex + 1}`}
                onChange={(event) =>
                  dispatch({
                    kind: 'setRowHeading',
                    row: rowIndex,
                    title: row.title ?? '',
                    note: event.target.value,
                    aside: row.aside ?? '',
                  })
                }
                onKeyDown={(event) => onHeadingKeyDown(event, rowIndex)}
              />
            </div>
            <div className="row">
              {row.bars.map((bar, barIndex) => (
                <div
                  key={barIndex}
                  className="bar"
                  style={{
                    gridTemplateColumns: `repeat(${bar.columns.length + 2}, auto)`,
                  }}
                >
                  {score.tuning.strings.map((label, slot) => (
                    <Fragment key={slot}>
                      <span className={barIndex === 0 ? 'label' : 'label repeated'}>
                        {label}
                      </span>
                      {bar.columns.map((column, columnIndex) => {
                        const isCursor =
                          cursor.row === rowIndex &&
                          cursor.bar === barIndex &&
                          cursor.column === columnIndex &&
                          cursor.slot === slot
                        return (
                          <div
                            key={columnIndex}
                            ref={isCursor ? current : null}
                            className={isCursor ? 'cell current' : 'cell'}
                            onClick={() =>
                              dispatch({
                                kind: 'setCursor',
                                cursor: {
                                  row: rowIndex,
                                  bar: barIndex,
                                  column: columnIndex,
                                  slot,
                                },
                              })
                            }
                          >
                            {cellText(column.cells[slot]) || ' '}
                          </div>
                        )
                      })}
                      <span className="barline">|</span>
                    </Fragment>
                  ))}
                  <span className={barIndex === 0 ? 'label' : 'label repeated'} />
                  {bar.columns.map((column, columnIndex) => {
                    const at = {
                      row: rowIndex,
                      bar: barIndex,
                      column: columnIndex,
                    }
                    return (
                      <input
                        key={columnIndex}
                        ref={(node) => {
                          chordFields.current[`${rowIndex}:${barIndex}:${columnIndex}`] =
                            node
                        }}
                        className="chord"
                        size={1}
                        value={column.chord ?? ''}
                        aria-label={`Chord for row ${rowIndex + 1}, bar ${
                          barIndex + 1
                        }, column ${columnIndex + 1}`}
                        onChange={(event) =>
                          dispatch({ kind: 'setChord', ...at, chord: event.target.value })
                        }
                        onKeyDown={(event) => onChordKeyDown(event, at)}
                      />
                    )
                  })}
                  <span className="barline" />
                </div>
              ))}
              <textarea
                className="row-aside"
                placeholder="Aside"
                spellCheck={false}
                rows={Math.max(1, (row.aside ?? '').split('\n').length)}
                value={row.aside ?? ''}
                aria-label={`Aside for row ${rowIndex + 1}`}
                onChange={(event) =>
                  dispatch({
                    kind: 'setRowHeading',
                    row: rowIndex,
                    title: row.title ?? '',
                    note: row.note ?? '',
                    aside: event.target.value,
                  })
                }
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
