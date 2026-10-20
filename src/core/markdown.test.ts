import { describe, expect, it } from 'vitest'
import {
  listEnter,
  markdownBlocks,
  markdownLine,
  notesTitle,
  type MarkdownList,
  type Words,
} from './markdown.ts'

const read = (line: string) =>
  markdownLine(line).map(({ kind, text }) => `${kind}:${text}`)

describe('markdownLine', () => {
  it('keeps every character, marks and all, in order', () => {
    for (const line of [
      '# Gigs',
      '- **19.11** Reaktor _ADSR_',
      '1. see [the venue](https://example.com) at `19:00`',
      'plain words',
      '',
    ]) {
      expect(
        markdownLine(line)
          .map((piece) => piece.text)
          .join(''),
      ).toBe(line)
    }
  })

  it('reads a heading of any level', () => {
    expect(read('# Gigs')).toEqual(['mark:# ', 'heading:Gigs'])
    expect(read('### Later')).toEqual(['mark:### ', 'heading:Later'])
    expect(markdownLine('### Later')[1]).toEqual({
      kind: 'heading',
      text: 'Later',
      level: 3,
    })
    expect(read('# ')).toEqual(['mark:# '])
    expect(read('#hashtag')).toEqual(['text:#hashtag'])
  })

  it('reads a quote, its mark kept', () => {
    expect(read('> 21.10 Roba')).toEqual(['mark:> ', 'text:21.10 Roba'])
    expect(read('>tight')).toEqual(['mark:>', 'text:tight'])
  })

  it('reads list items, bulleted or numbered, with their words inside', () => {
    expect(read('- 13-14.11 Wild west')).toEqual(['mark:- ', 'text:13-14.11 Wild west'])
    expect(read('  * nested')).toEqual(['mark:  * ', 'text:nested'])
    expect(read('2. **bring** cables')).toEqual([
      'mark:2. ',
      'mark:**',
      'bold:bring',
      'mark:**',
      'text: cables',
    ])
  })

  it('reads bold, italic, code and links within a line', () => {
    expect(read('a **b** *c* _d_ `e` [f](https://g.example)')).toEqual([
      'text:a ',
      'mark:**',
      'bold:b',
      'mark:**',
      'text: ',
      'mark:*',
      'italic:c',
      'mark:*',
      'text: ',
      'mark:_',
      'italic:d',
      'mark:_',
      'text: ',
      'mark:`',
      'code:e',
      'mark:`',
      'text: ',
      'mark:[',
      'link:f',
      'mark:](https://g.example)',
    ])
  })

  it('reads an image by its address, its alt text kept', () => {
    expect(markdownLine('see ![the stage](https://example.com/a.png)')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'mark', text: '![' },
      { kind: 'image', text: 'the stage', url: 'https://example.com/a.png' },
      { kind: 'mark', text: '](https://example.com/a.png)' },
    ])
  })

  it('reads an image beside the app by its relative path, not by a path from the root', () => {
    expect(read('![pug](pug-banner.jpg)')).toEqual([
      'mark:![',
      'image:pug',
      'mark:](pug-banner.jpg)',
    ])
    expect(read('![pug](./pug-banner.jpg)')).toEqual([
      'mark:![',
      'image:pug',
      'mark:](./pug-banner.jpg)',
    ])
    expect(read('![x](/pug-banner.jpg)')).toEqual(['text:![x](/pug-banner.jpg)'])
    expect(read('![x](//other.example/a.png)')).toEqual([
      'text:![x](//other.example/a.png)',
    ])
  })

  it('only links to the web or to mail, anything else left as words', () => {
    expect(read('[mail](mailto:band@example.com)')).toEqual([
      'mark:[',
      'link:mail',
      'mark:](mailto:band@example.com)',
    ])
    expect(read('[x](javascript:alert(1))')).toEqual(['text:[x](javascript:alert(1))'])
    expect(read('![x](data:image/png;base64,AA)')).toEqual([
      'text:![x](data:image/png;base64,AA)',
    ])
  })

  it('leaves marks that open nothing as words', () => {
    expect(read('2 * 3 = 6')).toEqual(['text:2 * 3 = 6'])
    expect(read('**unclosed')).toEqual(['text:**unclosed'])
    expect(read('-no space')).toEqual(['text:-no space'])
  })
})

