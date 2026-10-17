import { describe, expect, it } from 'vitest'
import {
  activeBandTodos,
  addBandTodo,
  clearDoneBandTodos,
  removeBandTodo,
  setBandTodoText,
  toggleBandTodo,
} from './bandTodos.ts'
import type { BandTodo, Library } from './library.ts'
import { emptySong } from './model.ts'
import { forgetSent, mergeTodos } from './sync.ts'

const shelf: Library = {
  songs: [{ id: 's', song: emptySong(), updatedAt: 0 }],
  open: 's',
  removed: [],
  setlists: [],
  todos: [],
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

describe('syncing band todos', () => {
  const todo = (id: string, text: string, at: number, active = true): BandTodo => ({
    id,
    text,
    done: false,
    active,
    updatedAt: at,
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
