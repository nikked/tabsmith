import { describe, expect, it } from 'vitest'
import {
  activeBandTodos,
  addBandTodo,
  clearDoneBandTodos,
  indentBandTodo,
  removeBandTodo,
  setBandField,
  setBandTodoText,
  toggleBandTodo,
} from './bandTodos.ts'
import type { BandTodo, Library } from './library.ts'
import { emptySong } from './model.ts'
import { forgetSent, mergeBand, mergeTodos } from './sync.ts'

const shelf: Library = {
  songs: [{ id: 's', song: emptySong(), updatedAt: 0, lastSynced: null }],
  open: 's',
  removed: [],
  setlists: [],
  todos: [],
  band: {
    name: { text: '', updatedAt: 0, syncedAt: null },
    ideas: { text: '', updatedAt: 0, syncedAt: null },
  },
}

const listed = (library: Library) =>
  activeBandTodos(library).map(({ text, done }) => [text, done])

const strings = setBandTodoText(addBandTodo(shelf, 'a', 1), 'a', 'Buy strings', 2)
const room = setBandTodoText(addBandTodo(strings, 'b', 3), 'b', 'Book the room', 4)

describe('band todos', () => {
  it('adds an empty item and stamps each edit to it', () => {
    expect(listed(room)).toEqual([
      ['Buy strings', false],
      ['Book the room', false],
    ])
    expect(room.todos.map((todo) => todo.updatedAt)).toEqual([2, 4])
  })

  it('ticks one item, leaving the other and its stamp alone', () => {
    const ticked = toggleBandTodo(room, 'a', 5)
    expect(listed(ticked)).toEqual([
      ['Buy strings', true],
      ['Book the room', false],
    ])
    expect(ticked.todos.map((todo) => todo.updatedAt)).toEqual([5, 4])
  })

  it('clears the ticked ones by marking them inactive, not by forgetting them', () => {
    const cleared = clearDoneBandTodos(toggleBandTodo(room, 'a', 5), 6)
    expect(listed(cleared)).toEqual([['Book the room', false]])
    expect(cleared.todos.find((todo) => todo.id === 'a')).toMatchObject({
      active: false,
      updatedAt: 6,
    })
    expect(cleared.todos.find((todo) => todo.id === 'b')?.updatedAt).toBe(4)
  })

  it('removes one the same way', () => {
    const removed = removeBandTodo(room, 'b', 7)
    expect(listed(removed)).toEqual([['Buy strings', false]])
    expect(removed.todos).toHaveLength(2)
  })
})

describe('indented band todos', () => {
  const shape = (library: Library) =>
    activeBandTodos(library).map(({ text, indented }) => `${indented ? '  ' : ''}${text}`)
  const stampOf = (library: Library, id: string) =>
    library.todos.find((todo) => todo.id === id)?.updatedAt
  // Buy strings, with Book the room and Pay the room under it.
  const nested = indentBandTodo(
    indentBandTodo(
      setBandTodoText(addBandTodo(room, 'c', 5), 'c', 'Pay the room', 6),
      'b',
      true,
      7,
    ),
    'c',
    true,
    8,
  )

  it('indents an item under the one above, stamped as any change is', () => {
    expect(shape(nested)).toEqual(['Buy strings', '  Book the room', '  Pay the room'])
    expect(stampOf(nested, 'b')).toBe(7)
    const out = indentBandTodo(nested, 'c', false, 9)
    expect(shape(out)).toEqual(['Buy strings', '  Book the room', 'Pay the room'])
  })

  it('never indents the first item shown, nor stamps one left as it was', () => {
    expect(indentBandTodo(room, 'a', true, 9)).toBe(room)
    expect(indentBandTodo(nested, 'b', true, 9)).toBe(nested)
    // The first shown once the one before it is cleared.
    const first = removeBandTodo(room, 'a', 9)
    expect(indentBandTodo(first, 'b', true, 10)).toBe(first)
  })

  it('adds an item indented when asked, but never as the first', () => {
    expect(shape(addBandTodo(nested, 'd', 9, true)).at(-1)).toBe('  ')
    expect(addBandTodo(shelf, 'd', 9, true).todos[0]?.indented).toBe(false)
  })

  it('moves the items under a removed one up a level, stamping them', () => {
    const removed = removeBandTodo(nested, 'a', 9)
    expect(shape(removed)).toEqual(['Book the room', 'Pay the room'])
    expect([stampOf(removed, 'b'), stampOf(removed, 'c')]).toEqual([9, 9])
  })

  it('moves them up the same way when the one they sat under is cleared', () => {
    const cleared = clearDoneBandTodos(toggleBandTodo(nested, 'a', 9), 10)
    expect(shape(cleared)).toEqual(['Book the room', 'Pay the room'])
  })

  it('leaves the items under another one alone', () => {
    const removed = removeBandTodo(nested, 'c', 9)
    expect(shape(removed)).toEqual(['Buy strings', '  Book the room'])
    expect(stampOf(removed, 'b')).toBe(7)
  })
})

