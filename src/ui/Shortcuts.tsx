import { Fragment } from 'react'

type Shortcut = {
  readonly keys: readonly string[]
  readonly does: string
}

const SHORTCUTS: readonly Shortcut[] = [
  {
    keys: ['0–9'],
    does: 'Set the fret. A second digit appends while the result stays within 24.',
  },
  { keys: ['x'], does: 'Mute the string' },
  { keys: ['h', 'p', '/', '\\'], does: 'Link the note to the one before it' },
  { keys: ['b'], does: 'Bend. Digits typed next set the target, not the fret.' },
  { keys: ['~'], does: 'Vibrato' },
  { keys: ['Backspace', 'Delete'], does: 'Clear the cell' },
  { keys: ['←', '→'], does: 'Previous / next column, crossing bars' },
  { keys: ['↑', '↓'], does: 'String up / down' },
  { keys: ['Space'], does: 'Next column' },
  { keys: ['Home', 'End'], does: 'First / last column of the bar' },
  { keys: ['Tab', 'Shift+Tab'], does: 'Next / previous bar' },
  { keys: ['Enter'], does: 'Add a bar after this one' },
  {
    keys: ['Shift+Enter'],
    does: 'Remove this bar. Asks first when it holds notes.',
  },
  { keys: [']', '['], does: 'Add a column / remove the last empty one' },
  { keys: ['Click'], does: 'Move the cursor to a cell' },
]

export function Shortcuts() {
  return (
    <section className="shortcuts">
      <h2>Keys</h2>
      <dl>
        {SHORTCUTS.map(({ keys, does }) => (
          <Fragment key={keys.join(' ')}>
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{does}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  )
}
