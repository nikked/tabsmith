import type { Action } from '../core/edit.ts'
import type { Section, Song } from '../core/model.ts'

type Props = {
  readonly song: Song
  readonly dispatch: (action: Action) => void
}

/**
 * One is allowed through even though it means nothing, because it is the first
 * keystroke of twelve — rejecting it would empty the field under the typist.
 * The render is what decides a repeat is worth printing.
 */
const parseRepeat = (raw: string): number | undefined => {
  const value = Number(raw)
  return raw === '' || !Number.isInteger(value) || value < 1 ? undefined : value
}

export function Chart({ song, dispatch }: Props) {
  const setSection = (index: number, section: Section) =>
    dispatch({ kind: 'setSection', index, section })

  return (
    <section className="chart">
      <div className="meta">
        <input
          className="title"
          aria-label="Song title"
          placeholder="Song title"
          value={song.title}
          onChange={(event) => dispatch({ kind: 'setTitle', title: event.target.value })}
        />
        <input
          className="tempo"
          aria-label="Tempo"
          placeholder="70 bpm"
          value={song.tempo}
          onChange={(event) => dispatch({ kind: 'setTempo', tempo: event.target.value })}
        />
      </div>

      {song.chart.map((section, index) => (
        <article className="section" key={index}>
          <div className="section-head">
            <input
              className="section-name"
              aria-label={`Section ${index + 1} name`}
              placeholder="Verse 1"
              value={section.name}
              onChange={(event) =>
                setSection(index, { ...section, name: event.target.value })
              }
            />
            <input
              className="section-repeat"
              type="number"
              min={1}
              aria-label={`Section ${index + 1} repeat`}
              placeholder="x"
              value={section.repeat ?? ''}
              onChange={(event) =>
                setSection(index, {
                  ...section,
                  repeat: parseRepeat(event.target.value),
                })
              }
            />
            <button
              type="button"
              title="Add a section below"
              onClick={() => dispatch({ kind: 'addSection', after: index })}
            >
              +
            </button>
            <button
              type="button"
              title="Remove this section"
              disabled={song.chart.length <= 1}
              onClick={() => dispatch({ kind: 'removeSection', index })}
            >
              −
            </button>
          </div>
          <textarea
            aria-label={`Section ${index + 1} chords`}
            spellCheck={false}
            rows={Math.max(3, section.body.split('\n').length + 1)}
            value={section.body}
            onChange={(event) =>
              setSection(index, { ...section, body: event.target.value })
            }
          />
        </article>
      ))}
    </section>
  )
}
