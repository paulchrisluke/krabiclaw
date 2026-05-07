// Nuxt plugin to handle dark mode for Saya theme
export default defineNuxtPlugin(() => {
  const setDarkClass = (isDark: boolean) => {
    const html = document.documentElement
    if (isDark) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }

  // Detect system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  const saved = localStorage.getItem('saya-theme-dark')
  let isDark = saved === null ? prefersDark.matches : saved === 'true'
  setDarkClass(isDark)

  // Listen for system changes
  prefersDark.addEventListener('change', (e) => {
    if (localStorage.getItem('saya-theme-dark') === null) {
      setDarkClass(e.matches)
    }
  })

  // Expose toggle for use in app
  window.toggleSayaDark = () => {
    isDark = !document.documentElement.classList.contains('dark')
    setDarkClass(isDark)
    localStorage.setItem('saya-theme-dark', String(isDark))
  }
})
