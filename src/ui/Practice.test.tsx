import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { emptySong, type Song } from '../core/model.ts'
import { Practice } from './Practice.tsx'

afterEach(() => vi.unstubAllGlobals())

it('preserves note duration and rest bars when reading notation', () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'tabsmith.reading' ? 'notation' : null),
  })
  const empty = emptySong()
  const song: Song = {
    ...empty,
    tab: {
      ...empty.tab,
      rows: [
        {
          bars: [
            {
              columns: Array.from({ length: 8 }, (_, i) => ({
                cells: [
                  i === 0 ? { kind: 'fret' as const, fret: 0 } : null,
                  null,
                  null,
                  null,
                  null,
                  null,
                ],
              })),
            },
            {
              columns: Array.from({ length: 8 }, () => ({
                cells: [null, null, null, null, null, null],
              })),
            },
          ],
        },
      ],
    },
  }
  const html = renderToStaticMarkup(
    <Practice song={song} songId="s" onLeave={() => {}} />,
  )
  expect(html).toContain('\uE0A2') // Whole note.
  expect(html).toContain('\uE4E3') // Whole rest.
  expect(html.match(/class="measure-end"/g)).toHaveLength(2)
})
