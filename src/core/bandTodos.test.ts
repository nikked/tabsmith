import { describe, expect, it } from 'vitest'
import {
  activeBandTodos,
  addBandTodo,
  clearDoneBandTodos,
  removeBandTodo,
  setBandTodoText,
  toggleBandTodo,
} from './bandTodos.ts'
import type { Library } from './library.ts'
import { emptySong } from './model.ts'

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
