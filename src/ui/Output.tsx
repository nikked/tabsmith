import { useState } from 'react'
import type { Song } from '../core/model.ts'
import { renderSong, songBlocks } from '../core/render.ts'

export function Output({ song }: { readonly song: Song }) {
  const [copied, setCopied] = useState(false)
  const text = renderSong(song)
  const blocks = songBlocks(song)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="output">
      <div className="output-actions">
        <button type="button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="page">
        {blocks.map((block, index) => (
          <pre key={index}>{block}</pre>
        ))}
      </div>
    </section>
  )
}
