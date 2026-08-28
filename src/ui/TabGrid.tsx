import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
} from 'react'
import { removeBarDropsNotes, type Action } from '../core/edit.ts'
import { keyToAction } from '../core/keymap.ts'
import type { EditorState } from '../core/model.ts'
import { cellText } from '../core/render.ts'

type Props = {
  readonly state: EditorState
  readonly dispatch: Dispatch<Action>
}

export function TabGrid({ state, dispatch }: Props) {
  const { score, cursor } = state
  const staff = useRef<HTMLDivElement>(null)
  const bars = useRef<(HTMLDivElement | null)[]>([])
  const [startsRow, setStartsRow] = useState<readonly boolean[]>([])

  useEffect(() => {
    staff.current?.focus()
  }, [])

  // Labels belong once per visual row, but only the browser knows where the
  // bars wrapped. Every bar keeps its label gutter and the repeats are hidden
  // rather than removed, so measuring can never change what it measures.
  const measure = useCallback(() => {
    const tops = bars.current
      .slice(0, score.bars.length)
      .map((bar) => bar?.offsetTop ?? 0)
    const next = tops.map((top, index) => index === 0 || top !== tops[index - 1])
    setStartsRow((previous) =>
      previous.length === next.length &&
      previous.every((value, index) => value === next[index])
        ? previous
        : next,
    )
  }, [score.bars.length])

  useLayoutEffect(measure)

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = keyToAction(event)
    if (action === null) return
    event.preventDefault()
    if (
      action.kind === 'removeBar' &&
      removeBarDropsNotes(score, cursor.bar) &&
      !window.confirm(
        `Delete bar ${cursor.bar + 1} and the notes in it? This cannot be undone.`,
      )
    ) {
      return
    }
    dispatch(action)
  }

  return (
    <div ref={staff} className="staff" tabIndex={0} onKeyDown={onKeyDown}>
      {score.bars.map((bar, barIndex) => (
        <div
          key={barIndex}
          ref={(node) => {
            bars.current[barIndex] = node
          }}
          className="bar"
          style={{
            gridTemplateColumns: `repeat(${bar.columns.length + 2}, auto)`,
          }}
        >
          {score.tuning.strings.map((label, slot) => (
            <Fragment key={slot}>
              <span
                className={
                  startsRow[barIndex] === false ? 'label repeated' : 'label'
                }
              >
                {label}
              </span>
              {bar.columns.map((column, columnIndex) => {
                const current =
                  cursor.bar === barIndex &&
                  cursor.column === columnIndex &&
                  cursor.slot === slot
                return (
                  <div
                    key={columnIndex}
                    className={current ? 'cell current' : 'cell'}
                    onClick={() =>
                      dispatch({
                        kind: 'setCursor',
                        cursor: { bar: barIndex, column: columnIndex, slot },
                      })
                    }
                  >
                    {cellText(column[slot]) || ' '}
                  </div>
                )
              })}
              <span className="barline">|</span>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  )
}
