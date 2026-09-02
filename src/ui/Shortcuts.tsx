import { Fragment, type RefObject } from 'react'

type Shortcut = {
  readonly keys: readonly string[]
  readonly does: string
  /** Shown in the panel as well as the guide: the ones you cannot guess. */
  readonly essential?: boolean
}

type Group = {
  readonly title: string
  readonly shortcuts: readonly Shortcut[]
}

const GROUPS: readonly Group[] = [
  {
    title: 'Moving around',
    shortcuts: [
      {
        keys: ['←', '→', '↑', '↓'],
        does: 'Move the cursor, and out into the row title above or the chord fields below',
      },
      {
        keys: ['Tab', 'Shift+Tab'],
        does: 'Next / previous bar. At either end, focus leaves the tab.',
        essential: true,
      },
      { keys: ['Click'], does: 'Move the cursor to a cell' },
    ],
  },
  {
    title: 'Writing notes',
    shortcuts: [
      {
        keys: ['0–9'],
        does: 'Set the fret. A second digit appends while the result stays within 24.',
      },
      { keys: ['Backspace', 'Delete'], does: 'Clear the cell' },
      { keys: ['x'], does: 'Mute the string' },
    ],
  },
  {
    title: 'Technique',
    shortcuts: [
      { keys: ['h', 'p', '/', '\\'], does: 'Link the note to the one before it' },
      { keys: ['b'], does: 'Bend. Digits typed next set the target, not the fret.' },
      { keys: ['~'], does: 'Vibrato' },
    ],
  },
  {
    title: 'Bars, columns and rows',
    shortcuts: [
      {
        keys: ['Enter', 'Shift+Enter'],
        does: 'Add a bar after this one / remove this bar. Asks when it holds anything.',
        essential: true,
      },
      {
        keys: [']', '['],
        does: 'Add a column / remove the last empty one',
        essential: true,
      },
      {
        keys: ['}', '{'],
        does: 'Start a new row below / remove this row. Asks when it holds anything.',
        essential: true,
      },
    ],
  },
]

const ESSENTIALS: readonly Shortcut[] = GROUPS.flatMap((group) =>
  group.shortcuts.filter((shortcut) => shortcut.essential === true),
)

function Keys({ keys }: { readonly keys: readonly string[] }) {
  return (
    <dt>
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </dt>
  )
}

function List({ shortcuts }: { readonly shortcuts: readonly Shortcut[] }) {
  return (
    <dl>
      {shortcuts.map(({ keys, does }) => (
        <Fragment key={keys.join(' ')}>
          <Keys keys={keys} />
          <dd>{does}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

type Props = {
  readonly guide: RefObject<HTMLDialogElement | null>
  readonly onShowKeys: () => void
}

/**
 * The panel carries only the keys you would not guess; everything else lives in
 * the guide, because a list long enough to hold it all is one nobody reads.
 *
 * <dialog> is native, so Escape, the backdrop and the focus trap are the
 * browser's. Whether it is open is the element's own business and is not
 * mirrored in React state: two copies of one fact drift the moment the browser
 * closes it without asking.
 */
export function Shortcuts({ guide, onShowKeys }: Props) {
  return (
    <section className="shortcuts">
      <h2>Keys</h2>
      <List shortcuts={ESSENTIALS} />
      <button type="button" onClick={onShowKeys}>
        All keys <kbd>?</kbd>
      </button>

      <dialog ref={guide} className="guide">
        <h2>Keys</h2>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <List shortcuts={group.shortcuts} />
          </section>
        ))}
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </section>
  )
}
