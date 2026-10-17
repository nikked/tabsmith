import { Fragment } from 'react'
import { markdownLine } from '../core/markdown.ts'

/**
 * Free text with its Markdown styled in place, every mark kept where it was
 * typed, for drawing under a text field that shows only its caret. A last
 * empty line still takes its height, or the field would end a line short.
 */
export function MarkdownLines({ text }: { readonly text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && '\n'}
          {markdownLine(line).map((piece, at) => (
            <span
              key={at}
              className={
                piece.kind === 'heading'
                  ? `md-heading md-h${Math.min(piece.level, 4)}`
                  : `md-${piece.kind}`
              }
            >
              {piece.text}
            </span>
          ))}
        </Fragment>
      ))}
      {lines.at(-1) === '' && '​'}
    </>
  )
}
