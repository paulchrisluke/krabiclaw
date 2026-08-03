export type PlatformThemePreference = 'system' | 'light' | 'dark'
export type PlatformThemeValue = 'light' | 'dark'

const STORAGE_KEY = 'krabiclaw-theme'

export function usePlatformTheme() {
  const preference = useState<PlatformThemePreference>('platform-theme-preference', () => 'system')
  const value = useState<PlatformThemeValue>('platform-theme-value', () => 'light')

  const sync = () => {
    if (import.meta.server) return

    const nextValue: PlatformThemeValue = preference.value === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference.value

    value.value = nextValue
    document.documentElement.classList.toggle('dark', nextValue === 'dark')
  }

  const setPreference = (nextPreference: PlatformThemePreference) => {
    preference.value = nextPreference
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, nextPreference)
      } catch {
        // Theme preference remains in memory when browser storage is unavailable.
      } finally {
        sync()
      }
    }
  }

  const restore = () => {
    if (import.meta.server) return
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      // System preference remains authoritative when browser storage is unavailable.
    }
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      preference.value = stored
    }
    sync()
  }

  return { preference, value, sync, setPreference, restore }
}
