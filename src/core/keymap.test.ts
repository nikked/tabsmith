import { describe, expect, it } from 'vitest'
import { apply, initialState } from './edit.ts'
import { keyToAction } from './keymap.ts'
import { TUNINGS, type EditorState } from './model.ts'
import { renderScore } from './render.ts'

const [, DROP_D] = TUNINGS

const type = (state: EditorState, ...keys: readonly string[]): EditorState =>
  keys.reduce((acc, key) => {
    const action = keyToAction({ key })
    return action === null ? acc : apply(acc, action)
  }, state)

describe('keyToAction', () => {
  it('maps digits', () => {
    expect(keyToAction({ key: '0' })).toEqual({ kind: 'digit', digit: 0 })
    expect(keyToAction({ key: '9' })).toEqual({ kind: 'digit', digit: 9 })
  })

  it('maps techniques', () => {
    expect(keyToAction({ key: 'x' })).toEqual({ kind: 'mute' })
    expect(keyToAction({ key: 'b' })).toEqual({ kind: 'bend' })
    expect(keyToAction({ key: '~' })).toEqual({ kind: 'vibrato' })
    expect(keyToAction({ key: 'h' })).toEqual({ kind: 'link', link: 'h' })
    expect(keyToAction({ key: 'p' })).toEqual({ kind: 'link', link: 'p' })
    expect(keyToAction({ key: '/' })).toEqual({ kind: 'link', link: '/' })
    expect(keyToAction({ key: '\\' })).toEqual({ kind: 'link', link: '\\' })
  })

  it('maps the arrows, and nothing else, to movement', () => {
    expect(keyToAction({ key: 'ArrowRight' })).toEqual({
      kind: 'move',
      move: 'nextColumn',
    })
    expect(keyToAction({ key: 'ArrowLeft' })).toEqual({
      kind: 'move',
      move: 'prevColumn',
    })
    expect(keyToAction({ key: 'ArrowUp' })).toEqual({ kind: 'move', move: 'stringUp' })
    expect(keyToAction({ key: 'ArrowDown' })).toEqual({
      kind: 'move',
      move: 'stringDown',
    })
  })

  it('leaves the keys that used to duplicate the arrows alone', () => {
    expect(keyToAction({ key: ' ' })).toBeNull()
    expect(keyToAction({ key: 'Home' })).toBeNull()
    expect(keyToAction({ key: 'End' })).toBeNull()
  })

  it('maps Tab by shift state', () => {
    expect(keyToAction({ key: 'Tab' })).toEqual({ kind: 'move', move: 'nextBar' })
    expect(keyToAction({ key: 'Tab', shiftKey: true })).toEqual({
      kind: 'move',
      move: 'prevBar',
    })
  })

  it('maps Enter by shift state', () => {
    expect(keyToAction({ key: 'Enter' })).toEqual({ kind: 'addBar' })
    expect(keyToAction({ key: 'Enter', shiftKey: true })).toEqual({
      kind: 'removeBar',
    })
  })

  it('maps structure and clearing keys', () => {
    expect(keyToAction({ key: 'Enter' })).toEqual({ kind: 'addBar' })
    expect(keyToAction({ key: ']' })).toEqual({ kind: 'addColumn' })
    expect(keyToAction({ key: '[' })).toEqual({ kind: 'removeColumn' })
    expect(keyToAction({ key: '}' })).toEqual({ kind: 'addRow' })
    expect(keyToAction({ key: '{' })).toEqual({ kind: 'removeRow' })
    expect(keyToAction({ key: 'Backspace' })).toEqual({ kind: 'clear' })
    expect(keyToAction({ key: 'Delete' })).toEqual({ kind: 'clear' })
  })

  it('ignores modified and unknown keys', () => {
    expect(keyToAction({ key: 'r', metaKey: true })).toBeNull()
    expect(keyToAction({ key: '5', ctrlKey: true })).toBeNull()
    expect(keyToAction({ key: 'b', altKey: true })).toBeNull()
    expect(keyToAction({ key: 'q' })).toBeNull()
    expect(keyToAction({ key: 'F5' })).toBeNull()
  })
})

describe('typing a riff', () => {
  it('renders the ASCII the keys describe', () => {
    const state = type(
      initialState(),
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      '0',
      'ArrowRight',
      '0',
      'ArrowRight',
      '3',
      'ArrowRight',
      'x',
      'ArrowRight',
      'ArrowUp',
      '5',
      'ArrowRight',
      '7',
      'h',
      'ArrowRight',
      'ArrowUp',
      'ArrowUp',
      '1',
      '2',
      'b',
      '1',
      '4',
    )
    expect(renderScore(state.song.tab)).toBe(
      [
        'e|----------------------------|-----------------------|',
        'B|----------------------------|-----------------------|',
        'G|-------------12b14----------|-----------------------|',
        'D|----------------------------|-----------------------|',
        'A|--------5-h7----------------|-----------------------|',
        'E|0-0-3-x---------------------|-----------------------|',
      ].join('\n'),
    )
  })
})

describe('switching Standard to Drop D', () => {
  it('changes only the low row label', () => {
    const state = type(
      initialState(),
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      'ArrowDown',
      '1',
      '2',
      'ArrowRight',
      '5',
      'h',
      'ArrowRight',
      '7',
    )
    const before = renderScore(state.song.tab).split('\n')
    const after = renderScore(
      apply(state, { kind: 'retune', tuning: DROP_D }).song.tab,
    ).split('\n')

    expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
    expect(before.at(-1)?.startsWith('E|')).toBe(true)
    expect(after.at(-1)?.startsWith('D|')).toBe(true)
    expect(after.at(-1)?.slice(1)).toBe(before.at(-1)?.slice(1))
  })
})
