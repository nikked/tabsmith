import type { Action } from './edit.ts'
import type { Link } from './model.ts'

export type KeyPress = {
  readonly key: string
  readonly shiftKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
}

const LINKS: Readonly<Record<string, Link>> = {
  h: 'h',
  p: 'p',
  '/': '/',
  '\\': '\\',
}

const MOVES: Readonly<Record<string, Action>> = {
  ArrowLeft: { kind: 'move', move: 'prevColumn' },
  ArrowRight: { kind: 'move', move: 'nextColumn' },
  ArrowUp: { kind: 'move', move: 'stringUp' },
  ArrowDown: { kind: 'move', move: 'stringDown' },
  ' ': { kind: 'move', move: 'nextColumn' },
  Home: { kind: 'move', move: 'barStart' },
  End: { kind: 'move', move: 'barEnd' },
  Backspace: { kind: 'clear' },
  Delete: { kind: 'clear' },
  ']': { kind: 'addColumn' },
  '[': { kind: 'removeColumn' },
  '}': { kind: 'addRow' },
  '{': { kind: 'removeRow' },
  x: { kind: 'mute' },
  b: { kind: 'bend' },
  '~': { kind: 'vibrato' },
}

export const keyToAction = (event: KeyPress): Action | null => {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) {
    return null
  }

  const { key } = event

  if (key.length === 1 && key >= '0' && key <= '9') {
    return { kind: 'digit', digit: Number(key) }
  }

  if (key === 'Enter') {
    return event.shiftKey === true ? { kind: 'removeBar' } : { kind: 'addBar' }
  }

  if (key === 'Tab') {
    return { kind: 'move', move: event.shiftKey === true ? 'prevBar' : 'nextBar' }
  }

  const link = LINKS[key]
  if (link !== undefined) return { kind: 'link', link }

  return MOVES[key] ?? null
}
