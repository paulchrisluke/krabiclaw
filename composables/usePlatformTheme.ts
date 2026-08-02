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
      localStorage.setItem(STORAGE_KEY, nextPreference)
      sync()
    }
  }

  return { preference, value, sync, setPreference }
}
