import { Fragment, type ReactNode } from 'react'
import { markdownBlocks, type MarkdownList, type Words } from '../core/markdown.ts'

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

const wordsOf = (words: Words): ReactNode =>
  words.map((piece, at) => {
    switch (piece.kind) {
      case 'bold':
        return <strong key={at}>{piece.text}</strong>
      case 'italic':
        return <em key={at}>{piece.text}</em>
      case 'code':
        return <code key={at}>{piece.text}</code>
      case 'image':
        return <img key={at} src={piece.url} alt={piece.text} loading="lazy" />
      case 'link':
        return (
          <a key={at} href={piece.url} target="_blank" rel="noreferrer">
            {piece.text}
          </a>
        )
      default:
        return piece.text
    }
  })

const listOf = ({ ordered, items }: MarkdownList): ReactNode => {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List>
      {items.map(({ words, nested }, at) => (
        <li key={at}>
          {wordsOf(words)}
          {nested.map((list, inner) => (
            <Fragment key={inner}>{listOf(list)}</Fragment>
          ))}
        </li>
      ))}
    </List>
  )
}

/** Notes set out the way a README is: real headings, lists and emphasis. */
export function MarkdownView({ text }: { readonly text: string }) {
  return markdownBlocks(text).map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        const Heading = HEADINGS[block.level - 1] ?? 'h6'
        return <Heading key={index}>{wordsOf(block.words)}</Heading>
      }
      case 'list':
        return <Fragment key={index}>{listOf(block)}</Fragment>
      case 'quote':
        return (
          <blockquote key={index}>
            {block.lines.map((line, at) => (
              <span key={at}>
                {at > 0 && <br />}
                {wordsOf(line)}
              </span>
            ))}
          </blockquote>
        )
      case 'paragraph':
        return (
          <p key={index}>
            {block.lines.map((line, at) => (
              <span key={at}>
                {at > 0 && <br />}
                {wordsOf(line)}
              </span>
            ))}
          </p>
        )
    }
  })
}
