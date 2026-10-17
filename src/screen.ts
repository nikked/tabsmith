// What the app's own screen is on this device, apart from any song.

const MODE_KEY = 'tabsmith.mode'

/** Which page is up, kept so a reload comes back to it. */
export type Mode = 'songs' | 'edit' | 'practice'

export const loadMode = (): Mode => {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'songs' || saved === 'practice' ? saved : 'edit'
  } catch {
    return 'edit'
  }
}

export const saveMode = (value: Mode): void => {
  localStorage.setItem(MODE_KEY, value)
}

const THEME_KEY = 'tabsmith.theme'

/** Light or dark, or whichever the system is set to. */
export type Theme = 'system' | 'light' | 'dark'

export const loadTheme = (): Theme => {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export const saveTheme = (value: Theme): void => {
  localStorage.setItem(THEME_KEY, value)
}
