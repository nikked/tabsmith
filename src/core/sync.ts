import {
  clockOf,
  isUnsynced,
  repair,
  stampAfter,
  type Band,
  type BandField,
  type BandTodo,
  type Entry,
  type Library,
  type Setlist,
  type Songs,
} from './library.ts'
import type { Song } from './model.ts'
import { mergeSong } from './mergeSong.ts'
import { same } from './same.ts'

/**
 * One song as every device can see it: its latest version, and whether it is
 * still on the shelf. A deletion carries a time like an edit does, so the two
 * can be compared — an edit made after a delete on another device brings a song
 * back. A deleted song keeps its content, so nothing deleted is ever lost; only
 * a deletion made before that was true can arrive without it.
 */
export type Synced =
  | {
      readonly id: string
      readonly at: number
      readonly active: true
      readonly song: Song
    }
  | {
      readonly id: string
      readonly at: number
      readonly active: false
      readonly song: Song | null
    }

export const records = (library: Library): readonly Synced[] => [
  ...library.songs.map((entry): Synced => ({
    id: entry.id,
    at: entry.updatedAt,
    active: true,
    song: entry.song,
  })),
  ...library.removed.map((gone): Synced => ({
    id: gone.id,
    at: gone.at,
    active: false,
    song: gone.song,
  })),
]

/** When a sync is merged, and how a song kept as a copy gets an id of its own. */
export type Now = { readonly at: number; readonly newId: () => string }

/**
 * This device's version of a song the sheet has also changed, kept beside it
 * under its own id and name so neither side's work is lost. It has never been
 * synced, so it goes up with the next sync like any new song.
 */
const conflictCopy = (entry: Entry, now: Now): Entry => ({
  id: now.newId(),
  song: {
    ...entry.song,
    title: `${entry.song.title || 'Untitled'} (conflict ${clockOf(now.at)})`,
  },
  updatedAt: now.at,
  lastSynced: null,
})

const taken = (record: Extract<Synced, { active: true }>): Entry => ({
  id: record.id,
  song: record.song,
  updatedAt: record.at,
  lastSynced: { at: record.at, song: record.song },
})

/**
 * One song settled against the sheet's record of it: what stays on the shelf,
 * this device's version kept aside when the two collided, and whether anything
 * changed at all.
 */
type Settled = {
  readonly entry: Entry | null
  readonly conflict: { readonly copy: Entry; readonly title: string } | null
  readonly changed: boolean
}

const becomes = (entry: Entry | null): Settled => ({
  entry,
  conflict: null,
  changed: true,
})

const settle = (entry: Entry, record: Synced | undefined, now: Now): Settled => {
  const unchanged: Settled = { entry, conflict: null, changed: false }
  if (record === undefined) return unchanged
  if (record.active && record.at === entry.updatedAt && same(record.song, entry.song)) {
    if (entry.lastSynced?.at === entry.updatedAt) return unchanged
    return becomes({ ...entry, lastSynced: { at: entry.updatedAt, song: entry.song } })
  }
  const base = entry.lastSynced
  if (base === null) {
    // No record of agreeing: newest stamp wins, as before syncs remembered.
    if (record.at <= entry.updatedAt) return unchanged
    return becomes(record.active ? taken(record) : null)
  }
  if (record.at <= base.at) return unchanged
  const editedHere = isUnsynced(entry)
  if (!record.active) {
    return becomes(
      editedHere ? { ...entry, updatedAt: stampAfter(record.at, now.at) } : null,
    )
  }
  if (!editedHere || same(entry.song, record.song)) return becomes(taken(record))
  const together = mergeSong(base.song, entry.song, record.song)
  const merged: Entry = same(together.value, record.song)
    ? taken(record)
    : // Both sides' edits, which neither device has yet: it goes up next.
      {
        id: entry.id,
        song: together.value,
        updatedAt: stampAfter(Math.max(entry.updatedAt, record.at), now.at),
        lastSynced: { at: record.at, song: record.song },
      }
  return {
    entry: merged,
    conflict: together.clean
      ? null
      : { copy: conflictCopy(entry, now), title: entry.song.title || 'Untitled' },
    changed: true,
  }
}

