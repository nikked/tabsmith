# tabsmith — spec

A keyboard-driven web editor for guitar and bass tabs. The output is plain ASCII, copied
to the clipboard and pasted anywhere.

Single user, single document, no backend.

## 1. Shape of the thing

Two panes:

- **Editor** — a grid of cells, one row per string × N columns, grouped into bars. Fixed-width
  boxes, current cell highlighted. This is *not* ASCII; it's a grid of boxes, so alignment is
  free.
- **Output** — the rendered ASCII, read-only, with a Copy button.

The ASCII is a pure function of the document. It is never edited directly and never parsed
back. That's the single most important constraint in the design: alignment cannot break,
because alignment is derived.

## 2. Data model

```ts
type Fret = number                    // 0..24

type Link = 'h' | 'p' | '/' | '\\'    // how this note is reached from the previous one
type Decoration =                     // applied to this note
  | { kind: 'b'; to?: Fret }          // 7b, or 7b9 once the target is set
  | { kind: '~' }

type Cell =
  | { kind: 'fret'; fret: Fret; link?: Link; decoration?: Decoration }
  | { kind: 'mute' }                  // renders as 'x'

type Tuning = {
  readonly name: string
  readonly strings: readonly string[]   // row labels, top to bottom
}

type Column = readonly (Cell | null)[]  // one entry per string, top to bottom
type Bar = { readonly columns: readonly Column[] }

type Score = {
  readonly tuning: Tuning
  readonly bars: readonly Bar[]
  readonly defaultBarColumns: number    // new bars start at this width; default 8
}

type Cursor = { readonly bar: number; readonly column: number; readonly slot: number }

type EditorState = {
  readonly score: Score
  readonly cursor: Cursor
  readonly digitPending: boolean        // next digit appends to the current value vs replaces
  readonly digitTarget: 'fret' | 'bend' // which value the next digit edits
}
```

Notes on the model:

- **No note duration.** A note occupies exactly one column. A "long" note is you leaving
  columns empty before the next one. `7` followed by two empty columns and `7` with a
  hypothetical duration of 3 render identically (`7--`), so duration would be data that does
  no work.
- **Chords are free.** A column may hold a cell on every string at once; that is a chord, and
  it needs no representation of its own. Column width is the max across the whole column, so a
  chord stays aligned even when one of its notes carries a technique.
- **Bars own their columns.** Default 8, add/remove per bar freely. Bars may have different
  widths; nothing forces them equal.
- `Link` is a *prefix* on the note it belongs to (`h9` reads "hammered to 9"), `Decoration` a
  suffix (`7~`). The union makes `{ kind: 'mute' }` structurally unable to carry either.
- **A bend's target is optional.** `{ kind: 'b' }` renders `7b`, `{ kind: 'b', to: 9 }` renders
  `7b9`. So `b` is useful on its own keystroke and the target is something you add, never an
  invalid half-typed state. Nothing requires `to > fret`; a nonsensical target is your problem,
  not the model's.
- `tuning` lives on the score so `render` is a pure function of the score alone.
- `Fret`'s `0..24` bound is enforced in `keymap.ts`, at the edge: a digit that would take the
  cell out of range replaces instead of appending (§4), and a single digit is always in range,
  so an out-of-range fret is unconstructible. The type stays a plain `number`.
- `emptyScore` is Standard tuning, one bar of `defaultBarColumns` columns, cursor at bar 0 /
  column 0 / the top string.

## 2b. Tunings

A tab is positional: a fret number means the same thing whatever the instrument is tuned to.
So a tuning is nothing but **the row labels and the row count** — it never touches note data.

v1 ships three presets, picked from a dropdown:

```ts
const TUNINGS = [
  { name: 'Standard', strings: ['e', 'B', 'G', 'D', 'A', 'E'] },
  { name: 'Drop D',   strings: ['e', 'B', 'G', 'D', 'A', 'D'] },
  { name: 'Bass',     strings: ['G', 'D', 'A', 'E'] },
] as const satisfies readonly Tuning[]
```