describe('markdownBlocks', () => {
  const said = (line: Words) =>
    line.map((piece) => `${piece.kind}:${piece.text}`).join(' ')
  const listed = (list: MarkdownList): string =>
    `${list.ordered ? 'ol' : 'ul'} ${list.items
      .map(
        ({ words, nested }) =>
          `${said(words)}${nested.map((list) => ` (${listed(list)})`).join('')}`,
      )
      .join(' | ')}`
  const shape = (text: string) =>
    markdownBlocks(text).map((block) =>
      block.kind === 'heading'
        ? `h${block.level} ${said(block.words)}`
        : block.kind === 'list'
          ? listed(block)
          : `${block.kind === 'quote' ? 'q' : 'p'} ${block.lines.map(said).join(' | ')}`,
    )

  it('sets out headings by level, lists and paragraphs, the marks gone', () => {
    expect(
      shape(
        '# Gigs\n## Treenit\n- **21.10** Roba\n- 13.11 Wild west\n\nKeikat:\n19.11 ADSR',
      ),
    ).toEqual([
      'h1 text:Gigs',
      'h2 text:Treenit',
      'ul bold:21.10 text: Roba | text:13.11 Wild west',
      'p text:Keikat: | text:19.11 ADSR',
    ])
  })

  it('reads the words inside a heading as words, emphasis and all', () => {
    expect(shape('### Later _maybe_')).toEqual(['h3 text:Later  italic:maybe'])
  })

  it('starts a new list when the kind of list changes, and ends one at a blank line', () => {
    expect(shape('- a\n1. b\n2. c\n\n- d')).toEqual([
      'ul text:a',
      'ol text:b | text:c',
      'ul text:d',
    ])
  })

  it('nests a more indented item under the one above it, however deep', () => {
    expect(
      shape('- Add nested bullets\n  - like this\n    - and this\n  - back\n- top'),
    ).toEqual([
      'ul text:Add nested bullets (ul text:like this (ul text:and this) | text:back) | text:top',
    ])
  })

  it('nests a list of the other kind under an item, and keeps the outer list going', () => {
    expect(shape('1. intro\n   - riff\n2. verse')).toEqual([
      'ol text:intro (ul text:riff) | text:verse',
    ])
  })

  it('starts a new nested list when the kind of list changes under an item', () => {
    expect(shape('- a\n  - b\n  1. c\n  2. d\n- e')).toEqual([
      'ul text:a (ul text:b) (ol text:c | text:d) | text:e',
    ])
  })

  it('takes an item indented less than the first as one of the outer list', () => {
    expect(shape('  - a\n- b')).toEqual(['ul text:a | text:b'])
  })

  it('gathers quoted lines into one quote, ended by a line that is not quoted', () => {
    expect(shape('> 21.10 Roba klo 19\n>**bring** cables\nthen home')).toEqual([
      'q text:21.10 Roba klo 19 | bold:bring text: cables',
      'p text:then home',
    ])
  })

  it('keeps a link where it points', () => {
    expect(markdownBlocks('[venue](https://example.com)')).toEqual([
      {
        kind: 'paragraph',
        lines: [[{ kind: 'link', text: 'venue', url: 'https://example.com' }]],
      },
    ])
  })

  it('reads nothing but blank lines as nothing', () => {
    expect(markdownBlocks('\n\n')).toEqual([])
    expect(markdownBlocks('')).toEqual([])
  })
})

describe('notesTitle', () => {
  it('reads the first # heading wherever it is, its marks dropped', () => {
    expect(notesTitle('# FÄTTIG\n## 21.10 Roba')).toBe('FÄTTIG')
    expect(notesTitle('![pug](https://example.com/a.jpg)\n\n# **FÄTTIG** _2026_')).toBe(
      'FÄTTIG 2026',
    )
    expect(notesTitle('## Treenit\n# Later\n# Last')).toBe('Later')
  })

  it('reads nothing when there is no # heading with words', () => {
    expect(notesTitle('## Treenit\n### Keikat')).toBeNull()
    expect(notesTitle('#hashtag')).toBeNull()
    expect(notesTitle('# \nplain')).toBeNull()
    expect(notesTitle('')).toBeNull()
  })
})

describe('listEnter', () => {
  it('starts the next item at the same depth, with the same bullet', () => {
    expect(listEnter('- Add nested bullets', '')).toEqual({
      kind: 'continue',
      marker: '- ',
    })
    expect(listEnter('    * like this', '')).toEqual({
      kind: 'continue',
      marker: '    * ',
    })
  })

  it('numbers the next item one on', () => {
    expect(listEnter('  9. ninth', '')).toEqual({ kind: 'continue', marker: '  10. ' })
  })

  it('continues an item split at the caret, as one ended there', () => {
    expect(listEnter('- split ', 'here')).toEqual({ kind: 'continue', marker: '- ' })
  })

  it('ends the list from an empty item', () => {
    expect(listEnter('  - ', '')).toEqual({ kind: 'end' })
    expect(listEnter('3. ', ' ')).toEqual({ kind: 'end' })
  })

  it('leaves a line that is not an item to the field', () => {
    expect(listEnter('plain words', '')).toBeNull()
    expect(listEnter('-no space', '')).toBeNull()
    expect(listEnter('', '- after the caret')).toBeNull()
  })
})
