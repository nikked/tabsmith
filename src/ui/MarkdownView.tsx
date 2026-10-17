import type { ReactNode } from 'react'
import { markdownBlocks, type Words } from '../core/markdown.ts'

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

/** Notes set out the way a README is: real headings, lists and emphasis. */
export function MarkdownView({ text }: { readonly text: string }) {
  return markdownBlocks(text).map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        const Heading = HEADINGS[block.level - 1] ?? 'h6'
        return <Heading key={index}>{wordsOf(block.words)}</Heading>
      }
      case 'list': {
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={index}>
            {block.items.map((item, at) => (
              <li key={at}>{wordsOf(item)}</li>
            ))}
          </List>
        )
      }
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
