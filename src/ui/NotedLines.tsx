import { Fragment } from 'react'
import { NOTE_MARK, splitNote } from '../core/render.ts'

/**
 * A section body with each line's note set apart from it. The mark is still
 * there, only unseen, so every note stays in the column it was typed in.
 */
export function NotedLines({ body }: { readonly body: string }) {
  return body.split('\n').map((line, index) => {
    const { text, note } = splitNote(line)
    return (
      <Fragment key={index}>
        {index > 0 && '\n'}
        {text}
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
