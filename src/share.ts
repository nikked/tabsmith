import { decode, encode, type Loaded } from './storage.ts'
import type { Song } from './core/model.ts'

const MARKER = '#song='

/**
 * base64url, so the payload survives a URL untouched: `+` and `/` are not safe
 * in a fragment, and `=` padding is noise a decoder can work out for itself.
 * Chunked because spreading a large array into fromCharCode blows the stack.
 */
const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at)
  return bytes
}

const through = async (data: BlobPart, transform: ReadableWritablePair) =>
  new Uint8Array(
    await new Response(new Blob([data]).stream().pipeThrough(transform)).arrayBuffer(),
  )

/**
 * Deflate first, because a document is indented JSON and repetition is most of
 * it. `unpack` throws on text that `pack` did not make.
 */
export const pack = async (text: string): Promise<string> =>
  toBase64Url(await through(text, new CompressionStream('deflate-raw')))

export const unpack = async (packed: string): Promise<string> =>
  new TextDecoder().decode(
    await through(fromBase64Url(packed), new DecompressionStream('deflate-raw')),
  )

/**
 * The link is the song: it holds the whole document, so there is no server to
 * ask and nothing of yours leaves this machine except what you send.
 */
export const toLink = async (song: Song): Promise<string> =>
  `${location.origin}${location.pathname}${MARKER}${await pack(encode(song))}`

/** Null when the fragment is not a shared song at all, which is the usual case. */
export const linkedSong = async (hash: string): Promise<Loaded | null> => {
  if (!hash.startsWith(MARKER)) return null
  try {
    return decode(await unpack(hash.slice(MARKER.length)))
  } catch {
    return { ok: false, error: 'That link is not a tabsmith song.' }
  }
}

/**
 * Dropped from the address bar once it has been read, so a reload does not
 * offer the same song again and the link cannot be mistaken for what is open.
 */
export const forgetLink = (): void => {
  history.replaceState(null, '', `${location.origin}${location.pathname}`)
}
