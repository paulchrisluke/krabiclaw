export default defineNuxtPlugin(() => {
  const { isPlatform } = useTenantSite()
  if (!isPlatform) return

  const theme = usePlatformTheme()
  const stored = localStorage.getItem('krabiclaw-theme')
  if (stored === 'system' || stored === 'light' || stored === 'dark') {
    theme.preference.value = stored
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  theme.sync()
  prefersDark.addEventListener('change', theme.sync)
  watch(theme.preference, theme.sync)
})