/**
 * What the sheet brought, set against what is here, one song at a time.
 *
 * A song the sheet holds this device's version of is now synced. One the sheet
 * has a newer copy of is taken, unless it was also edited here since the two
 * last agreed: then the two are put together part by part. Where both changed
 * the same part differently the sheet's side of that part stands in, and this
 * version is kept beside it whole as a conflict copy, named for when, to be put
 * together by hand. A deletion from elsewhere takes a song off the shelf, unless it was
 * edited here since, in which case it comes back. A song this device has no
 * record of agreeing on yet — kept before syncs remembered — goes by newest
 * stamp, as every song once did, since there is nothing to tell an edit by.
 *
 * Songs already on the shelf keep their place; new ones and copies join at the
 * end. The library comes back untouched when nothing remote changes it, so a
 * sync that changed nothing does not look like an edit worth syncing again. If
 * the remote side has deleted every song here, the shelf is kept as it is — a
 * library cannot be empty, and the next sync pushes these back.
 */
export const merge = (
  library: Library,
  remote: readonly Synced[],
  now: Now,
): { readonly library: Library; readonly conflicts: readonly string[] } => {
  const theirs = new Map(remote.map((record) => [record.id, record]))
  const settled = library.songs.map((entry) => settle(entry, theirs.get(entry.id), now))
  const kept = settled.flatMap((each) => (each.entry === null ? [] : [each.entry]))
  const collided = settled.flatMap((each) =>
    each.conflict === null ? [] : [each.conflict],
  )
  const copies = collided.map((each) => each.copy)
  const conflicts = collided.map((each) => each.title)
  const changed = settled.some((each) => each.changed)
  const here = new Set(library.songs.map((entry) => entry.id))
  const gone = new Map(library.removed.map((each) => [each.id, each.at]))
  const arrived = remote.flatMap((record): Entry[] =>
    record.active &&
    !here.has(record.id) &&
    record.at > (gone.get(record.id) ?? Number.NEGATIVE_INFINITY)
      ? [taken(record)]
      : [],
  )
  const removed = library.removed.filter((each) => {
    const record = theirs.get(each.id)
    return record === undefined || record.at <= each.at
  })
  if (!changed && arrived.length === 0 && removed.length === library.removed.length) {
    return { library, conflicts }
  }
  const merged =
    repair({ ...library, songs: [...kept, ...arrived, ...copies], removed }) ?? library
  return { library: merged, conflicts }
}

const withoutSentDeletions = <T extends Listed>(
  here: readonly T[],
  sent: readonly T[],
): readonly T[] =>
  here.filter(
    (item) =>
      item.active ||
      !sent.some((each) => each.id === item.id && each.updatedAt === item.updatedAt),
  )

/**
 * Once a sync has carried a deletion to the sheet, the sheet remembers it and
 * this device can forget it: a deleted song, or a setlist or band todo marked
 * inactive.
 * Only what was sent is forgotten: one deleted while the sync was on its way
 * still has to go up with the next one.
 */
export const forgetSent = (library: Library, sent: Library): Library => {
  const removed = library.removed.filter(
    (gone) => !sent.removed.some((each) => each.id === gone.id && each.at === gone.at),
  )
  const setlists = withoutSentDeletions(library.setlists, sent.setlists)
  const todos = withoutSentDeletions(library.todos, sent.todos)
  return removed.length === library.removed.length &&
    setlists.length === library.setlists.length &&
    todos.length === library.todos.length
    ? library
    : { ...library, removed, setlists, todos }
}

/** What the sheet answers a sync with: everything it holds. */
export type Sheet = {
  readonly records: readonly Synced[]
  readonly setlists: readonly Setlist[]
  readonly todos: readonly BandTodo[]
  readonly band: Partial<Band>
}

type Stamped = { readonly updatedAt: number; readonly syncedAt: number | null }

/** Exactly what the sheet holds, so the sheet has it at this stamp. */
const heldAs = <T extends Stamped>(item: T, there: T | undefined): T =>
  there !== undefined &&
  item.syncedAt !== item.updatedAt &&
  same({ ...item, syncedAt: there.syncedAt }, there)
    ? { ...item, syncedAt: item.updatedAt }
    : item

