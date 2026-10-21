/**
 * The Markdown notes are written with: headings, nested lists, quotes, bold, italic,
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
// italic, so ** is not read as two stars of emphasis. A link only goes to the
// web or to mail, and an image to the web or to a path beside the app: notes
// arrive from other devices through the sheet, and a javascript: link in them
// would run when it was clicked. The path has no : to name a scheme with, and
// is relative, since the site is served from under its repo's name, not the root.
const INLINE =
  /!\[([^\]]*)\]\((https?:\/\/[^)\s]+|(?!\/)[^)\s:]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g

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

/** A list, each item with the lists indented under it, one more each time the kind changes. */
export type MarkdownList = {
  readonly ordered: boolean
  readonly items: readonly {
    readonly words: Words
    readonly nested: readonly MarkdownList[]
  }[]
}

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly words: Words }
  | ({ readonly kind: 'list' } & MarkdownList)
  | { readonly kind: 'paragraph'; readonly lines: readonly Words[] }
  | { readonly kind: 'quote'; readonly lines: readonly Words[] }

const words = (text: string): Words => inline(text).filter((each) => each.kind !== 'mark')

type Line =
  | { readonly kind: 'heading'; readonly level: number; readonly words: Words }
  | {
      readonly kind: 'item'
      readonly indent: number
      readonly ordered: boolean
      readonly words: Words
    }
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
      // A tab as the four spaces it stands in for, so the two can be mixed.
      indent: (item[1] ?? '').replace(/\t/g, '    ').length,
      ordered: /\d/.test(item[2] ?? ''),
      words: words(item[4] ?? ''),
    }
  const quote = QUOTE.exec(line)
  if (quote !== null) return { kind: 'quote', words: words(quote[2] ?? '') }
  return { kind: 'text', words: words(line) }
}

type Item = Extract<Line, { kind: 'item' }>
type Items = readonly [Item, ...Item[]]

// Each item no more indented than the first starts one of the list's items,
// and those more indented after it are nested under it; a change of kind
// among the items starts another list, at any depth alike.
const nest = (items: Items): readonly MarkdownList[] => {
  const [first] = items
  const gathered = items.reduce<
    readonly { readonly item: Item; readonly under: readonly Item[] }[]
  >((tops, item) => {
    const last = tops.at(-1)
    return last === undefined || item.indent <= first.indent
      ? [...tops, { item, under: [] }]
      : [...tops.slice(0, -1), { ...last, under: [...last.under, item] }]
  }, [])
  return gathered.reduce<readonly MarkdownList[]>(
    (lists, { item, under: [head, ...rest] }) => {
      const entry = {
        words: item.words,
        nested: head === undefined ? [] : nest([head, ...rest]),
      }
      const last = lists.at(-1)
      return last?.ordered === item.ordered
        ? [...lists.slice(0, -1), { ...last, items: [...last.items, entry] }]
        : [...lists, { ordered: item.ordered, items: [entry] }]
    },
    [],
  )
}

type Gathered =
  | Exclude<MarkdownBlock, { kind: 'list' }>
  | { readonly kind: 'list'; readonly items: Items }

/**
 * The notes as a README sets them out: headings, lists and paragraphs, a blank
 * line ending a paragraph or a list. Unlike a README, a line break within a
 * paragraph stays one, since notes are written a line at a time. An item
 * indented more than the list's first is nested under the one above it.
 */
export const markdownBlocks = (text: string): readonly MarkdownBlock[] =>
  text
    .split('\n')
    .map(lineOf)
    .reduce<readonly Gathered[]>((blocks, line) => {
      const last = blocks.at(-1)
      const before = blocks.slice(0, -1)
      switch (line.kind) {
        case 'blank':
          return [...blocks, { kind: 'paragraph', lines: [] }]
        case 'heading':
          return [...blocks, line]
        case 'item':
          return last?.kind === 'list'
            ? [...before, { ...last, items: [...last.items, line] }]
            : [...blocks, { kind: 'list', items: [line] }]
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
    .flatMap((block): readonly MarkdownBlock[] =>
      block.kind === 'list'
        ? nest(block.items).map((list) => ({ kind: 'list', ...list }))
        : [block],
    )

/** What Enter does in a list item: start the next one, or end the list from an empty one. */
export type ListEnter =
  { readonly kind: 'continue'; readonly marker: string } | { readonly kind: 'end' }

/**
 * Enter with the caret in a line, by the line's text before the caret and
 * after it. Null when the line is no list item, and Enter is just a new line.
 */
export const listEnter = (before: string, after: string): ListEnter | null => {
  const item = ITEM.exec(before)
  if (item === null) return null
  const [, indent = '', bullet = '', , rest = ''] = item
  if (rest.trim() === '' && after.trim() === '') return { kind: 'end' }
  const next = /\d/.test(bullet) ? `${Number.parseInt(bullet, 10) + 1}.` : bullet
  return { kind: 'continue', marker: `${indent}${next} ` }
}

/** A change to a line: the text from `from` to `to` replaced by `text`. */
export type LineEdit = {
  readonly from: number
  readonly to: number
  readonly text: string
}

/**
 * Tab or Shift+Tab in a list item: a tab in at the start of the line, or one
 * taken out, or up to four spaces from before tabs were used. A tab, one
 * character, so taking a bullet away leaves one to delete, not a row of spaces.
 * Null when the line is no item, or has nothing to take out.
 */
export const listIndent = (line: string, indent: boolean): LineEdit | null => {
  const item = ITEM.exec(line)
  if (item === null) return null
  if (indent) return { from: 0, to: 0, text: '\t' }
  const spaces = /^ {1,4}/.exec(line)?.[0].length ?? 0
  const out = line.startsWith('\t') ? 1 : spaces
  return out === 0 ? null : { from: 0, to: out, text: '' }
}

/**
 * What the notes call themselves: the words of their first # heading, wherever
 * it is, its marks dropped. Null when they have none.
 */
export const notesTitle = (text: string): string | null => {
  const title = text
    .split('\n')
    .map((line) => HEADING.exec(line))
    .find(
      (heading) =>
        heading !== null && heading[1] === '#' && (heading[3] ?? '').trim() !== '',
    )
  return title == null
    ? null
    : words(title[3] ?? '')
        .map((piece) => piece.text)
        .join('')
        .trim()
}
