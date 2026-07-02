// Nuxt plugin to handle dark mode for Saya theme
declare global {
  interface Window {
    toggleSayaDark: () => void
  }
}

export default defineNuxtPlugin(() => {
  const route = useRoute()
  
  // Only run on tenant routes — early exit for platform/dashboard/admin pages
  const platformRoutes = ['/', '/plugin', '/features', '/pricing', '/templates', '/docs', '/blog', '/login', '/signup', '/forgot-password', '/reset-password', '/oauth', '/dashboard', '/admin', '/auth', '/dev']
  const isPlatformRoute = platformRoutes.some(r => route.path === r || route.path.startsWith(`${r}/`))
  if (isPlatformRoute) return

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
