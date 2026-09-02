# tabsmith

A keyboard-driven web editor for songs: a chord chart you can take to band practice, and a
guitar or bass tab beside it for the parts you need written out. The output is plain ASCII,
printed to paper or a PDF, and copied to the clipboard when it needs to go somewhere else.

**[nikked.github.io/tabsmith](https://nikked.github.io/tabsmith/)** — open it and press _Demo_
to see a song already written.

Songs live in the browser and are saved as you type. _Save as_ writes one to a file and _Open_
reads it back, so a song is a file you keep wherever you keep files.

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
