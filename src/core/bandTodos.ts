import type { BandTodo, Library } from './library.ts'

/** The list as it is shown: what is left once cleared and removed ones go. */
export const activeBandTodos = (library: Library): readonly BandTodo[] =>
  library.todos.filter((todo) => todo.active)

export const addBandTodo = (library: Library, id: string, at: number): Library => ({
  ...library,
  todos: [...library.todos, { id, text: '', done: false, active: true, updatedAt: at }],
})

/** Every change to an item is stamped, which is all another device compares by. */
const change = (
  library: Library,
  id: string,
  at: number,
  edit: (todo: BandTodo) => Partial<Pick<BandTodo, 'text' | 'done' | 'active'>>,
): Library => ({
  ...library,
  todos: library.todos.map((todo) =>
    todo.id === id ? { ...todo, ...edit(todo), updatedAt: at } : todo,
  ),
})

export const setBandTodoText = (library: Library, id: string, text: string, at: number) =>
  change(library, id, at, () => ({ text }))

export const toggleBandTodo = (library: Library, id: string, at: number) =>
  change(library, id, at, (todo) => ({ done: !todo.done }))

export const removeBandTodo = (library: Library, id: string, at: number) =>
  change(library, id, at, () => ({ active: false }))

/** Only the ticked ones still showing; anything already cleared keeps its stamp. */
export const clearDoneBandTodos = (library: Library, at: number): Library => ({
  ...library,
  todos: library.todos.map((todo) =>
    todo.active && todo.done ? { ...todo, active: false, updatedAt: at } : todo,
  ),
})

/** Stamped as a whole on every change, the way a song is. */
export const setBandIdeas = (library: Library, text: string, at: number): Library => ({
  ...library,
  ideas: { text, updatedAt: at },
})
