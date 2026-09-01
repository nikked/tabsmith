import {
  Fragment,
  useEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent,
} from 'react'
import {
  atFirstBar,
  atLastBar,
  removeBarDropsContent,
  removeRowDropsContent,
  type Action,
} from '../core/edit.ts'
import { keyToAction } from '../core/keymap.ts'
import type { EditorState } from '../core/model.ts'
import { cellText } from '../core/render.ts'

type Props = {
  readonly state: EditorState
  readonly dispatch: Dispatch<Action>
}

export function TabGrid({ state, dispatch }: Props) {
  const { cursor } = state
  const score = state.song.tab
  const staff = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
  const chordFields = useRef<Record<string, HTMLInputElement | null>>({})
  const titleFields = useRef<Record<number, HTMLInputElement | null>>({})

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
  // so the field keeps its keys and hands focus back on the way out.
  const onChordKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    at: { readonly row: number; readonly bar: number; readonly column: number },
  ) => {
    event.stopPropagation()
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      staff.current?.focus()
      return
    }
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
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      staff.current?.focus()
      return
    }
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
    <div ref={staff} className="staff" tabIndex={0} onKeyDown={onKeyDown}>
      {score.rows.map((row, rowIndex) => (
        <div key={rowIndex} className="row-group">
          <div className="row-head">
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
                        chordFields.current[
                          `${rowIndex}:${barIndex}:${columnIndex}`
                        ] = node
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
          </div>
        </div>
      ))}
    </div>
  )
}
