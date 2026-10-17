/**
 * The Markdown notes are written with: headings, lists, quotes, bold, italic,
 * code, links and images. Read two ways: as lines cut into pieces with every mark kept, for
 * styling the text in place while it is typed, and as blocks with the marks
 * gone, for reading it set out the way a README is.
 */
export type MarkdownPiece =
  | {
      readonly kind: 'text' | 'mark' | 'bold' | 'italic' | 'code'
      readonly text: string
    }
  | { readonly kind: 'heading'; readonly text: string; readonly level: number }
  | { readonly kind: 'link' | 'image'; readonly text: string; readonly url: string }

type Plain = Exclude<MarkdownPiece['kind'], 'link' | 'image' | 'heading'>

const piece = (kind: Plain, text: string): MarkdownPiece => ({ kind, text })

// An image before a link, since it is one with a ! in front, and bold before
// italic, so ** is not read as two stars of emphasis. A link or an image only
// goes to the web or to mail: notes arrive from other devices through the
// sheet, and a javascript: link in them would run when it was clicked.
const INLINE =
  /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g

const HEADING = /^(#{1,6})(\s+)(.*)$/
const ITEM = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/
const QUOTE = /^(\s*>\s?)(.*)$/

/** Words with their emphasis, code, links and images, the marks kept as pieces. */
const inline = (text: string): readonly MarkdownPiece[] => {
  const pieces: MarkdownPiece[] = []
  let at = 0
  for (const match of text.matchAll(INLINE)) {
    const [whole, alt, source, bold, code, label, url, starred, underscored] = match
    if (match.index > at) pieces.push(piece('text', text.slice(at, match.index)))
    if (alt !== undefined && source !== undefined)
      pieces.push(
        piece('mark', '!['),
        { kind: 'image', text: alt, url: source },
        piece('mark', `](${source})`),
      )
    else if (bold !== undefined)
      pieces.push(piece('mark', '**'), piece('bold', bold), piece('mark', '**'))
    else if (code !== undefined)
      pieces.push(piece('mark', '`'), piece('code', code), piece('mark', '`'))
    else if (label !== undefined && url !== undefined)
      pieces.push(
        piece('mark', '['),
        { kind: 'link', text: label, url },
        piece('mark', `](${url})`),
      )
    else {
      const mark = whole[0] ?? ''
      pieces.push(
        piece('mark', mark),
        piece('italic', starred ?? underscored ?? ''),
        piece('mark', mark),
      )
    }
    at = match.index + whole.length
  }
  if (at < text.length) pieces.push(piece('text', text.slice(at)))
  return pieces
}

/**
 * One line cut into pieces that join back up into the line exactly, so a view
 * can draw them under a text field without moving a single character.
 */
export const markdownLine = (line: string): readonly MarkdownPiece[] => {
  const heading = HEADING.exec(line)
  if (heading !== null) {
    const [, hashes = '', space = '', rest = ''] = heading
    const mark = piece('mark', hashes + space)
    return rest === ''
      ? [mark]
      : [mark, { kind: 'heading', text: rest, level: hashes.length }]
  }
  const item = ITEM.exec(line)
  if (item !== null) {
    const [, indent = '', bullet = '', space = '', rest = ''] = item
    return [piece('mark', indent + bullet + space), ...inline(rest)]
  }
  const quote = QUOTE.exec(line)
  if (quote !== null) {
    const [, mark = '', rest = ''] = quote
    return [piece('mark', mark), ...inline(rest)]
  }
  return inline(line)
}

/** What a line's words are, with its marks left out. */
export type Words = readonly MarkdownPiece[]

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly words: Words }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly Words[] }
  | { readonly kind: 'paragraph'; readonly lines: readonly Words[] }
  | { readonly kind: 'quote'; readonly lines: readonly Words[] }

const words = (text: string): Words => inline(text).filter((each) => each.kind !== 'mark')

type Line =
  | { readonly kind: 'heading'; readonly level: number; readonly words: Words }
  | { readonly kind: 'item'; readonly ordered: boolean; readonly words: Words }
  | { readonly kind: 'quote'; readonly words: Words }
  | { readonly kind: 'text'; readonly words: Words }
  | { readonly kind: 'blank' }

const lineOf = (line: string): Line => {
  if (line.trim() === '') return { kind: 'blank' }
  const heading = HEADING.exec(line)
  if (heading !== null)
    return {
      kind: 'heading',
      level: heading[1]?.length ?? 1,
      words: words(heading[3] ?? ''),
    }
  const item = ITEM.exec(line)
  if (item !== null)
    return {
      kind: 'item',
      ordered: /\d/.test(item[2] ?? ''),
      words: words(item[4] ?? ''),
    }
  const quote = QUOTE.exec(line)
  if (quote !== null) return { kind: 'quote', words: words(quote[2] ?? '') }
  return { kind: 'text', words: words(line) }
}

/**
 * The notes as a README sets them out: headings, lists and paragraphs, a blank
 * line ending a paragraph or a list. Unlike a README, a line break within a
 * paragraph stays one, since notes are written a line at a time.
 */
export const markdownBlocks = (text: string): readonly MarkdownBlock[] =>
  text
    .split('\n')
    .map(lineOf)
    .reduce<readonly MarkdownBlock[]>((blocks, line) => {
      const last = blocks.at(-1)
      const before = blocks.slice(0, -1)
      switch (line.kind) {
        case 'blank':
          return [...blocks, { kind: 'paragraph', lines: [] }]
        case 'heading':
          return [...blocks, line]
        case 'item':
          return last?.kind === 'list' && last.ordered === line.ordered
            ? [...before, { ...last, items: [...last.items, line.words] }]
            : [...blocks, { kind: 'list', ordered: line.ordered, items: [line.words] }]
        case 'quote':
          return last?.kind === 'quote'
            ? [...before, { ...last, lines: [...last.lines, line.words] }]
            : [...blocks, { kind: 'quote', lines: [line.words] }]
        case 'text':
          return last?.kind === 'paragraph'
            ? [...before, { ...last, lines: [...last.lines, line.words] }]
            : [...blocks, { kind: 'paragraph', lines: [line.words] }]
      }
    }, [])
    .filter((block) => block.kind !== 'paragraph' || block.lines.length > 0)
