import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { scoreHasContent } from '../core/edit.ts'
import type { Key, Score, Song, Spacing } from '../core/model.ts'
import type { Place } from '../core/setlists.ts'
import {
  repeatText,
  songParts,
  staffLines,
  tabPieces,
  trimScore,
  type Part,
} from '../core/render.ts'
import { Menu, MenuChecks, MenuItems, type MenuItem } from './Menu.tsx'
import {
  HIGHEST_TARGET,
  HOLD,
  LOWEST_TARGET,
  offsetFor,
  referenceOf,
  silence,
  slowDb,
  type Level,
} from '../core/level.ts'
import { FIFTHS, notation, recognizedChords } from '../core/notation.ts'
import { synthSummary } from '../core/synths.ts'
import { NotedLines } from './NotedLines.tsx'
import { Notation } from './Notation.tsx'
import { Prompt } from './Prompt.tsx'
import { SoundLevel, type MicTrouble } from './SoundLevel.tsx'
import { Toggle } from './Toggle.tsx'
import {
  loadMeter,
  loadReading,
  loadSynthsShown,
  loadViews,
  saveMeter,
  saveReading,
  saveSynthsShown,
  saveViews,
  withView,
  type Meter,
  type Reading,
  type View,
  type Views,
} from '../viewing.ts'

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

const onVisibility = (change: () => void) => {
  document.addEventListener('visibilitychange', change)
  return () => document.removeEventListener('visibilitychange', change)
}
const pageVisible = () => document.visibilityState === 'visible'

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
type Measure = {
  readonly width: number
  readonly charAtOne: number
  readonly rem: number
}

/**
 * How wide the column is and how wide the song's monospace runs, read off the
 * width probe and the ruler inside it. Null before either has a size.
 */
const measureOf = (box: HTMLElement, glyphs: HTMLElement): Measure | null => {
  const char = glyphs.getBoundingClientRect().width / RULER.length
  const size = Number.parseFloat(getComputedStyle(glyphs).fontSize)
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return char > 0 && size > 0
    ? { width: box.clientWidth, charAtOne: (char / size) * rem, rem }
    : null
}

/** Whether the song runs past the first screen, or any line of it off the side. */
const overflows = (page: HTMLElement): boolean =>
  page.getBoundingClientRect().bottom + window.scrollY > window.innerHeight ||
  [...page.querySelectorAll('pre')].some((block) => block.scrollWidth > block.clientWidth)