The selected tuning is stored on the score (the whole object, not an index into this list) so a
saved document survives edits to the preset list.

### Switching tuning

A column has exactly one cell per string, so a grid row index *is* the index into the column —
one index space, no translation anywhere.

Between two tunings of the same string count (Standard ↔ Drop D) retuning is a pure relabel:
note data is untouched and the ASCII is identical apart from the row labels.

Across a different string count, rows are matched **bottom-up**, because guitar and bass share
their low string: guitar's `G D A E` rows are exactly bass's four. Narrowing drops the top rows;
widening prepends empty ones.

```ts
retune(score, tuning) => Score                 // total; drops or prepends rows bottom-up
retuneDropsNotes(score, tuning) => boolean     // true if any dropped row holds a cell
```

Both are pure and live in `core/`. Dropping notes is unrecoverable — there is no undo (§6) and
§5 autosaves immediately — so the UI calls `retuneDropsNotes` first and confirms before
dispatching `retune`. It never asks when nothing would be lost, which is every same-width
switch and every switch on an empty document.

`retune` also clamps `cursor.slot` into the new row count.

## 3. ASCII rendering

```
renderScore(score, opts?: { maxWidth?: number }) => string
```

**Cell text** — `mute` → `x`; `fret` → `(link ?? '') + fret + decorationText(decoration)`; empty
→ `''`. `decorationText` is `''` when absent, `~` for vibrato, and `b` or `b${to}` for a bend.

**Column width** — `max(1, ...cellTexts.map(len))`, computed per column. Each cell is left-aligned
and padded to that width with `-`. This is what keeps multi-digit frets and techniques aligned
without a global width.

**A bar row** is its columns concatenated, followed by `|`. **A line** is the tuning label
padded to the width of the longest label, `|`, then the bars. One line per string, labelled
from `tuning.strings`.

**Wrapping** — bars are greedily packed into systems up to `maxWidth` (default 80). `maxWidth`
is the width of the whole rendered line, label prefix included, so bars are packed into
`maxWidth - labelWidth` and no line ever exceeds it. A bar is never split; a bar too wide to fit
gets a system to itself. Systems are separated by a blank line.

Worked example — bar of 8 columns, `7` on G, hammer to `9`, then `12` on B with vibrato:

```
e|-----------|
B|------12~--|
G|7h9--------|
D|-----------|
A|-----------|
E|-----------|
```

Counting columns from 0: column 1 is 2 wide (`h9`), column 5 is 3 wide (`12~`), the other six
are 1, so the bar is `1+2+1+1+1+3+1+1 = 11` characters wide. Every string line is that same
length.

## 4. Keymap

Editing is a pure reducer over `EditorState`; the DOM only dispatches.

