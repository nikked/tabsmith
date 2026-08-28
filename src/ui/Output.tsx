import { useState } from 'react'
import type { Score } from '../core/model.ts'
import { renderScore } from '../core/render.ts'

export function Output({ score }: { readonly score: Score }) {
  const [copied, setCopied] = useState(false)
  const ascii = renderScore(score)

  const copy = async () => {
    await navigator.clipboard.writeText(ascii)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="output">
      <button type="button" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>{ascii}</pre>
    </section>
  )
}
