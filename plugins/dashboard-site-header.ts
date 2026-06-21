// Every /api/dashboard/* call needs to know which site is active. Routes carry
// the site explicitly as the `siteSlug` segment (/dashboard/{orgSlug}/sites/{siteSlug}/...),
// so this plugin forwards it as a header on every request instead of requiring
// each of the ~70 call sites across the dashboard to thread it through manually.
export default defineNuxtPlugin(() => {
  // Captured once, synchronously, while still inside the Nuxt app context for this
  // request/app instance — `route` stays a live reactive ref we can read later from
  // inside onRequest, where calling useRoute() again would be outside that context.
  const route = useRoute()

  const dashboardFetch = $fetch.create({
    onRequest({ request, options }) {
      if (typeof request !== 'string' || !request.startsWith('/api/dashboard')) return
      const siteSlug = route.params.siteSlug
      if (typeof siteSlug !== 'string' || !siteSlug) return
      const headers = new Headers(options.headers as HeadersInit)
      headers.set('x-dashboard-site-slug', siteSlug)
      options.headers = headers
    },
  })
  globalThis.$fetch = dashboardFetch as typeof globalThis.$fetch
})
