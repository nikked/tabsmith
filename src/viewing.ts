import { z } from 'zod'

const KEY = 'tabsmith.viewing'

/**
 * How one song is shown on this device: the text size chosen for it, if one
 * was, and whether its tab is dense. A phone and an iPad want different sizes
 * for the same song, so this stays on the device rather than going to the sheet
 * with the song.
 */
export type View = {
  readonly size?: number
  readonly dense?: boolean
}

export type Views = Readonly<Record<string, View>>

const views = z.record(
  z.string(),
  z.object({ size: z.number().positive().optional(), dense: z.boolean().optional() }),
)

/** Unreadable or missing is just no choices made yet. */
export const loadViews = (): Views => {
  try {
    const result = views.safeParse(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

export const saveViews = (value: Views): void => {
  localStorage.setItem(KEY, JSON.stringify(value))
}

/** One song's view changed, the rest left as they were. */
export const withView = (all: Views, song: string, change: View): Views => ({
  ...all,
  [song]: { ...all[song], ...change },
})
