/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')

type Value = string | number | boolean

const sheetWith = (values: Value[][]) => ({
  getLastRow: () => values.length,
  getRange: (row: number, _column: number, count: number, width: number) => ({
    setValues: (next: Value[][]) => {
      if (
        next.some((cells) =>
          cells.some((cell) => typeof cell === 'string' && cell.length > 50000),
        )
      ) {
        throw new Error('Cell exceeds 50,000 characters')
      }
      values.splice(row - 1, count, ...next)
    },
    clearContent: () => {
      values.splice(
        row - 1,
        count,
        ...Array.from({ length: count }, () => Array.from({ length: width }, () => '')),
      )
    },
  }),
})

describe.each([
  {
    name: 'songs',
    write: 'writeRecords',
    record: { id: 'new', at: 2, title: 'New song', song: 'document', active: true },
    oversized: {
      id: 'new',
      at: 2,
      title: 'Long song',
      song: 'x'.repeat(50001),
      active: true,
    },
    row: ['new', 2, 'New song', 'document', true],
  },
  {
    name: 'setlists',
    write: 'writeSetlists',
    record: { id: 'new', at: 2, name: 'Gig', songs: ['song'], active: true },
    oversized: {
      id: 'new',
      at: 2,
      name: 'Gig',
      songs: ['x'.repeat(50001)],
      active: true,
    },
    row: ['new', 2, 'Gig', '["song"]', true],
  },
  {
    name: 'todos',
    write: 'writeTodos',
    record: { id: 'new', at: 2, text: 'Buy strings', done: false, active: true },
    oversized: {
      id: 'new',
      at: 2,
      text: 'x'.repeat(50001),
      done: false,
      active: true,
    },
    row: ['new', 2, '"Buy strings"', false, true],
  },
])('$name sheet writes', ({ write, record, oversized, row }) => {
  const stored: Value[][] = [
    ['id', 'at', 'name', 'document', 'active'],
    ['kept', 1, 'Kept', 'stored document', true],
    ['stale', 1, 'Stale', 'stale document', false],
  ]

  it('preserves existing rows when the replacement write fails', () => {
    const values = structuredClone(stored)
    const sheet = sheetWith(values)
    expect(() =>
      runInNewContext(`${script}\n${write}(sheet, records)`, {
        sheet,
        records: [record, oversized],
      }),
    ).toThrow('Cell exceeds 50,000 characters')
    expect(values).toEqual(stored)
  })

  it('writes replacements and then clears only the stale tail', () => {
    const values = structuredClone(stored)
    runInNewContext(`${script}\n${write}(sheet, records)`, {
      sheet: sheetWith(values),
      records: [record],
    })
    expect(values).toEqual([stored[0], row, ['', '', '', '', '']])
  })

  it('clears stale rows when there are no records to write', () => {
    const values = structuredClone(stored)
    runInNewContext(`${script}\n${write}(sheet, records)`, {
      sheet: sheetWith(values),
      records: [],
    })
    expect(values).toEqual([stored[0], ['', '', '', '', ''], ['', '', '', '', '']])
  })
})

describe('song merge', () => {
  type Row = {
    id: string
    at: number
    title: string
    song: string | null
    active: boolean
  }
  const merged = (stored: Row[], incoming: Row[]): Row[] =>
    runInNewContext(`${script}\nmergeSongs(stored, incoming)`, { stored, incoming })
  const row = (id: string, at: number, title: string, active = true): Row => ({
    id,
    at,
    title,
    song: `${id} document`,
    active,
  })

  it('gives a song no row until it has a title, kept or deleted', () => {
    expect(
      merged(
        [],
        [row('new', 1, ''), row('gone', 2, '', false), row('named', 3, 'Slow Machine')],
      ).map(({ id }) => id),
    ).toEqual(['named'])
  })

  it('keeps syncing a song with a row after its title is cleared, deleted or not', () => {
    const stored = [row('a', 1, 'Riff'), row('b', 1, 'Verse')]
    expect(
      merged(stored, [row('a', 2, ''), row('b', 2, '', false)]).map(
        ({ id, at, active }) => [id, at, active],
      ),
    ).toEqual([
      ['a', 2, true],
      ['b', 2, false],
    ])
  })
})

