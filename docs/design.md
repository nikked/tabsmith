# tabsmith — design

Why the app is shaped the way it is: the document model, how the ASCII is derived from it, what
is stored and how old files are read, and what has been left out on purpose.

The section numbers here are stable. Comments in the code refer to them as `§1`, `§2` and so on,
so renumbering a section means fixing those references too.

## 1. Shape of the thing

Two modes, toggled in the header. Only one is on screen at a time — the ASCII is the thing you
leave with, not something you watch while typing.

- **Edit** — a grid of cells, one row per string × N columns, grouped into bars, and bars
  grouped into rows. Fixed-width boxes, current cell highlighted. This is _not_ ASCII; it's a
  grid of boxes, so alignment is free. Under it runs a quiet legend of the four §4 bindings you
  could not guess, because a keyboard-driven editor has to be discoverable without this
  document; the rest are a keypress away in a dialog rather than taking up permanent room.
- **ASCII** — the rendered song, read-only, with Copy and Print buttons.

Edit mode always shows the chart first and the tab below it, whatever the placement control
says. Where the tab goes is a question about the finished page, not about editing, and moving
the thing you are working on to answer it would be a strange way to ask. The chart is the part
you read on stage; the tab is there for the parts you have to look up.

The header carries the logo, **Songs**, **Practice** (§4b) and the mode toggle. Everything that
acts on a whole song is behind Songs (§5) rather than here. Nothing in it is loud except the mode
toggle, which is the one control you reach for constantly.

Demo loads a song already written, because the fastest way to say what the app does is to show
one. It joins the shelf rather than replacing what is open, so it needs no confirmation — and
it is the song a first visit's shelf starts with, since an empty editor and nothing saved to
restore says nothing about what any of this is for.

That song is `src/demo.json`, a file in exactly the format Export writes (§5). To change the
demo, save a song out of the app and drop it in over that file: it is decoded on the way in
like any other, so an older one is migrated and a broken one reports itself instead of taking
the app down. It is in `.prettierignore` because its shape is `encode`'s rather than
prettier's, and a downloaded file would otherwise fail the format check.

Nothing in the app or its tests depends on which song that is — the tests assert the file
decodes, holds something and is titled `DEMO_TITLE`, and stop there, because a test that named
the notes would fail the first time the file was swapped. The title is the one thing a swapped-in
file has to keep: a song with that title never goes to the sheet (§5), so every new device's demo
does not add another copy there. Renaming it is how the demo becomes one of your songs.

The logo is a bar of tab: a bracketed bar with one lit cell, the editing cursor sitting where a
note would. It sits with the name in a single bordered chip so the app announces itself as one
object rather than as loose text in the header, and it stays at the volume of the
buttons beside it, because the song's title is the biggest thing on the page and the app's name
is not. The chip renders the favicon file itself, so the logo and the tab icon cannot drift
apart.

The editor is set like the page it prints rather than like a form. The song's title is the
largest thing on it, section names are headings, and the fields have no boxes: an underline
appears under the pointer to say the text is editable and firms up on focus to say it is being
edited. What is machinery recedes — the tab's tuning and placement are a hairline caption, a
section's controls wait until it is hovered or focused, and the keymap is a muted legend at the
foot. A chord chart is prose and gets a measure to read at; the tab is as wide as its rows need
and scrolls, so the two deliberately do not line up.

Neither mode wraps. Rows are part of the document (§2), so how the tab is broken up is a
decision you make once and both modes obey: the same bars sit together in the grid and in the
ASCII. Nothing reflows when the window changes size, which is the point — a row you arranged
stays arranged.

The cost is that a row with more bars than the window is wide scrolls sideways. That is the
honest failure: the row really is that wide, and it will be that wide on the printed page too.
Wrapping it would hide the one thing you need to see. Nothing warns about width — the page is
as wide as you made it, and paper is the only thing that has an opinion.

