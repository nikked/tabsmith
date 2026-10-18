import { Fragment } from 'react'
import { chordNotes } from '../core/notation.ts'
import { isChordLine, NOTE_MARK, splitNote } from '../core/render.ts'
import { play } from './sound.ts'

/**
 * A line of chord names. Where it can be played, each name that is a chord is
 * a button that strums it; the spaces between stay where they were typed.
 */
export function ChordLine({
  text,
  playable,
}: {
  readonly text: string
  readonly playable: boolean
}) {
  if (!playable) return <span className="chord-line">{text}</span>
  return (
    <span className="chord-line">
      {text.split(/(\s+)/).map((word, at) => {
        const notes = chordNotes(word)
        return notes === null ? (
          word
        ) : (
          <button
            key={at}
            type="button"
            className="sound"
            title={`Play ${word}`}
            onClick={() => play(notes)}
          >
            {word}
          </button>
        )
      })}
    </span>
  )
}

/**
 * A section body with each line's note set apart from it. The mark is still
 * there, only unseen, so every note stays in the column it was typed in.
 * `playable` lets a chord line's names be tapped to hear them, in Perform.
 */
export function NotedLines({
  body,
  playable = false,
}: {
  readonly body: string
  readonly playable?: boolean
}) {
  return body.split('\n').map((line, index) => {
    const { text, note } = splitNote(line)
    return (
      <Fragment key={index}>
        {index > 0 && '\n'}
        {isChordLine(text) ? <ChordLine text={text} playable={playable} /> : text}
        {note !== null && (
          <>
            <span className="note-mark">{NOTE_MARK}</span>
            <span className="line-note">{note}</span>
          </>
        )}
      </Fragment>
    )
  })
}