describe('the band', () => {
  it('keeps its name and ideas as typed, each stamped on its own', () => {
    const named = setBandField(shelf, 'name', 'Fättig', 8)
    const both = setBandField(named, 'ideas', 'A song about the van\n  slow', 9)
    expect(both.band).toEqual({
      name: { text: 'Fättig', updatedAt: 8, syncedAt: null },
      ideas: { text: 'A song about the van\n  slow', updatedAt: 9, syncedAt: null },
    })
  })
})

describe('syncing the band', () => {
  const here = setBandField(setBandField(shelf, 'name', 'Mine', 5), 'ideas', 'Mine', 5)

  it('takes each newer text whole, field by field', () => {
    const merged = mergeBand(here, {
      name: { text: 'Theirs', updatedAt: 6, syncedAt: null },
      ideas: { text: 'Older', updatedAt: 4, syncedAt: null },
    })
    expect(merged.band).toEqual({
      name: { text: 'Theirs', updatedAt: 6, syncedAt: null },
      ideas: { text: 'Mine', updatedAt: 5, syncedAt: null },
    })
  })

  it('comes back as it was on a tie or when nothing came', () => {
    expect(
      mergeBand(here, { name: { text: 'Theirs', updatedAt: 5, syncedAt: null } }),
    ).toBe(here)
    expect(mergeBand(here, {})).toBe(here)
  })
})

describe('syncing band todos', () => {
  const todo = (id: string, text: string, at: number, active = true): BandTodo => ({
    id,
    text,
    done: false,
    indented: false,
    active,
    updatedAt: at,
    syncedAt: null,
  })
  const here: Library = {
    ...shelf,
    todos: [todo('a', 'Buy strings', 5), todo('b', 'Book the room', 5)],
  }

  it('takes the newer copy of each item and keeps this one on a tie', () => {
    const merged = mergeTodos(here, [todo('a', 'Buy 10s', 6), todo('b', 'Book it', 5)])
    expect(merged.todos.map((each) => each.text)).toEqual(['Buy 10s', 'Book the room'])
  })

  it('adds new items at the end, but not ones cleared before this device saw them', () => {
    const merged = mergeTodos(here, [todo('c', 'Tune', 1), todo('d', 'Old', 1, false)])
    expect(merged.todos.map((each) => each.id)).toEqual(['a', 'b', 'c'])
  })

  it('takes an item cleared elsewhere off this device', () => {
    expect(
      mergeTodos(here, [todo('a', 'Buy strings', 7, false)]).todos.map((each) => each.id),
    ).toEqual(['b'])
  })

  it('comes back as it was when nothing newer arrived', () => {
    expect(mergeTodos(here, [todo('a', 'Buy strings', 4)])).toBe(here)
  })

  it('forgets cleared items once a sync has sent them, not ones cleared since', () => {
    const sent: Library = {
      ...here,
      todos: [todo('a', 'Buy strings', 6, false), here.todos[1] ?? todo('b', '', 0)],
    }
    const now: Library = { ...sent, todos: [...sent.todos, todo('c', 'Tune', 8, false)] }
    expect(forgetSent(now, sent).todos.map((each) => each.id)).toEqual(['b', 'c'])
  })
})
