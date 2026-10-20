import { stampAfter, type Band, type BandTodo, type Library } from './library.ts'
import { orphaned } from './model.ts'

/** The list as it is shown: what is left once cleared and removed ones go. */
export const activeBandTodos = (library: Library): readonly BandTodo[] =>
  library.todos.filter((todo) => todo.active)

/** Indented to carry on under the same item, as Enter in an indented last one does. */
export const addBandTodo = (
  library: Library,
  id: string,
  at: number,
  indented = false,
): Library => ({
  ...library,
  todos: [
    ...library.todos,
    {
      id,
      text: '',
      done: false,
      indented: indented && activeBandTodos(library).length > 0,
      active: true,
      updatedAt: at,
      syncedAt: null,
    },
  ],
})

/** Every change to an item is stamped, which is all another device compares by. */
const change = (
  library: Library,
  id: string,
  at: number,
  edit: (todo: BandTodo) => Partial<Pick<BandTodo, 'text' | 'done' | 'indented'>>,
): Library => ({
  ...library,
  todos: library.todos.map((todo) =>
    todo.id === id
      ? { ...todo, ...edit(todo), updatedAt: stampAfter(todo.updatedAt, at) }
      : todo,
  ),
})

export const setBandTodoText = (library: Library, id: string, text: string, at: number) =>
  change(library, id, at, () => ({ text }))

export const toggleBandTodo = (library: Library, id: string, at: number) =>
  change(library, id, at, (todo) => ({ done: !todo.done }))

/** Not under the first item shown, which has none above it, and stamped only if it changes. */
export const indentBandTodo = (
  library: Library,
  id: string,
  indented: boolean,
  at: number,
): Library => {
  const shown = activeBandTodos(library)
  const place = shown.findIndex((todo) => todo.id === id)
  return place < 1 || shown[place]?.indented === indented
    ? library
    : change(library, id, at, () => ({ indented }))
}

// The shown items that are `gone` marked inactive, and any that sat under one
// of them moved up a level; each one changed is stamped.
const withoutBandTodos = (
  library: Library,
  at: number,
  gone: (todo: BandTodo) => boolean,
): Library => {
  const shown = activeBandTodos(library)
  const orphans = orphaned(shown, (index) => {
    const todo = shown[index]
    return todo !== undefined && gone(todo)
  })
  const moved = new Set(
    shown.filter((_, index) => orphans.has(index)).map((todo) => todo.id),
  )
  return {
    ...library,
    todos: library.todos.map((todo) =>
      todo.active && gone(todo)
        ? { ...todo, active: false, updatedAt: stampAfter(todo.updatedAt, at) }
        : moved.has(todo.id)
          ? { ...todo, indented: false, updatedAt: stampAfter(todo.updatedAt, at) }
          : todo,
    ),
  }
}

export const removeBandTodo = (library: Library, id: string, at: number) =>
  withoutBandTodos(library, at, (todo) => todo.id === id)

/** Only the ticked ones still showing; anything already cleared keeps its stamp. */
export const clearDoneBandTodos = (library: Library, at: number): Library =>
  withoutBandTodos(library, at, (todo) => todo.done)

/** Stamped as a whole on every change, the way a song is. */
export const setBandField = (
  library: Library,
  field: keyof Band,
  text: string,
  at: number,
): Library => ({
  ...library,
  band: {
    ...library.band,
    [field]: {
      ...library.band[field],
      text,
      updatedAt: stampAfter(library.band[field].updatedAt, at),
    },
  },
})