The ASCII is a pure function of the document. It is never edited directly, and the editor
never reads it back. That's the single most important constraint in the design: alignment
cannot break, because alignment is derived. Paste (§3b) does parse ASCII, but only once, on the
way in, to make a new song out of text written somewhere else.

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
  readonly aside?: string               // hung off the closing bar line, one line per string
  readonly bars: readonly Bar[]
}

type Score = {
  readonly tuning: Tuning
  readonly rows: readonly Row[]
  readonly defaultBarColumns: number    // new bars start at this width; default 12
}

type Section = {
  readonly name: string                 // 'Verse 1'; renders as [Verse 1]
  readonly repeat?: number              // 4 renders as (x4)
  readonly body: string                 // chords, and lyrics under them, exactly as typed
}

type Song = {
  readonly title: string
  readonly tempo: string                // free text: '70 bpm', 'slow 6/8'
  readonly chart: readonly Section[]
  readonly tab: Score
  readonly tabFirst: boolean            // tab before the chart, or after it
}

type Cursor = {
  readonly row: number
  readonly bar: number
  readonly column: number
  readonly slot: number
}

type EditorState = {
  readonly song: Song
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
  aside, a tempo mark or a fingering hint rather than only a parenthetical. An aside is the
  third field and the only one that does not sit above the staff: `x2 for Intro` is an
  instruction for these bars rather than a name for them, so it hangs off the closing bar line
  where it was written on paper. All three are absent when empty, the same as a chord name.
- **Rows own their bars**, and a row is a line of the finished tab. Nesting rather than a flag
  on `Bar` is what makes a bar in two rows, or in none, unconstructible — the same reason a
  column holds its own cells. A row holds at least one bar and a score at least one row, so
  removing the last bar of a row removes the row with it. Rows are reordered the way sections
  are: `moveRow` lifts one out and puts it back at an index, dragged by the grip beside its
  title. The drag is pointer events rather than HTML drag and drop, which phones do not do, and
  the cursor stays in the row it was in wherever that row lands.
- `Link` is a _prefix_ on the note it belongs to (`h9` reads "hammered to 9"), `Decoration` a
  suffix (`7~`). The union makes `{ kind: 'mute' }` structurally unable to carry either.
- **A bend's target is optional.** `{ kind: 'b' }` renders `7b`, `{ kind: 'b', to: 9 }` renders
  `7b9`. So `b` is useful on its own keystroke and the target is something you add, never an
  invalid half-typed state. Nothing requires `to > fret`; a nonsensical target is your problem,
  not the model's.
- **A section body is free text, not a structure**, and may hold tabs as well as spaces. A
  chord sits above its word because of the
  spaces the writer typed, and nothing else knows which word that is. Parsing the body into
  chords and lyrics would let the app reflow or re-space it, which is exactly how the one thing
  holding the chart together gets destroyed. So the body is stored and rendered verbatim, and
  the editor shows it monospaced and never soft-wrapped.
- **The chart is an ordered list, and the order is editable.** A section is lifted out and put
  back down at an index rather than swapped with its neighbour, so `moveSection` says where a
  section ends up rather than which way it stepped. An index outside the chart is a no-op: the
  ends are where the buttons are disabled, and the reducer agrees rather than wrapping round.
- **A nameless section is a block of chords**, and renders with no empty brackets. A section
  with a name and no body renders as a bare heading — a `[Chorus 2]` that repeats an earlier
  one is worth marking even when there is nothing new to write under it.
- **The tab is an appendix, not part of the structure.** It sits before or after the whole
  chart, never inside a section: it is a memory aid for a riff, while the chart is what gets
  read while playing. `tabFirst` is the whole of that choice.
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

A column has exactly one cell per string, so a grid row index _is_ the index into the column —
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

Both are pure and live in `core/`. Undo (§2c) takes a narrowing retune back, but only until the
page is reloaded, and §5 autosaves immediately — so the UI calls `retuneDropsNotes` first and confirms before
dispatching `retune`. It never asks when nothing would be lost, which is every same-width
switch and every switch on an empty document.

`retune` also moves `cursor.slot` by the same bottom-up offset it applies to the rows, then
clamps it into the new row count, so the cursor stays on the string it was on.

## 2c. Undo

The model is immutable, so undo is a list of past states and nothing more: no inverse of each
action, no diffing, no journal. `Timeline` holds `past`, `present` and `future` of `EditorState`,
and `step` wraps `apply`.

- **A cursor move is not an edit.** `apply` returns the same `song` reference when nothing about
  the document changed, so `step` compares references and adds no history entry. An action the
  reducer refused — `{` on the only row — leaves nothing to undo back to either.
- **A run of keystrokes in one field is one step.** `typingIn` names the field an action writes
  to, and consecutive edits to the same name fold into the entry already on the stack. Without
  it, undoing a chord name would walk back through it a letter at a time.
- **A new edit drops the future.** A branch you cannot navigate back to is not worth carrying.
- **100 steps**, oldest dropped first, and none of it is persisted: undo is for the mistake you
  just made, not a version history. Which is why the destructive prompts (§4) stay.

The binding is on the window rather than the staff, because an edit can be made from a button as
easily as from a key. A focused `<input>` or `<textarea>` is left alone: the browser keeps its
own undo stack for what is typed there, and it is the finer of the two.

## 3. ASCII rendering

```
renderScore(score) => string
renderSystems(score) => readonly string[]
renderSong(song) => string
songBlocks(song) => readonly string[]
```

`songBlocks` is the song as the blocks a blank line separates — the header lines, each section,
and each system of the tab — and `renderSong` is those joined back up. The ASCII view renders
one element per block so a page break can fall between them: a staff split down the middle is
unreadable, and a single block of text gives the browser nowhere safe to break.

**A song** is its title, its tempo, each section, and the tab, joined by blank lines — the tab
first or last per `tabFirst`. A blank title or tempo contributes no line. Everything but the
tab is written out as typed; the chart is never reflowed, re-spaced or trimmed (§2).

The rest of this section is the tab.

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

**A row's aside** goes to the right of the staff instead, one of its lines per string from the
top down, separated from the closing bar line by a single space. Lines past the last string
carry on underneath in the same column, so a long aside is never silently truncated.

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

## 3b. Reading a pasted song

Every song you already know is somewhere on the internet as a chord sheet, and without a way in,
each one is a retype. **Paste…** takes a page in the shape Ultimate Guitar writes and makes a
`Song` of it. `core/parse.ts` is pure and has no idea where the text came from.

A line is classified before anything else happens:

- **A heading** is a whole line of `[Verse 1]`, with the `x3` some writers put beside it. A
  bracket in the middle of a lyric is a lyric.
- **A staff line** is an optional string name, a bar line, and then only the characters a tab is
  made of — with no spaces anywhere, which is what tells it from `| x2 |`. Text after a space
  following it is the row's aside, one line per string as the renderer hangs it.
- **A line straight under a staff** belongs to it by where it starts: past the closing bar line
  it carries on the aside, under the bars it is the chord names, which are always the system's
  last line. Anything else ends the system, a blank line included: systems are separated by
  blanks, and merging two would leave twelve lines matching no tuning.
- **Everything else is chart**, kept verbatim. The spaces are what hold a chord over its word
  (§2), so the importer is the last place that should be tidying them.

Six lines ending on `D` are Drop D, six are standard, four are a bass; anything else is skipped,
and a page mixing a guitar and a bass is refused outright rather than half-read.

Above a staff, a heading with nothing under it is the row's title, and a single line right above
it, after a heading or a blank, is the row's note; that is how `renderSystems` writes a row. Two
or more lines are a section's words. So `[Verse 1]`, one line of chords and a riff reads as a
row titled Verse 1 with the chords as its note: nothing is lost, it lands on the row.

Reading a bar is the inverse of `sizeColumns`: a column is as wide as its widest cell, and one
dash follows every column but the last. That makes our own output round-trip exactly — including
the distinction between an empty column and the gap between two notes, which is the one thing
the widths carry. Each chord name goes back on the column it starts under. One the renderer
pushed right off its column, because the name before it ran long, starts under no column and
goes to the first one after the previous name's; the rendered text does not say which it was.

Hand-written tab is not on that grid, though, and two rules settle what happens then. Each string
is scanned for its own notes first, because the digit inside `12` is a perfectly good note to a
scanner that does not know it is halfway through one. And a column never runs past a note another
string starts inside it: `12b14` on the top string must not swallow the `p0` underneath. **Where
spacing and notes disagree, the notes win** — a lost note is not recoverable, and a shifted one
is visible.

Pasting is for songs from elsewhere; a file or a link is still the way to move a song between
copies of tabsmith, because those carry everything exactly.

The parsed song goes through the same zod schema a file does before it is shelved. It is a
document this app assembled rather than read, and a bug in the parser should be caught at the
boundary a bad file is.

## 4. Keymap

This is the tab grid. The chart is ordinary text fields, and the browser's own editing is
already the right keymap for it — with one exception. `Tab` inside a section body types a tab
rather than moving focus, because a tab stop is how two blocks are made to start at the same
column and there is nothing else on the keyboard that does it. `Shift+Tab` still moves focus,
so the body never becomes a trap, and the character goes in through `execCommand` so the
browser keeps its own undo.

The tab width is stated in the stylesheet rather than left to the browser, and stated as the
width everything else defaults to, so a body holding tabs lines up the same in the editor, on
paper, and pasted into anything else.

Only the bindings you could not guess are on the page: the ones that add and remove bars,
columns and rows, and `Tab`, which does something other than move focus. Everything else lives
in a dialog behind `?` and the _All keys_ button, grouped into moving around, writing notes,
technique, and structure. A list long enough to hold all of it is a list nobody reads.

The dialog is a native `<dialog>`, so Escape, the backdrop and the focus trap are the browser's
rather than this app's. Whether it is open is the element's own business and is deliberately not
mirrored in React state — two copies of one fact drift the moment the browser closes it without
being asked.

Editing is a pure reducer over `EditorState`; the DOM only dispatches.

| Key                   | Action                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`–`9`               | Set fret. A second digit at the same cell appends when the result is ≤ 24, otherwise replaces.                                                                                 |
| `x`                   | Mute                                                                                                                                                                           |
| `h` `p` `/` `\`       | Set the link on the current note                                                                                                                                               |
| `b`                   | Bend the current note. Digits typed next set the bend target, not the fret.                                                                                                    |
| `~`                   | Vibrato on the current note                                                                                                                                                    |
| `Backspace` `Delete`  | Clear the cell. Neither moves the cursor.                                                                                                                                      |
| `←` `→`               | Previous / next column, crossing bar and row boundaries                                                                                                                        |
| `↑` `↓`               | String up / down. Above the top string is the row's title, below the lowest is the column's chord field, and stepping off either of those again moves to the neighbouring row. |
| `Tab` `Shift+Tab`     | Next / previous bar, crossing rows. At either end of the score the key goes back to the browser, so focus leaves the tab — `Shift+Tab` walks back to the chart above it.       |
| `Enter` `Shift+Enter` | Append a bar after the current one and move into it / remove the current bar. Confirms when it holds anything; never removes the only bar.                                     |
| `]` `[`               | Add a column after the current one and move into it / remove the current one (only when empty, never below 1)                                                                  |
| `}` `{`               | Start a new row below with one bar in it and move into it / remove the current row. Confirms when it holds anything, its heading included; never removes the only row.         |
| `?`                   | Open the full keymap                                                                                                                                                           |

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
reached by `↓` from the lowest string or by clicking it, and left by `↑` or `↓`.
Those are the only mouse interactions: no drag, no selection.

The field holds _focus_, not the cursor. It is a DOM concern and stays one: `Cursor` keeps
meaning a cell, the reducer never has to describe a position that holds no note, and the cursor
sits waiting on the lowest string for the `↑` that comes back to it. The field also stops its
keys from reaching the staff, which would otherwise read a chord name as a keymap sequence —
`Am` is a mute and a no-op link.

A chord name is free text. Nothing parses or validates it, because a tab is positional (§2b) and
the name is a note to the reader, not data the editor acts on.

Removing a bar is gated the way a narrowing retune is (§2b): `removeBarDropsContent` is pure and
lives in `core/`, and the UI confirms before dispatching when it returns true. Losing a bar of
notes is worth asking about for the same reasons — undo (§2c) does not survive a reload, and §5
autosaves immediately.

```ts
removeBarDropsContent(score, { row, bar }) => boolean   // true only when the removal really happens
removeRowDropsContent(score, row) => boolean            // same, for a whole row, heading included, heading included
```

Clear is gated the same way. It resets the document to `emptySong` — title, tempo, sections,
notes, chord names and bars all go — but keeps the current tuning, because the tuning is which
instrument you are holding, not something you wrote. `songHasContent` decides whether to ask;
empty bars and untouched headings are not work, so a song nothing has been typed into is
cleared without a prompt.

```ts
songHasContent(song) => boolean     // anything typed: title, tempo, chart or tab
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

## 4b. Practice mode

The editor and the ASCII view are two readings of the same page; **Practice** replaces it. It is
the whole window, the song at a size readable from a music stand, and nothing else: no header,
no keys, no chrome. That is why it is a plain button rather than a third segment beside Edit and
ASCII — you cannot see the header while you are in it, so there is no state for it to show.

It renders `songBlocks` the same way the ASCII view does, so there is no third rendering of a
song to keep in step. What it adds is a size control, `Escape` and Done to leave, and a screen
wake lock, which is the one thing paper on a stand does better than a screen. The lock is
re-taken on `visibilitychange`, because coming back from another app releases it. A browser that
refuses or lacks it is not worth a message — the page reads fine, it just dims.

## 5. Persistence

`localStorage`, autosaved on change and loaded on mount. `storage.ts` is the only module that
knows the format; `share.ts` reuses its `encode` and `decode` for links. The other side effects
are the clipboard writes — Copy in `Output.tsx`, Copy link in `App.tsx` — the save dialog,
Practice's screen wake lock, and the sync request in `sync.ts`, which also keeps its own
settings under `tabsmith.sync`.

Two documents live there, under two keys and two version counters:

- **A song** is what a _file_ holds, and `encode`/`decode` below define it. That format is
  untouched by the shelf, so every file this app has ever written still opens.
- **The shelf** lives under `tabsmith.library`: every song, in order, each with an id, plus
  which one is open. It carries its own version, because what a library is has nothing to do
  with what a song is — one counter across both would mean bumping the file format every time
  the shelf changed shape.

An id rather than a title is what identifies a song, so retitling one cannot lose track of which
is open. A library holds at least one song — `Songs` is `readonly [Entry, ...Entry[]]`, the same
way a score holds at least one row — and `open` always names one of them. `repair` is the only
way in from a decoded document and establishes both: a dangling `open` is repaired rather than
refused, because the songs in that document are still perfectly good.

Before there was a shelf there was one song under `tabsmith`. It becomes the first song on the
shelf, and the old key is left in place rather than deleted — nothing reads it any more, and
leaving it is the difference between a bad upgrade being annoying and being unrecoverable.

The document is `JSON.stringify` of the `Song` plus a schema version integer, indented — a file
you might open in an editor. A saved file is named after the title, slugged behind the app name
so a folder of them says what wrote them: _Endless Skies_ becomes `tabsmith-endless-skies.json`,
and an untitled song becomes `tabsmith.json`.

Export asks where to put the file. That is the File System Access API, which only Chromium
implements — Firefox and Safari have no equivalent, and a page cannot open a save dialog in
them at all. So the capability is read once: where a dialog can open, Export opens it, and
elsewhere the file lands in the download folder. A dismissed dialog is a decision, not a
failure, and says nothing.

```ts
encode(song) => string
decode(raw) => { ok: true; song } | { ok: false; error }
filenameFor(song) => string
```

Importing adds to the shelf rather than replacing what is open, so it needs no confirmation —
nothing is lost by it. Deleting a song does, and asks by `songHasContent`, the same predicate
Clear uses. A file that will not decode leaves the shelf alone and says why, in a dismissible
line under the header — `localStorage` can discard a bad blob silently because nobody chose it,
but a file is something you picked on purpose.

Everything that acts on a whole song — the list, New, Paste, Import, Export, Demo, Copy link,
Clear — is in one dialog behind **Songs**, not the header. On a phone the header is the scarcest space on the
page, and none of those is something you reach for while writing.

### Old files still open

Validation is a zod schema of the current `Song`, and it is the _only_ thing that decides
whether a document is valid. Versions before it are handled by a chain of migrations, one per
version, each reshaping the document into the next version's shape and validating nothing —
so an old version's rules never have to be restated, and a v1 file opens today:

| From | Was                                 | Migration                                 |
| ---- | ----------------------------------- | ----------------------------------------- |
| 1    | bars in a flat list, no chord names | none needed; chord names arrived optional |
| 2    | chord names on columns              | wrap the bars in a single row             |
| 3    | rows, no song around them           | wrap the score in an empty song           |

A column is checked against the tuning: one cell per string, refused rather than repaired,
because a short column would otherwise draw as a half-empty staff and look like a document
rather than a broken one. A version below 1 is refused too — there is no chain to migrate it
along.

Two rules keep this cheap as the schema keeps changing:

- **A new field gets a `.default()`**, so a file written before it existed still parses and
  needs no migration. Only a field that _changes shape_ needs one.
- **Unknown fields are dropped, not refused**, so a file written by a build one field ahead of
  this one still opens. A version integer higher than this build's is refused outright and says
  so — past that point guessing is worse than stopping.

### Sharing a song

**Copy link** puts the whole song in the fragment of a URL: deflate the same bytes `encode`
writes, then base64url so nothing in it needs escaping. There is no server, no account and no
upload — the link _is_ the song, and nothing of yours leaves the machine except what you send.
The demo song, 2.8 KB of JSON, makes an 1156-character link.

Opening one shows the song read-only with **Add to my songs**. It is never shelved on arrival:
a link someone sent you is something to read, and whether to keep it is your decision rather
than the sender's. The fragment is dropped from the address bar once read, so a reload does not
offer the same song twice and the URL cannot be mistaken for what is open.

Read on mount and on `hashchange` both. Pasting a link into a tab that already has tabsmith open
changes only the fragment, which is not a navigation — on mount alone, nothing would happen.

### Syncing to a Google Sheet

The shelf can be kept in step across your own devices through a Google Sheet, with an Apps
Script web app in front of it (`apps-script/Code.gs`). Without it set up, nothing changes: the
shelf lives in `localStorage` as above.

One round trip does both directions. The app POSTs every song and every deletion it knows of;
the sheet keeps the newest record of each id and answers with all of them; the app runs the
same newest-wins merge (`core/sync.ts`) on its side. Each song carries `updatedAt`, stamped when
an edit reaches the shelf, and a deleted song leaves a tombstone in `removed` so a device that
still has the old copy cannot bring it back. An edit made after a delete elsewhere does bring a
song back — the newer intent wins either way. Clocks are trusted, which is fine for one person's
devices.

Nothing is ever deleted from the sheet. A deleted song goes up whole with `active: false`, the
tombstone keeps the song so it can, and the sheet keeps it in its row marked inactive; the app
just stops showing it. Getting one back is flipping `active` to `TRUE` in the sheet and bumping
`at`. A deletion made before songs were kept arrives with no song, and `Code.gs` never lets that
blank the song a row already holds.

A song titled `DEMO_TITLE` (`Slow Machine (Demo)`, §1) is left out of what goes up, edited or
deleted, so the sheet only ever holds songs someone wrote or adopted by renaming.

The song goes up as the same document a file holds (`encode`), deflated and base64url'd as a
link is, so the sheet never needs to know what a song is and an old row still opens after the
format moves on. Packing is for room, not secrecy: a cell holds at most 50,000 characters and
indented JSON spends about 300 of them on each column of tab, so a song with a solo would
outgrow it. Packed, the demo goes from 11,152 characters to under 1,000. A row written before
songs were packed still reads. The title is a separate column only for whoever opens the sheet.

Sync runs three seconds after the last change, when the tab becomes visible again, and from
**Sync now**. A sync that brought nothing newer leaves the shelf untouched, which is what stops
it from triggering itself. The answer is merged into the shelf and editor as they are when it
lands, so typing during a sync is kept; the editor is reloaded only when the open song was the
one replaced or deleted.

The URL and a token are typed into the Songs dialog on each device and kept in `localStorage`
under `tabsmith.sync`. They are not built into the site: it is public, and a URL in its bundle
would let anyone read and overwrite every song. The script refuses any request without the
token. The app calls it a database and never names Google Sheets: what sits behind the URL is
this section's business, not the user's.

Setting it up:

1. In the Google Sheet, Extensions > Apps Script, replace the editor's contents with
   `apps-script/Code.gs` and save.
2. Project Settings > Script properties: add `TOKEN` with a long random value
   (`openssl rand -hex 32`).
3. Deploy > New deployment > Web app, executing as you, with access for Anyone. Copy the `/exec`
   URL.
4. On each device: Songs > Database sync, paste the URL and the token, Connect.

After changing `Code.gs`, update the existing deployment (Deploy > Manage deployments > Edit >
New version); saving alone does not change what the URL runs. The script creates a `songs` tab
on first use. One value longer than a cell makes the script refuse the whole write, so a song
still too long once packed is not sent: it stays on its device, the sync note names it, and
everything else syncs. Its deletion still goes up, without the song.

## 6. Deliberately absent

Named here so they don't creep in: custom tunings beyond the three presets, a capo stored with
the song, multiple songs open at once, rhythm and time signatures, playback, accounts, and live
sync between devices that are both open
— a device picks up changes when it syncs, not the moment they are made (§5).

One song is open at a time. The shelf holds the rest (§5); a file or a link is how a song
leaves.

Printing is the browser's: the ASCII view has a Print button and a `@media print` block that
strips the chrome and puts black text on white paper. Saving a PDF is the browser's print
dialog, not a feature here.

Lyrics are supported the only way they need to be — typed into a section body under their
chords. Nothing helps keep a chord above its word as the words change, and nothing needs to:
the ASCII view shows exactly what will print, and nudging a chord a space over is easy once
you can see it.

## 7. Stack

- Vite + React + TypeScript, `strict` on, no `any`.
- Vitest for the core. No React Testing Library; the UI is verified by running it.
- Plain CSS, one stylesheet. No UI framework, no styling library. Catppuccin for the palette:
  Latte in the light, Macchiato in the dark.
- oxlint and prettier, driven by the Makefile so CI and a terminal run the same commands.
- zod, for validating documents and sync replies at the edge (§5). The only runtime dependency
  besides React, and used nowhere else.

## 8. Layout

```
src/
  core/
    model.ts      types, emptySong, emptyScore, emptyBar, emptyColumn
    edit.ts       Action, apply, step — every state transition and the undo timeline
    keymap.ts     keyToAction
    render.ts     renderSong, renderScore and their helpers
    library.ts    the shelf: Library, Entry and the functions over them
    parse.ts      parseSong — pasted ASCII to a Song (§3b)
    sync.ts       records, merge — newest wins per song (§5)
  ui/
    App.tsx
    Chart.tsx     title, tempo and the sections
    TabGrid.tsx   grid of cells, cursor, keydown and click -> dispatch
    Output.tsx    <pre> of the rendered song + copy and print
    Shortcuts.tsx the §4 keymap: the essential few, and all of it grouped in a dialog
    Songbook.tsx  the shelf dialog behind Songs
    Paste.tsx     the Paste… dialog
    Practice.tsx  the reading view (§4b), also how a shared link opens
  storage.ts      the document format: encode, decode, migrations, load/save
  share.ts        a song in a link, and back
  sync.ts         the request to the sheet, its wire format and settings
  demo.ts         the demo song, decoded from demo.json
apps-script/
  Code.gs         the web app bound to the sheet: token check and the same merge
```

`core/` has no React import and no I/O.
