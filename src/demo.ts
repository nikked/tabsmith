import demoFile from './demo.json?raw'
import { decode, type Loaded } from './storage.ts'

/**
 * The demo is a saved song, not a literal: drop any file the app has written in
 * over `demo.json` and it becomes the demo. It goes through the same decode as
 * a file you open, so an older one is migrated and a broken one fails the way a
 * broken file does rather than taking the app down at import time.
 */
export const DEMO: Loaded = decode(demoFile)
