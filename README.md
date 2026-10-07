# tabsmith

A keyboard-driven web editor for songs: a chord chart you can take to band practice, and a
guitar or bass tab beside it for the parts you need written out. **Practice** shows the
finished song large enough to read from a music stand.

**[nikked.github.io/tabsmith](https://nikked.github.io/tabsmith/)** — a first visit opens on a
song already written.

Songs live in the browser and are saved as you type. **Songs** is the shelf they sit on: start
one, or paste one in from a chord sheet. The `⋯` menu at the right exports the open
song as a file. **Copy link** puts a whole song in
a URL, so sending someone a chart needs no account and no server.
To keep the shelf the same on your phone and laptop, it can sync through a Google Sheet you own —
see [Syncing to a Google Sheet](docs/design.md#syncing-to-a-google-sheet).

**Practice** is the reading view — the whole window, type you can read from a music stand, and
the screen held awake.

## Running it

```sh
make dev            # http://localhost:5173
make test           # vitest
make build          # tsc -b && vite build
make lint           # oxlint, fixing what it can
make format         # prettier --write
make qa-check       # everything CI runs
```

Every target installs first, so `make dev` on a fresh clone is the whole setup. CI runs `tc`,
`test`, `lint-check` and `format-check` on every push, and a push to `main` deploys the site.

Vite, React and TypeScript with `strict` on. One stylesheet, no UI framework, and zod as the
only runtime dependency besides React.

## Keys

The tab grid is driven from the keyboard. Four bindings sit under the grid because they are the
ones you could not guess:

| Key                   | Does                                                     |
| --------------------- | -------------------------------------------------------- |
| `Tab` `Shift+Tab`     | Next / previous bar, and out of the tab at either end    |
| `Enter` `Shift+Enter` | Add a bar after this one / remove this one               |
| `]` `[`               | Add a column after this one / remove this one when empty |
| `}` `{`               | Start a row below / remove this row                      |
| `Cmd+Z` `Cmd+Shift+Z` | Undo / redo. In a text field the browser undoes instead. |
| `?`                   | Every other key, grouped, in a dialog                    |

Type a digit to set a fret, arrow around the grid and on into the row title above or the chord
fields below, and `x`, `h`, `p`, `b` and `~` for a mute, a hammer-on, a pull-off, a bend and
vibrato.

The chart is ordinary text fields, with one exception: `Tab` inside a section body types a tab
instead of leaving the field, which is how two blocks are made to start at the same column.
`Shift+Tab` still moves on.

## Design

[`docs/design.md`](docs/design.md) covers the document model, how the ASCII is derived from it,
the file format and its migrations, the keymap in full, and what has been left out on purpose.
Comments in the code cite its sections as `§1`, `§2` and so on.
