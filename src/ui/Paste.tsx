import { useRef, useState, type RefObject } from 'react'
import { parseSong } from '../core/parse.ts'
import type { Song } from '../core/model.ts'
import { validate } from '../storage.ts'

type Props = {
  readonly paste: RefObject<HTMLDialogElement | null>
  readonly onImport: (song: Song) => void
}

/**
 * Every song you already know is somewhere on the internet as a chord sheet.
 * Without this each one is a retype, which is the difference between a shelf
 * that fills up and one that holds three songs.
 */
export function Paste({ paste, onImport }: Props) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  const close = () => {
    setTitle('')
    setText('')
    setError(null)
    paste.current?.close()
  }

  const submit = () => {
    const read = parseSong(text, title.trim())
    if (!read.ok) {
      setError(read.error)
      return
    }
    const checked = validate(read.song)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    onImport(checked.song)
    close()
  }

  return (
    <dialog ref={paste} className="paste" onClose={close}>
      <h2>Paste a song</h2>
      <p>
        Chords, lyrics and tab from anywhere. Headings in brackets become sections, and
        each staff becomes a row of the tab, spacing and all.
      </p>
      <input
        aria-label="Song title"
        placeholder="Song title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        ref={field}
        aria-label="Pasted song"
        spellCheck={false}
        rows={12}
        placeholder={'[Intro]\nEm  D  Em\n\ne|-------|\nB|-------|'}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error !== null && (
        <p className="paste-error" role="alert">
          {error}
        </p>
      )}
      <div className="shelf-actions">
        <button type="button" disabled={text.trim() === ''} onClick={submit}>
          Add to my songs
        </button>
        <button type="button" className="quiet" onClick={close}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