const partView =
  (tab: Score, key: Key | null, spacing: Spacing, columns: number, width: number) =>
  (part: Part, index: number) => {
    switch (part.kind) {
      case 'synths':
        return (
          <dl key={index} className="synth-list">
            {part.synths.map((synth, i) => {
              const { name, sound, dials, knobs } = synthSummary(synth)
              return (
                <Fragment key={i}>
                  <dt>
                    {/* Both always there, even blank: each is a column of the panel. */}
                    <span className={name === '' ? undefined : 'synth-name'}>{name}</span>
                    <span className="synth-sound">{sound}</span>
                  </dt>
                  <dd>
                    {(
                      [
                        ['dial', 'Dial', dials],
                        ['knob', 'Knob', knobs],
                      ] as const
                    ).flatMap(([kind, name, controls]) =>
                      controls.map((control) => (
                        <span
                          key={`${kind}${control.number}`}
                          className={`synth-setting ${kind}`}
                          title={`${name} ${control.number}`}
                        >
                          <span
                            className="synth-mark"
                            aria-label={`${name} ${control.number}`}
                          >
                            {control.number}
                          </span>
                          {control.value}
                        </span>
                      )),
                    )}
                  </dd>
                </Fragment>
              )
            })}
          </dl>
        )
      case 'facts':
        return (
          <p key={index} className="facts">
            {part.facts.map((fact, i) => (
              <span key={i} className="chip">
                {fact}
              </span>
            ))}
          </p>
        )
      case 'system':
        return (
          <div key={index}>
            {part.title !== '' && <h4>{part.title}</h4>}
            {part.note !== '' && <p className="tab-note">{part.note}</p>}
            <pre className="tab-text">
              {staffLines(tab, part.row, spacing, columns).map(
                ({ text, aside, chords }, line) => (
                  <Fragment key={line}>
                    {line > 0 && '\n'}
                    {chords ? (
                      <span className="chord-line">{text}</span>
                    ) : (
                      tabPieces(text).map((piece, at) => (
                        <span key={at} className={`piece-${piece.kind}`}>
                          {piece.text}
                        </span>
                      ))
                    )}
                    {aside !== null && <span className="tab-aside"> {aside}</span>}
                  </Fragment>
                ),
              )}
            </pre>
          </div>
        )
      case 'notation':
        return (
          <Notation
            key={index}
            systems={notation(tab, key)}
            width={width}
            fifths={key === null ? 0 : FIFTHS[key]}
          />
        )
      case 'section':
        return (
          <div key={index}>
            {part.section.name !== '' && (
              <h3>
                {part.section.name}
                <span className="repeat-count">{repeatText(part.section)}</span>
              </h3>
            )}
            {part.section.body !== '' && (
              <pre>
                <NotedLines body={part.section.body} />
              </pre>
            )}
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
  const [reading, setReading] = useState<Reading>(loadReading)
  const asNotation = reading === 'notation'
  const spacing: Spacing = dense ? 'dense' : 'sparse'
  const hasTab = scoreHasContent(song.tab)
  const [showSynths, setShowSynths] = useState(loadSynthsShown)
  const [fit, setFit] = useState<{ readonly step: number; readonly settled: boolean }>({
    step: FITS.largest,
    settled: false,
  })
  const [measure, setMeasure] = useState<Measure | null>(null)
  const songBox = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLSpanElement>(null)
  useWakeLock()

  // The sound level meter, on or off and in the mode it was last left on this
  // device, so it carries on through a rehearsal from song to song.
  const [meter, setMeter] = useState<Meter>(loadMeter)
  // A hidden page has no microphone on a phone anyway; it is opened again on
  // coming back, with the average started afresh.
  const visible = useSyncExternalStore(onVisibility, pageVisible, () => true)
  const [micTrouble, setMicTrouble] = useState<MicTrouble | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const heard = useRef<Level>(silence)
  const changeMeter = (change: Partial<Meter>) => {
    const next = { ...meter, ...change }
    saveMeter(next)
    setMeter(next)
  }
  const toggleListening = () => {
    heard.current = silence
    setMicTrouble(null)
    changeMeter({ on: !meter.on })
  }
  // Off for good, so a blocked microphone is not asked for each time Perform opens.
  const stopListening = (trouble: MicTrouble) => {
    changeMeter({ on: false })
    setMicTrouble(trouble)
  }

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
      if (event.key === 'Escape' && !calibrating) onLeave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onLeave, calibrating])

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

  // Notation and tab take different room, so the size is fitted again too.
  const toggleNotation = () => {
    const next = asNotation ? 'tab' : 'notation'
    saveReading(next)
    setReading(next)
    setFit({ step: FITS.largest, settled: false })
  }

  // The settings take lines at the top, so the size is fitted again for them.
  const toggleSynths = () => {
    saveSynthsShown(!showSynths)
    setShowSynths(!showSynths)
    setFit({ step: FITS.largest, settled: false })
  }

  // A new song is fitted afresh. Done here rather than by remounting, so the
  // menu stays open while stepping through songs.
  const [fittedFor, setFittedFor] = useState(songId)
  if (fittedFor !== songId) {
    setFittedFor(songId)
    setFit({ step: FITS.largest, settled: false })
  }

  // Notation reads durations from columns, including trailing space and rest bars.
  const tab = asNotation ? song.tab : recognizedChords(trimScore(song.tab))

  const step = chosen ?? fit.step
  const scale = STEPS[step] ?? 1
  // The column in ems of the song's own text size, for a view drawn in ems.
  const widthEm =
    measure === null ? Number.POSITIVE_INFINITY : measure.width / (measure.rem * scale)
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
        {/* The settings that are set once and left live in this menu on every
            screen. On a phone the size and setlist controls fold into it as
            well, so the bar is the song's title and nothing else that takes a
            line; anywhere wider the menu leaves those to the bar. */}
        <div className="bar-more">
          <Menu label="⋯" title="Perform options">
            <div className="menu-row phone-only" role="group" aria-label="Text size">
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
              <div className="phone-only">
                <p className="menu-label">
                  {place.setlist.name} {place.index + 1}/{place.count}
                </p>
                <MenuItems
                  items={[
                    stepTo(place.previous, '‹', 'Previous song'),
                    stepTo(place.next, '›', 'Next song'),
                  ]}
                />
              </div>
            )}
            <MenuChecks
              items={[
                {
                  id: 'synths',
                  label: 'Show synth controls',
                  checked: showSynths,
                  onToggle: toggleSynths,
                },
                {
                  id: 'sound',
                  label: 'Sound level, dB',
                  checked: meter.on,
                  onToggle: toggleListening,
                },
              ]}
            />
            {micTrouble !== null && (
              <p className="menu-label">
                {micTrouble === 'blocked'
                  ? 'Microphone blocked in Settings'
                  : 'No microphone to listen with'}
              </p>
            )}
            {meter.on && (
              <>
                <div className="menu-toggle">
                  <Toggle
                    small
                    label="Measure"
                    options={[
                      { value: 'room', label: 'Room', title: 'Average and dose' },
                      { value: 'voice', label: 'Voice', title: `Loudest of ${HOLD} s` },
                    ]}
                    value={meter.mode}
                    onChange={(mode) => changeMeter({ mode })}
                  />
                </div>
                {meter.mode === 'voice' && (
                  <>
                    <p className="menu-label">Voice target, dB(A)</p>
                    <div className="menu-row" role="group" aria-label="Voice target">
                      <button
                        type="button"
                        aria-label="Lower target"
                        disabled={meter.target <= LOWEST_TARGET}
                        onClick={() => changeMeter({ target: meter.target - 1 })}
                      >
                        −
                      </button>
                      <span className="menu-value">{meter.target}</span>
                      <button
                        type="button"
                        aria-label="Higher target"
                        disabled={meter.target >= HIGHEST_TARGET}
                        onClick={() => changeMeter({ target: meter.target + 1 })}
                      >
                        +
                      </button>
                    </div>
                  </>
                )}
                <MenuItems
                  items={[
                    {
                      label:
                        meter.offset === null ? 'Calibrate mic' : 'Calibrate mic again',
                      onSelect: () => setCalibrating(true),
                    },
                  ]}
                />
              </>
            )}
            {/* The bar has its own Tab or Notation toggle until a tablet folds it in. */}
            {hasTab && (
              <div className="compact-only">
                <MenuChecks
                  items={[
                    {
                      id: 'notation',
                      label: 'Notation',
                      checked: asNotation,
                      onToggle: toggleNotation,
                    },
                  ]}
                />
              </div>
            )}
            {hasTab && !asNotation && (
              <MenuChecks
                items={[
                  {
                    id: 'dense',
                    label: 'Dense tab',
                    checked: dense,
                    onToggle: toggleDense,
                  },
                ]}
              />
            )}
          </Menu>
        </div>
        {/* The same notes read either way; a song with no tab has neither. */}
        {hasTab && (
          <Toggle
            small
            label="Read the tab as"
            options={[
              { value: 'tab', label: 'Tab' },
              { value: 'notation', label: 'Notation' },
            ]}
            value={asNotation ? 'notation' : 'tab'}
            onChange={(next) => {
              if ((next === 'notation') !== asNotation) toggleNotation()
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
        {meter.on && visible && (
          <SoundLevel
            meter={meter}
            onHear={(level) => {
              heard.current = level
            }}
            onStop={stopListening}
          />
        )}
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
        {songParts({ ...song, tab })
          .filter((part) =>
            asNotation ? part.kind !== 'system' : part.kind !== 'notation',
          )
          .filter((part) => showSynths || part.kind !== 'synths')
          .map(partView(tab, song.key, spacing, columns, widthEm))}
      </div>
      {calibrating && (
        <Prompt
          heading="Calibrate mic"
          label="Reference dB(A)"
          initial=""
          confirm="Calibrate"
          accepts={(text) =>
            referenceOf(text) !== null && Number.isFinite(slowDb(heard.current))
          }
          onConfirm={(text) => {
            const reference = referenceOf(text)
            if (reference !== null) {
              changeMeter({ offset: offsetFor(reference, slowDb(heard.current)) })
            }
          }}
          onClose={() => setCalibrating(false)}
        >
          Play a steady sound and put a sound level meter, such as the NIOSH SLM app,
          beside this device. Type the dB(A) it reads, A-weighted and slow.
        </Prompt>
      )}
    </section>
  )
}
