import { describe, expect, it } from 'vitest'
import { songHasContent } from './core/edit.ts'
import { renderSong } from './core/render.ts'
import { DEMO } from './demo.ts'

/**
 * demo.json is meant to be replaced by any song saved out of the app, so these
 * assert the contract it has to keep — decodable, and worth showing — and not
 * which song it happens to be. A test that named the notes would fail the first
 * time someone swapped the file, which is the one thing it must not do.
 */
describe('the demo song', () => {
  it('is a file the schema accepts', () => {
    expect(DEMO.ok || `demo.json did not decode: ${DEMO.error}`).toBe(true)
  })

  it('has something in it, so the button is worth pressing', () => {
    if (!DEMO.ok) throw new Error(DEMO.error)
    expect(songHasContent(DEMO.song)).toBe(true)
    expect(renderSong(DEMO.song).trim()).not.toBe('')
  })
})