const heldOf = <T extends Stamped & { readonly id: string }>(
  items: readonly T[],
  sheet: readonly T[],
): readonly T[] => {
  const there = new Map(sheet.map((item) => [item.id, item]))
  const held = items.map((item) => heldAs(item, there.get(item.id)))
  return held.every((item, index) => item === items[index]) ? items : held
}

/**
 * What the sheet now holds as it is here is agreed on, so it no longer counts
 * as waiting to go up.
 *
 * A song is agreed on at the version this sync sent, even when it has been
 * edited here again while the sync was on its way. Without that the sheet's
 * answer would look like someone else's edit to the same parts, and the edit
 * made meanwhile would turn into a conflict copy of itself. What changed since
 * stays unsynced and goes up next.
 */
export const acknowledge = (library: Library, sent: Library, sheet: Sheet): Library => {
  const theirs = new Map(sheet.records.map((record) => [record.id, record]))
  const agreed = (entry: Entry): Entry => {
    const record = theirs.get(entry.id)
    const mine = sent.songs.find((each) => each.id === entry.id)
    return record?.active === true &&
      mine !== undefined &&
      mine.updatedAt === record.at &&
      entry.lastSynced?.at !== record.at &&
      same(mine.song, record.song)
      ? { ...entry, lastSynced: { at: record.at, song: record.song } }
      : entry
  }
  const [first, ...rest] = library.songs
  const songs: Songs = [agreed(first), ...rest.map(agreed)]
  const setlists = heldOf(library.setlists, sheet.setlists)
  const todos = heldOf(library.todos, sheet.todos)
  const band: Band = {
    name: heldAs(library.band.name, sheet.band.name),
    ideas: heldAs(library.band.ideas, sheet.band.ideas),
  }
  return songs.every((entry, index) => entry === library.songs[index]) &&
    setlists === library.setlists &&
    todos === library.todos &&
    band.name === library.band.name &&
    band.ideas === library.band.ideas
    ? library
    : { ...library, songs, setlists, todos, band }
}

type Listed = {
  readonly id: string
  readonly active: boolean
  readonly updatedAt: number
}

/**
 * Newest wins, one at a time, a tie keeps what is here, and new ones join at
 * the end. One deleted elsewhere is taken off this device; the sheet is what
 * keeps it, marked inactive, so one this device does not have changes nothing.
 * The same list comes back when nothing remote is newer.
 */
const newestOf = <T extends Listed>(
  here: readonly T[],
  remote: readonly T[],
): readonly T[] => {
  const known = new Map(here.map((item) => [item.id, item.updatedAt]))
  const newer = remote.filter(
    (item) =>
      (item.active || known.has(item.id)) &&
      item.updatedAt > (known.get(item.id) ?? Number.NEGATIVE_INFINITY),
  )
  if (newer.length === 0) return here
  const won = new Map(newer.map((item) => [item.id, item]))
  return [
    ...here.flatMap((item): T[] => {
      const theirs = won.get(item.id)
      if (theirs === undefined) return [item]
      return theirs.active ? [theirs] : []
    }),
    ...newer.filter((item) => !known.has(item.id)),
  ]
}

/** Setlists merge one at a time, the newest of each winning. */
export const mergeSetlists = (library: Library, remote: readonly Setlist[]): Library => {
  const setlists = newestOf(library.setlists, remote)
  return setlists === library.setlists ? library : { ...library, setlists }
}

/**
 * Band todos merge the way setlists do, so two people ticking different ones
 * both keep their ticks.
 */
export const mergeTodos = (library: Library, remote: readonly BandTodo[]): Library => {
  const todos = newestOf(library.todos, remote)
  return todos === library.todos ? library : { ...library, todos }
}

/**
 * Each of the band's texts on its own: the newer one, whole, and a tie or
 * nothing sent keeps what is here.
 */
export const mergeBand = (library: Library, remote: Partial<Band>): Library => {
  const newer = (field: keyof Band): BandField => {
    const theirs = remote[field]
    return theirs !== undefined && theirs.updatedAt > library.band[field].updatedAt
      ? theirs
      : library.band[field]
  }
  const band: Band = { name: newer('name'), ideas: newer('ideas') }
  return band.name === library.band.name && band.ideas === library.band.ideas
    ? library
    : { ...library, band }
}
