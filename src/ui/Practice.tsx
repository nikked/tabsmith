import { useEffect, useState } from 'react'
import type { Song } from '../core/model.ts'
import { songBlocks } from '../core/render.ts'

const STEPS = [0.8, 0.9, 1, 1.15, 1.35, 1.6] as const

/**
 * The screen sleeps in the middle of a verse otherwise, which is the one thing
 * paper on a music stand does better. Unsupported in some browsers and refused
 * in others, and neither is worth telling anyone about: the page reads fine, it
 * just dims.
 */
const useWakeLock = (): void => {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let dropped = false

    const hold = async () => {
      try {
        const held = await navigator.wakeLock?.request('screen')
        if (held === undefined) return
        if (dropped) await held.release()
        else lock = held
      } catch {
        // A denied lock is not a failure worth interrupting anyone over.
      }
    }

    // Coming back from another app releases it, so ask again.
    const reacquire = () => {
      if (document.visibilityState === 'visible') void hold()
    }

    void hold()
    document.addEventListener('visibilitychange', reacquire)
    return () => {
      dropped = true
      document.removeEventListener('visibilitychange', reacquire)
      void lock?.release()
    }
  }, [])
}

/**
 * The whole song in one scroll, set as large as it will go: this is the view
 * read from a music stand at arm's length, so the only controls are the size
 * and the way out, and both get out of the way of the page.
 */
export function Practice({
  song,
  onLeave,
}: {
  readonly song: Song
  readonly onLeave: () => void
}) {
  const [step, setStep] = useState(2)
  useWakeLock()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onLeave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onLeave])

  const scale = STEPS[step] ?? 1

  return (
    <section className="practice" style={{ fontSize: `${scale}rem` }}>
      <div className="practice-bar">
        <button
          type="button"
          aria-label="Smaller"
          disabled={step === 0}
          onClick={() => setStep((current) => current - 1)}
        >
          A−
        </button>
        <button
          type="button"
          aria-label="Bigger"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((current) => current + 1)}
        >
          A+
        </button>
        <button type="button" onClick={onLeave}>
          Done
        </button>
      </div>
      {songBlocks(song).map((block, index) => (
        <pre key={index}>{block}</pre>
      ))}
    </section>
  )
}
