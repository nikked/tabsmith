# tabsmith

A keyboard-driven web editor for guitar and bass tabs. The output is plain ASCII, copied
to the clipboard and pasted anywhere.

Single user, single document, no backend.

## Running it

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # vitest
pnpm build    # tsc -b && vite build
pnpm lint     # oxlint
```

## 1. Shape of the thing

Two modes, toggled in the header. Only one is on screen at a time — the ASCII is the thing you
leave with, not something you watch while typing.

- **Edit** — a grid of cells, one row per string × N columns, grouped into bars, and bars
  grouped into rows. Fixed-width boxes, current cell highlighted. This is *not* ASCII; it's a
  grid of boxes, so alignment is free. Below it sits the §4 keymap, because a keyboard-driven
  editor has to make its bindings discoverable without this document.
- **ASCII** — the rendered output, read-only, with a Copy button.

The header carries the tuning dropdown, a Clear button and the mode toggle.

Neither mode wraps. Rows are part of the document (§2), so how the tab is broken up is a
decision you make once and both modes obey: the same bars sit together in the grid and in the
ASCII. Nothing reflows when the window changes size, which is the point — a row you arranged
stays arranged.

The cost is that a row with more bars than the window is wide scrolls sideways. That is the
honest failure: the row really is that wide, and it will be that wide wherever it is pasted.
Wrapping it would hide the one thing you need to see.

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

type Column = {
  readonly cells: readonly (Cell | null)[]  // one entry per string, top to bottom
  readonly chord?: string                   // chord name, written under the column
}
type Bar = { readonly columns: readonly Column[] }
type Row = {
  readonly title?: string               // bracketed on render: [Main Riff]
  readonly note?: string                // written above the staff as typed
  readonly bars: readonly Bar[]
}

type Score = {
  readonly tuning: Tuning
  readonly rows: readonly Row[]
  readonly defaultBarColumns: number    // new bars start at this width; default 12
}

type Cursor = {
  readonly row: number
  readonly bar: number
  readonly column: number
  readonly slot: number
}

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
  hypothetical duration of 3 render identically (`7----`), so duration would be data that
  does no work.
- **Chords are free.** A column may hold a cell on every string at once; that is a chord, and
  it needs no representation of its own. Column width is the max across the whole column, so a
  chord stays aligned even when one of its notes carries a technique.
- **A chord name belongs to a column**, not to a bar or a beat: it is the annotation of the
  moment the column is. Absent and empty are the same thing, so an emptied field leaves no
  `chord` key behind and never reaches the ASCII.
- **Bars own their columns.** Default 12, add/remove per bar freely. Bars may have different
  widths; nothing forces them equal.
- **A row can be titled**, because a tab is usually several named parts rather than one long
  one. Vertically a row reads title, strings, chord fields, and rows stack, so `↑` and `↓` walk
  that whole column and step into the neighbouring row at either end. The title is bracketed on render; the note under it is written as typed, so it can be an
  aside, a tempo mark or a fingering hint rather than only a parenthetical. Both are absent when
  empty, the same as a chord name.
- **Rows own their bars**, and a row is a line of the finished tab. Nesting rather than a flag
  on `Bar` is what makes a bar in two rows, or in none, unconstructible — the same reason a
  column holds its own cells. A row holds at least one bar and a score at least one row, so
  removing the last bar of a row removes the row with it.
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
- `emptyScore` is Standard tuning, one row of two bars of `defaultBarColumns` columns, cursor at
  row 0 / bar 0 / column 0 / the top string. Two bars because one reads as a fragment, and the
  second is the cheapest way to show that bars are the unit you work in.

## 2b. Tunings

A tab is positional: a fret number means the same thing whatever the instrument is tuned to.
So a tuning is nothing but **the row labels and the row count** — it never touches note data.

Three presets, picked from a dropdown:

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

`retune` also moves `cursor.slot` by the same bottom-up offset it applies to the rows, then
clamps it into the new row count, so the cursor stays on the string it was on.

## 3. ASCII rendering

```
renderScore(score) => string
```

**Cell text** — `mute` → `x`; `fret` → `(link ?? '') + fret + decorationText(decoration)`; empty
→ `''`. `decorationText` is `''` when absent, `~` for vibrato, and `b` or `b${to}` for a bend.

**Column width** — `max(1, ...cellTexts.map(len))`, computed per column, plus one pad character
for every column but the last in its bar. The last needs none: the bar line already separates it
from whatever follows.

That one rule closes two ambiguities together. Digits in neighbouring columns can never touch, so
`2` then `2` reads `2-2` and never `22`, which is fret 22. And an empty column keeps a width of
its own, so a rest stays visible: `2 _ 2` renders `2---2` where `2 2` renders `2-2`, and a
trailing rest shows as `2--` against a bare `2`. Timing is carried by empty columns (§2), so those
pairs must not look alike. A separator added only where digits would otherwise collide is the
tempting cheaper rule, and it is wrong: that dash is indistinguishable from an empty column, which
makes the gap disappear.

Each cell is left-aligned and padded to its column width with `-`. This is what keeps multi-digit
frets and techniques aligned without a global width.

**The chord line** is one line under the staff per system, present only when that system has a
name on it. Each name is written at its column's offset. A name never widens a column — the
widths carry timing, and stretching the staff to fit `Cmaj7` would move notes apart that are not
apart — so a name longer than its column runs on into the space after it, and a following name is
pushed right just far enough to keep one space between the two. That is the only case where a
name loses its column, and it is preferable to truncating it.

**A bar row** is its columns concatenated, followed by `|`. **A line** is the tuning label
padded to the width of the longest label, `|`, then the bars. One line per string, labelled
from `tuning.strings`.

**A row's heading** is up to two lines above the staff, at the left margin rather than indented
to it: they title the whole row, not any string in it. `[title]` then the note verbatim, either
one on its own, and nothing at all when the row has neither.

**Systems** — one per `Row`, in order, separated by a blank line. There is no packing and no
maximum width: the document says which bars share a line, so rendering has nothing left to
decide. A greedy packer would have to overrule that arrangement to honour a width, and the
arrangement is the part you actually care about.

Worked example — bar of 8 columns, `7` on G, hammer to `9`, then `12` on B with vibrato:

```
e|------------------|
B|-----------12~----|
G|7-h9--------------|
D|------------------|
A|------------------|
E|------------------|
```

Counting columns from 0: column 1 is 3 wide (`h9` and its pad), column 5 is 4 (`12~`), column 7
is 1 because it is last and empty, and the rest are 2 — so the bar is `2+3+2+2+2+4+2+1 = 18`
characters wide. Every string line is that same length.

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
| `←` `→` | Previous / next column, crossing bar and row boundaries |
| `↑` `↓` | String up / down. Above the top string is the row's title, below the lowest is the column's chord field, and stepping off either of those again moves to the neighbouring row. |
| `Space` | Next column, identical to `→` |
| `Home` `End` | First / last column of the current bar |
| `Tab` `Shift+Tab` | Next / previous bar, crossing rows |
| `Enter` | Append a bar after the current one and move into it |
| `Shift+Enter` | Remove the current bar. Confirms first when it holds anything; never removes the only bar. |
| `]` `[` | Add a column to the current bar / remove the last one (only when empty, never below 1) |
| `}` `{` | Start a new row below with one bar in it and move into it / remove the current row. Confirms when it holds anything, its heading included; never removes the only row. |

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

Clicking a grid cell sets the cursor. Under each column sits a text field for its chord name,
reached by `↓` from the lowest string or by clicking it, and left by `Enter`, `Escape` or `↑`.
Those are the only mouse interactions: no drag, no selection.

The field holds *focus*, not the cursor. It is a DOM concern and stays one: `Cursor` keeps
meaning a cell, the reducer never has to describe a position that holds no note, and the cursor
sits waiting on the lowest string for the `↑` that comes back to it. The field also stops its
keys from reaching the staff, which would otherwise read a chord name as a keymap sequence —
`Am` is a mute and a no-op link.

A chord name is free text. Nothing parses or validates it, because a tab is positional (§2b) and
the name is a note to the reader, not data the editor acts on.

Removing a bar is gated the way a narrowing retune is (§2b): `removeBarDropsContent` is pure and
lives in `core/`, and the UI confirms before dispatching when it returns true. Losing a bar of
notes is unrecoverable for the same reasons — no undo (§6), and §5 autosaves immediately.

```ts
removeBarDropsContent(score, { row, bar }) => boolean   // true only when the removal really happens
removeRowDropsContent(score, row) => boolean            // same, for a whole row, heading included, heading included
```

Clear is gated the same way. It resets the document to `emptyScore` — notes, chord names and
bars all go — but keeps the current tuning, because the tuning is which instrument you are
holding, not something you wrote. `scoreHasContent` decides whether to ask; empty bars are not
work, so a score that holds no note, no chord name and no row heading is cleared without a
prompt.

```ts
scoreHasContent(score) => boolean   // any note, mute, chord name or row heading
```

All three answer the same question — _is there work here?_ — from one definition, so the Clear
prompt and the delete prompts cannot drift apart about whether a chord name or a row heading
is worth asking about. Both `removeBar`/`removeRow` predicates fold in their last-one guard
deliberately, so the UI cannot prompt about a removal the reducer is going to refuse. `removeBarDropsContent` counts bars across the whole score, not within
the row: the last bar of a row is removable — the row goes with it — while the last bar of the
score is not.

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

## 6. Deliberately absent

Named here so they don't creep in: undo/redo, custom tunings beyond the three presets, capo,
multiple documents, import or parsing of existing ASCII, rhythm and time signatures, playback,
annotation lines above the staff, printing, sharing.

The immutable model makes undo/redo a history array if it turns out to be missed.

## 7. Stack

- Vite + React + TypeScript, `strict` on, no `any`.
- Vitest for the core. No React Testing Library; the UI is verified by running it.
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
    Shortcuts.tsx the §4 keymap as a list
  storage.ts      load/save
```

`core/` has no React import and no I/O.

## 9. Open questions

- **Keymap.** `[` / `]` for columns and `Enter` for a new bar are guesses. Worth retuning once
  it's under your fingers.
- **Row width.** Nothing warns when a row is too wide for the 80 columns a forum post tends to
  want. The editor scrolling sideways is the only hint.
