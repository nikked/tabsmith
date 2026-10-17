import { describe, expect, it } from 'vitest'
import { mergeSong } from './mergeSong.ts'
import { emptyRow, emptySong, TUNINGS, type Song } from './model.ts'

const intro = { name: 'Intro', body: 'Em D' }
const verse = (body: string) => ({ name: 'Verse', body })
const chorus = { name: 'Chorus', body: 'C G' }

const base: Song = {
  ...emptySong(),
  title: 'Slow Machine',
  bpm: 70,
  chart: [intro, verse('Em D\nThe slow machine'), chorus],
  todos: [{ text: 'Bridge chords', done: false }],
}
const baseVerse = verse('Em D\nThe slow machine')

describe('mergeSong', () => {
  it('puts together edits to different sections and to the facts', () => {
    const mine = { ...base, bpm: 72, chart: [intro, verse('Em D\nmine'), chorus] }
    const theirs: Song = {
      ...base,
      key: 'Em',
      chart: [intro, baseVerse, { name: 'Chorus', body: 'C G D' }],
    }
    const merged = mergeSong(base, mine, theirs)
    expect(merged.clean).toBe(true)
    expect(merged.value).toMatchObject({ bpm: 72, key: 'Em' })
    expect(merged.value.chart.map((section) => section.body)).toEqual([
      'Em D',
      'Em D\nmine',
      'C G D',
    ])
  })

  it('collides on one section changed both ways, the sheet’s side standing in', () => {
    const mine = { ...base, chart: [intro, verse('mine'), chorus] }
    const theirs = { ...base, chart: [intro, verse('theirs'), chorus] }
    const merged = mergeSong(base, mine, theirs)
    expect(merged.clean).toBe(false)
    expect(merged.value.chart[1]?.body).toBe('theirs')
  })

  it('takes the same change made on both sides as one', () => {
    const both = { ...base, title: 'Slow Machine (live)' }
    expect(mergeSong(base, both, both)).toEqual({ value: both, clean: true })
  })

  it('keeps what both sides added at the end, each once', () => {
    const mine = {
      ...base,
      todos: [...base.todos, { text: 'Try capo 2', done: false }],
    }
    const theirs = {
      ...base,
      todos: [
        { text: 'Bridge chords', done: true },
        { text: 'Slower intro', done: false },
      ],
    }
    const merged = mergeSong(base, mine, theirs)
    expect(merged.clean).toBe(true)
    expect(merged.value.todos).toEqual([
      { text: 'Bridge chords', done: true },
      { text: 'Try capo 2', done: false },
      { text: 'Slower intro', done: false },
    ])
  })

  it('collides on a section deleted on one side and edited on the other', () => {
    const mine = { ...base, chart: base.chart.slice(0, 2) }
    const theirs = { ...base, chart: [intro, baseVerse, verse('more')] }
    expect(mergeSong(base, mine, theirs).clean).toBe(false)
    // Shortened on one side only, with nothing else changed there, is just taken.
    expect(mergeSong(base, mine, base)).toEqual({ value: mine, clean: true })
  })

  it('deletes one section and keeps an edit to another', () => {
    const mine = { ...base, chart: [verse('Em D\nThe slow machine'), chorus] }
    const theirs = {
      ...base,
      chart: [intro, baseVerse, { name: 'Chorus', body: 'C G D' }],
    }
    const merged = mergeSong(base, mine, theirs)
    expect(merged.clean).toBe(true)
    expect(merged.value.chart.map((section) => section.body)).toEqual([
      'Em D\nThe slow machine',
      'C G D',
    ])
  })

  it('clears done todos on one side and keeps a todo edited on the other', () => {
    const done = { text: 'Bridge chords', done: true }
    const todos = [
      done,
      { text: 'Capo?', done: false },
      { text: 'Count-in', done: false },
    ]
    const before = { ...base, todos }
    const cleared = { ...base, todos: todos.slice(1) }
    const edited = {
      ...base,
      todos: [done, { text: 'Capo 2', done: false }, { text: 'Count-in', done: true }],
    }
    const merged = mergeSong(before, cleared, edited)
    expect(merged.clean).toBe(true)
    expect(merged.value.todos).toEqual([
      { text: 'Capo 2', done: false },
      { text: 'Count-in', done: true },
    ])
  })

  it('keeps a section added in the middle beside an edit further on', () => {
    const bridge = { name: 'Bridge', body: 'Am' }
    const mine = { ...base, chart: [intro, bridge, baseVerse, chorus] }
    const theirs = {
      ...base,
      chart: [intro, baseVerse, { name: 'Chorus', body: 'C G D' }],
    }
    const merged = mergeSong(base, mine, theirs)
    expect(merged.clean).toBe(true)
    expect(merged.value.chart.map((section) => section.name)).toEqual([
      'Intro',
      'Bridge',
      'Verse',
      'Chorus',
    ])
    expect(merged.value.chart[3]?.body).toBe('C G D')
  })

  it('merges the tab row by row, but as one part when the tuning changed', () => {
    const row = emptyRow(1, 4, 6)
    const tabbed = { ...base, tab: { ...base.tab, rows: [row, row] } }
    const mine = {
      ...tabbed,
      tab: { ...tabbed.tab, rows: [{ ...row, title: 'Riff' }, row] },
    }
    const theirs = {
      ...tabbed,
      tab: { ...tabbed.tab, rows: [row, { ...row, title: 'Outro' }] },
    }
    const merged = mergeSong(tabbed, mine, theirs)
    expect(merged.clean).toBe(true)
    expect(merged.value.tab.rows.map((row) => row.title)).toEqual(['Riff', 'Outro'])

    const retuned = { ...theirs, tab: { ...theirs.tab, tuning: TUNINGS[1] } }
    expect(mergeSong(tabbed, mine, retuned).clean).toBe(false)
  })
})