describe('todos in a request', () => {
  const parsed = (body: unknown) =>
    runInNewContext(`${script}\nparseBody(text)`, { text: JSON.stringify(body) })

  it('keeps well-formed todos as typed, and drops the rest', () => {
    const body = parsed({
      token: 't',
      records: [],
      todos: [
        { id: 'a', at: 1, text: '=HYPERLINK("x")', done: false, active: true },
        { id: 'b', at: 1, text: 'Strings', done: 'yes', active: true },
        { id: '', at: 1, text: 'No id', done: false, active: true },
      ],
    })
    expect(body.todos).toEqual([
      { id: 'a', at: 1, text: '=HYPERLINK("x")', done: false, active: true },
    ])
  })

  it('reads a request from an app without todos as none', () => {
    expect(parsed({ token: 't', records: [] }).todos).toEqual([])
  })
})

describe('a sync round trip through the script', () => {
  // Just enough of a spreadsheet for doPost: named tabs of rows, row 1 the header.
  const book = () => {
    const tabs = new Map<string, Value[][]>()
    const sheet = (rows: Value[][]) => ({
      getLastRow: () => rows.length,
      getDataRange: () => ({ getValues: () => rows.map((row) => [...row]) }),
      getRange: (row: number, _column: number, count: number, width: number) => ({
        setValues: (next: Value[][]) => {
          rows.splice(row - 1, count, ...next)
        },
        clearContent: () => {
          rows.splice(
            row - 1,
            count,
            ...Array.from({ length: count }, () =>
              Array.from({ length: width }, () => ''),
            ),
          )
        },
      }),
    })
    const spreadsheet = {
      getSheetByName: (name: string) => {
        const rows = tabs.get(name)
        return rows === undefined ? null : sheet(rows)
      },
      insertSheet: (name: string) => {
        const rows: Value[][] = []
        tabs.set(name, rows)
        return sheet(rows)
      },
    }
    const post = (body: unknown) =>
      JSON.parse(
        runInNewContext(`${script}\ndoPost(event)`, {
          event: { postData: { contents: JSON.stringify(body) } },
          SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
          PropertiesService: { getScriptProperties: () => ({ getProperty: () => 't' }) },
          LockService: {
            getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
          },
          ContentService: {
            createTextOutput: (text: string) => ({ setMimeType: () => text }),
            MimeType: { JSON: 'json' },
          },
        }),
      )
    return { tabs, post }
  }

  it('keeps each device’s todos, newest per item, cleared ones marked inactive', () => {
    const { tabs, post } = book()
    post({
      token: 't',
      records: [],
      todos: [
        { id: 'a', at: 1, text: 'Buy strings', done: false, active: true },
        { id: 'b', at: 1, text: 'Book the room', done: false, active: true },
      ],
    })
    const reply = post({
      token: 't',
      records: [],
      todos: [{ id: 'a', at: 2, text: 'Buy strings', done: true, active: false }],
    })
    expect(reply.ok).toBe(true)
    expect(reply.todos).toEqual([
      { id: 'a', at: 2, text: 'Buy strings', done: true, active: false },
      { id: 'b', at: 1, text: 'Book the room', done: false, active: true },
    ])
    expect(tabs.get('todos')?.[0]).toEqual(['id', 'at', 'text', 'done', 'active'])
  })

  it('keeps a todo as typed through the sheet, a formula never read as one', () => {
    const { tabs, post } = book()
    const text = '- capo 2\n=SUM(1)'
    post({
      token: 't',
      records: [],
      todos: [{ id: 'a', at: 1, text, done: false, active: true }],
    })
    expect(tabs.get('todos')?.[1]?.[2]).toBe(JSON.stringify(text))
    const reply = post({ token: 't', records: [] })
    expect(reply.todos).toEqual([{ id: 'a', at: 1, text, done: false, active: true }])
  })

  it('reads a todo written before text went in quoted as it is', () => {
    const { tabs, post } = book()
    post({ token: 't', records: [] })
    tabs.get('todos')?.push(['old', 1, 'Buy strings', false, true])
    expect(post({ token: 't', records: [] }).todos).toEqual([
      { id: 'old', at: 1, text: 'Buy strings', done: false, active: true },
    ])
  })
})
