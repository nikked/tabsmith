import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { scoreHasContent } from '../core/edit.ts'
import type { Score, Song, Spacing } from '../core/model.ts'
import type { Place } from '../core/setlists.ts'
import { sectionHeading, songParts, staffText, type Part } from '../core/render.ts'
import { Menu, MenuChecks, MenuItems, type MenuItem } from './Menu.tsx'
import { Toggle } from './Toggle.tsx'
import { loadViews, saveViews, withView, type View, type Views } from '../viewing.ts'

const STEPS = [0.7, 0.8, 0.9, 1, 1.15, 1.35, 1.6] as const

/**
 * The sizes Practice picks on its own, to fit the whole song on the screen:
 * from the normal size down to the smallest still readable on an iPad. A short
 * song is not blown up past normal — it already fits — and one that does not
 * fit even at the smallest scrolls rather than shrinking past reading. The
 * bigger sizes are only ever asked for.
 */
const FITS = { smallest: 0, largest: 3 } as const

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

/** Corners pointing out to go full screen, and in to come back. */
const FullScreenIcon = ({ exit }: { readonly exit: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {exit ? (
      <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
    ) : (
      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
    )}
  </svg>
)

/** Ten characters in the ruler, so rounding one glyph's width does not add up. */
const RULER = '0000000000'

/**
 * The column's width, and one character's width at size 1 (1rem): the second
 * holds whatever size is on screen, so it can say how wide the song would be at
 * a size it is not shown at yet.
 */
type Measure = { readonly width: number; readonly charAtOne: number }

/**
 * How wide the column is and how wide the song's monospace runs, read off the
 * width probe and the ruler inside it. Null before either has a size.
 */
const measureOf = (box: HTMLElement, glyphs: HTMLElement): Measure | null => {
  const char = glyphs.getBoundingClientRect().width / RULER.length
  const size = Number.parseFloat(getComputedStyle(glyphs).fontSize)
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return char > 0 && size > 0
    ? { width: box.clientWidth, charAtOne: (char / size) * rem }
    : null
}

/** Whether the song runs past the first screen, or any line of it off the side. */
const overflows = (page: HTMLElement): boolean =>
  page.getBoundingClientRect().bottom + window.scrollY > window.innerHeight ||
  [...page.querySelectorAll('pre')].some((block) => block.scrollWidth > block.clientWidth)

const partView =
  (tab: Score, spacing: Spacing, columns: number) => (part: Part, index: number) => {
    switch (part.kind) {
      case 'tempo':
        return <p key={index}>{part.text}</p>
      case 'system':
        return (
          <div key={index}>
            {part.title !== '' && <h4>{part.title}</h4>}
            {part.note !== '' && <p className="tab-note">{part.note}</p>}
            <pre>{staffText(tab, part.row, spacing, columns)}</pre>
          </div>
        )
      case 'section':
        return (
          <div key={index}>
            {part.section.name !== '' && <h3>{sectionHeading(part.section)}</h3>}
            {part.section.body !== '' && <pre>{part.section.body}</pre>}
          </div>
        )
    }
  }

/**
 * The whole song in one scroll, set as large as it will go: this is the view
 * read from a music stand at arm's length, so the only controls are the size
 * and the way out, and both get out of the way of the page.
 */
type Props = {
  readonly song: Song
  /** Which song this is, so a new one is fitted afresh. */
  readonly songId: string
  readonly onLeave: () => void
  /** Present only for a song that arrived by link and is not yours yet. */
  readonly onKeep?: () => void
  /** Where the song sits in the setlist it was opened from, if one. */
  readonly place?: Place | null
  readonly onStep?: (song: string) => void
  /** Whether the header is hidden for the song; absent for a song from a link. */
  readonly full?: boolean
  readonly onFull?: (full: boolean) => void
}

export function Practice({
  song,
  songId,
  onLeave,
  onKeep,
  place = null,
  onStep,
  full = false,
  onFull,
}: Props) {
  // How this song is shown on this device: a size chosen for it with A− or
  // A+, or none and it is fitted to the screen; and whether its tab is dense.
  const [views, setViews] = useState<Views>(loadViews)
  const view = views[songId] ?? {}
  const remember = (change: View) => {
    const next = withView(views, songId, change)
    saveViews(next)
    setViews(next)
  }
  const index =
    view.size === undefined ? -1 : STEPS.findIndex((size) => size === view.size)
  const chosen = index < 0 ? null : index
  const dense = view.dense === true
  const spacing: Spacing = dense ? 'dense' : 'sparse'
  const hasTab = scoreHasContent(song.tab)
  const [fit, setFit] = useState<{ readonly step: number; readonly settled: boolean }>({
    step: FITS.largest,
    settled: false,
  })
  const [measure, setMeasure] = useState<Measure | null>(null)
  const songBox = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLSpanElement>(null)
  useWakeLock()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [songId])

  /**
   * Measures, and shrinks the song a step at a time until all of it fits on the
   * first screen, before anything is painted: each step is measured and the next
   * taken in the same frame, so the song appears at its size rather than visibly
   * shrinking into it. It stops once the song fits or reaches the smallest size.
   */
  useLayoutEffect(() => {
    const box = column.current
    const glyphs = ruler.current
    const page = songBox.current
    if (box === null || glyphs === null || page === null) return
    const now = measureOf(box, glyphs)
    if (
      now !== null &&
      (measure === null ||
        now.width !== measure.width ||
        now.charAtOne !== measure.charAtOne)
    ) {
      setMeasure(now)
      return
    }
    if (chosen !== null || fit.settled || measure === null) return
    setFit(
      overflows(page) && fit.step > FITS.smallest
        ? { step: fit.step - 1, settled: false }
        : { step: fit.step, settled: true },
    )
  }, [chosen, fit, measure])

  // A screen that changed size — turning an iPad — fits differently, so start over.
  useEffect(() => {
    const refit = () => setFit({ step: FITS.largest, settled: false })
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onLeave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onLeave])

  /** A menu item to the song either side, greyed out at the end of the setlist. */
  const stepTo = (target: string | null, icon: string, label: string): MenuItem => ({
    icon,
    label,
    keepsOpen: true,
    disabled: target === null,
    onSelect: () => {
      if (target !== null) onStep?.(target)
    },
  })

  const choose = (next: number) => {
    const size = STEPS[next]
    if (size !== undefined) remember({ size })
  }

  // Dense changes how wide the tab runs, so the size is fitted again for it.
  const toggleDense = () => {
    remember({ dense: !dense })
    setFit({ step: FITS.largest, settled: false })
  }

  // A new song is fitted afresh. Done here rather than by remounting, so the
  // menu stays open while stepping through songs.
  const [fittedFor, setFittedFor] = useState(songId)
  if (fittedFor !== songId) {
    setFittedFor(songId)
    setFit({ step: FITS.largest, settled: false })
  }

  const step = chosen ?? fit.step
  const scale = STEPS[step] ?? 1
  const columns =
    measure === null
      ? Number.POSITIVE_INFINITY
      : Math.floor(measure.width / (measure.charAtOne * scale))

  return (
    <section className="practice" style={{ fontSize: `${scale}rem` }}>
      <div className="practice-bar">
        {/* The song's heading lives here rather than above the song, so it is
            always in sight and the song starts right under the bar. */}
        <h2 className="bar-title">{song.title}</h2>
        {/* On a phone every control below folds into this one menu, so the bar
            is the song's title and nothing else that takes a line. */}
        <div className="bar-more">
          <Menu label="⋯" title="Practice options">
            <div className="menu-row" role="group" aria-label="Text size">
              <button
                type="button"
                aria-label="Smaller text"
                disabled={step === 0}
                onClick={() => choose(step - 1)}
              >
                A−
              </button>
              <button
                type="button"
                aria-label="Bigger text"
                disabled={step === STEPS.length - 1}
                onClick={() => choose(step + 1)}
              >
                A+
              </button>
            </div>
            {place !== null && onStep !== undefined && (
              <>
                <p className="menu-label">
                  {place.setlist.name} {place.index + 1}/{place.count}
                </p>
                <MenuItems
                  items={[
                    stepTo(place.previous, '‹', 'Previous song'),
                    stepTo(place.next, '›', 'Next song'),
                  ]}
                />
              </>
            )}
            {hasTab && (
              <MenuChecks
                items={[
                  { id: 'dense', label: 'Dense', checked: dense, onToggle: toggleDense },
                ]}
              />
            )}
          </Menu>
        </div>
        {/* Spacing is only about tab, so a song with none has nothing to set.
            On a phone it moves into the menu above, sparse being the default. */}
        {hasTab && (
          <Toggle
            small
            label="Spacing between notes"
            options={[
              { value: 'dense', label: 'Dense', title: '2-2' },
              { value: 'sparse', label: 'Sparse', title: '2--2' },
            ]}
            value={spacing}
            onChange={(next) => {
              if (next !== spacing) toggleDense()
            }}
          />
        )}
        <button
          type="button"
          className="size"
          aria-label="Smaller"
          disabled={step === 0}
          onClick={() => choose(step - 1)}
        >
          A−
        </button>
        <button
          type="button"
          className="size"
          aria-label="Bigger"
          disabled={step === STEPS.length - 1}
          onClick={() => choose(step + 1)}
        >
          A+
        </button>
        {onFull !== undefined && (
          <button
            type="button"
            className="full-toggle"
            aria-label={full ? 'Exit full screen' : 'Full screen'}
            aria-pressed={full}
            title={full ? 'Exit full screen' : 'Full screen'}
            onClick={() => onFull(!full)}
          >
            <FullScreenIcon exit={full} />
          </button>
        )}
        {place !== null && onStep !== undefined && (
          <div
            className="setlist-step"
            role="group"
            aria-label={`${place.setlist.name} setlist`}
          >
            <button
              type="button"
              aria-label="Previous song"
              disabled={place.previous === null}
              onClick={() => place.previous !== null && onStep(place.previous)}
            >
              ‹
            </button>
            <span className="step-where">
              {place.setlist.name}{' '}
              <span className="step-count">
                {place.index + 1}/{place.count}
              </span>
            </span>
            <button
              type="button"
              aria-label="Next song"
              disabled={place.next === null}
              onClick={() => place.next !== null && onStep(place.next)}
            >
              ›
            </button>
          </div>
        )}
        {onKeep !== undefined && (
          <>
            <button type="button" onClick={onKeep}>
              Add to my songs
            </button>
            <button type="button" onClick={onLeave}>
              Not now
            </button>
          </>
        )}
      </div>
      <div ref={column} className="practice-width" aria-hidden="true">
        <span ref={ruler} className="practice-ruler">
          {RULER}
        </span>
      </div>
      <div ref={songBox} className="practice-song">
        {songParts(song).map(partView(song.tab, spacing, columns))}
      </div>
    </section>
  )
}
