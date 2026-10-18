import { useEffect, useRef, useState } from 'react'
import type { Row } from '../core/model.ts'
import { rowPlayback, rowSeconds } from '../core/playback.ts'
import { playRow } from './sound.ts'

/**
 * The quiet button after a tab row's title that plays the row, or stops it.
 * Drawn rather than a ▶ character, which a phone may set as a coloured emoji.
 */
export function RowPlay({
  playing,
  onClick,
}: {
  readonly playing: boolean
  readonly onClick: () => void
}) {
  const label = playing ? 'Stop' : 'Play the row'
  return (
    <button
      type="button"
      className="row-play"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        {playing ? (
          <rect x="1.5" y="1.5" width="7" height="7" />
        ) : (
          <path d="M2.5 1 L9.5 5 L2.5 9 Z" />
        )}
      </svg>
    </button>
  )
}

/**
 * Which tab row of the song is playing, by its place in the tab, since the tab
 * may be drawn afresh from a trimmed copy each time; and the one way to play a
 * row or stop it. Playing stops on leaving the song, or on playing another row.
 */
export const useRowPlayer = (songId: string) => {
  const [playing, setPlaying] = useState<{
    readonly song: string
    readonly index: number
  } | null>(null)
  const stopRow = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRow.current?.(), [songId])
  if (playing !== null && playing.song !== songId) setPlaying(null)

  const toggle = (index: number, row: Row, open: readonly number[], bpm: number) => {
    stopRow.current?.()
    stopRow.current = null
    if (playing?.song === songId && playing.index === index) {
      setPlaying(null)
      return
    }
    const stop = playRow(rowPlayback(row, open, bpm))
    const done = window.setTimeout(
      () => {
        stopRow.current = null
        setPlaying(null)
      },
      rowSeconds(row, bpm) * 1000,
    )
    stopRow.current = () => {
      stop()
      window.clearTimeout(done)
    }
    setPlaying({ song: songId, index })
  }

  return { playing: playing?.song === songId ? playing.index : null, toggle }
}
