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

  /**
   * Installs the client-side theme lifecycle for a public shell layout:
   * restore the stored preference on mount, follow the OS while the
   * preference is `system`, and re-apply whenever it changes. Every public
   * layout calls this so the footer's control works on marketing, docs and
   * blog alike.
   */
  const bootstrap = () => {
    if (!import.meta.client) return

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => sync()

    onMounted(restore)
    prefersDark.addEventListener('change', onSystemThemeChange)
    const stopThemeWatch = watch(preference, sync)

    onBeforeUnmount(() => {
      prefersDark.removeEventListener('change', onSystemThemeChange)
      stopThemeWatch()
    })
  }

  return { preference, value, sync, setPreference, restore, bootstrap }
}
