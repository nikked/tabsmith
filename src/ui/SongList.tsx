import { openEntry, titleOf, type Library } from '../core/library.ts'

type Props = {
  readonly library: Library
  readonly onOpen: (id: string) => void
}

/** The same list under Songs and, on a screen with room for it, beside the editor. */
export function SongList({ library, onOpen }: Props) {
  const open = openEntry(library)

  return (
    <ul className="song-list">
      {library.songs.map((entry) => (
        <li key={entry.id} className={entry.id === open.id ? 'current' : undefined}>
          <button
            type="button"
            className="pick"
            aria-current={entry.id === open.id}
            onClick={() => onOpen(entry.id)}
          >
            {titleOf(entry)}
          </button>
        </li>
      ))}
    </ul>
  )
}
