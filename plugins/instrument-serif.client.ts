// Conditionally load Instrument Serif only on tenant routes
// Instrument Serif is only used for Saya display headings (.saya-display-*)
// and not needed on platform/dashboard pages
export default defineNuxtPlugin(() => {
  const route = useRoute()

  // Check if current route is a tenant route (not platform/dashboard/admin)
  const isTenantRoute = computed(() => {
    const path = route.path
    // Platform/dashboard/admin routes that don't need Instrument Serif
    const platformRoutes = [
      '/',
      '/plugin',
      '/features',
      '/pricing',
      '/templates',
      '/docs',
      '/blog',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/oauth',
      '/dashboard',
      '/admin',
      '/auth',
      '/dev',
    ]
    
    // Check if path starts with any platform route
    const isPlatform = platformRoutes.some(r => path === r || path.startsWith(`${r}/`))
    return !isPlatform
  })

  // Load Instrument Serif only on tenant routes
  if (isTenantRoute.value) {
    useHead({
      link: [
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&display=swap',
        },
      ],
    })
  }

  // Watch for route changes and update font loading
  watch(isTenantRoute, (isTenant) => {
    if (isTenant) {
      useHead({
        link: [
          {
            rel: 'preconnect',
            href: 'https://fonts.googleapis.com',
          },
          {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: '',
          },
          {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&display=swap',
          },
        ],
      })
    }
  })
})