| Key | Action |
| --- | --- |
| `0`–`9` | Set fret. A second digit at the same cell appends when the result is ≤ 24, otherwise replaces. |
| `x` | Mute |
| `h` `p` `/` `\` | Set the link on the current note |
| `b` | Bend the current note. Digits typed next set the bend target, not the fret. |
| `~` | Vibrato on the current note |
| `Backspace` `Delete` | Clear the cell. Neither moves the cursor. |
| `←` `→` | Previous / next column, crossing bar boundaries |
| `↑` `↓` | String up / down, clamped to the string count |
| `Space` | Next column, identical to `→` |
| `Home` `End` | First / last column of the current bar |
| `Tab` `Shift+Tab` | Next / previous bar |
| `Enter` | Append a bar after the current one and move into it |
| `]` `[` | Add a column to the current bar / remove the last one (only when empty, never below 1) |

No timing is involved: `digitPending` is cleared by actions, never by elapsed time, so `1` `0`
on one cell is fret 10 however long you take between the two keys. A timeout would put a clock
inside `apply` and cost it its purity for nothing.

Any action other than a digit clears `digitPending`. `digitTarget` is `'bend'` only immediately
after a `b` that landed on a fret cell, and `'fret'` in every other case — including a `b` that
no-opped. So `7` `b` `9` gives `7b9`, while `7` `b` `→` `9` gives `7b` and a `9` in the next
column.

A link or decoration key on a cell that holds no fret — empty or muted — is a no-op: the reducer
returns the state unchanged. Modifiers are always typed after the fret, so `9` then `h` gives
`h9`.

Clicking a grid cell sets the cursor. That is the only mouse interaction: no drag, no selection.

```ts
keyToAction(e: KeyboardEvent): Action | null   // pure
apply(state: EditorState, action: Action): EditorState   // pure
```

## 5. Persistence

`localStorage`, one document, autosaved on change and loaded on mount. Serialization is
`JSON.stringify` of the `Score` plus a schema version integer; an unreadable or
version-mismatched blob is discarded in favour of an empty score. It is the app's only
persistence I/O and lives in one module; the Copy button's clipboard write is the only other
side effect, and it lives in `Output.tsx`.

## 6. Out of scope for v1

Named here so they don't creep in: undo/redo, custom tunings beyond the three presets, capo,
multiple documents,
import or parsing of existing ASCII, rhythm and time signatures, playback, chord names and
annotation lines above the staff, printing, sharing.

The immutable model makes undo/redo a history array later if it turns out to be missed.

## 7. Stack

- Vite + React + TypeScript, `strict` on, no `any`.
- Vitest for the core. No React Testing Library unless the UI tests earn it.
- Plain CSS, one stylesheet. No UI framework, no styling library.
- No runtime dependencies beyond React.

## 8. Layout

```
src/
  core/
    model.ts      types, emptyScore, emptyBar, emptyColumn
    edit.ts       Action, apply — every state transition
    keymap.ts     keyToAction
    render.ts     renderScore and its helpers
  ui/
    App.tsx
    TabGrid.tsx   grid of cells, cursor, keydown and click -> dispatch
    Output.tsx    <pre> of ASCII + copy
  storage.ts      load/save
```

`core/` has no React import and no I/O.

## 9. Build plan

1. **Scaffold** — Vite React-TS, strict tsconfig, Vitest wired.
   *Verify:* `npm run dev` serves a blank page, `npm test` runs.
2. **Model + render** — `model.ts`, `render.ts`.
   *Verify:* unit tests on fixtures — empty score, multi-digit alignment, link/decoration
   widths, a bend with and without a target, a chord column with a technique on one of its
   notes, bar packing at a width boundary with the label width counted in, an over-wide bar, a
   4-string bass score.
3. **Edit + keymap** — `edit.ts`, `keymap.ts`.
   *Verify:* unit tests per transition (`1` `0` appending to 10, `2` `5` replacing to 5 because
   25 is out of range, digits after `b` filling the
   bend target rather than the fret and `digitTarget` resetting on any other action, cursor
   clamping at score edges,
   `removeColumn` refusing a non-empty column and refusing to go below 1, a link or decoration
   key no-opping on an empty and on a muted cell, `retune` relabelling without touching notes at
   equal width and dropping bottom-up when narrower, `retuneDropsNotes` agreeing with what
   `retune` actually drops) plus two integration tests: a key sequence for a real riff applied
   to an empty score asserted against expected ASCII, and a Standard → Drop D switch rendering
   identical output apart from the low row's label.
4. **UI** — grid, cursor, tuning dropdown with the retune confirm, output pane, copy button.
   *Verify:* run it, type a riff, paste it into a text file and eyeball it; switch to Bass with a
   note on the top two strings and get the confirm, cancel it and keep the notes.
5. **Persistence** — `storage.ts` + autosave.
   *Verify:* type, refresh, still there; corrupt the blob by hand, get an empty score.

## 10. Open questions

- **Keymap.** `[` / `]` for columns and `Enter` for a new bar are guesses. Worth retuning once
  it's under your fingers.
- **Default line width.** 80 assumed.
