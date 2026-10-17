import { describe, expect, it } from 'vitest'
import { markdownBlocks, markdownLine, type Words } from './markdown.ts'

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
  const shape = (text: string) =>
    markdownBlocks(text).map((block) =>
      block.kind === 'heading'
        ? `h${block.level} ${said(block.words)}`
        : block.kind === 'list'
          ? `${block.ordered ? 'ol' : 'ul'} ${block.items.map(said).join(' | ')}`
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
