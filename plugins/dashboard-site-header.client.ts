// Every /api/dashboard/* call needs to know which site is active. Routes carry
// the site explicitly as the `siteSlug` segment (/dashboard/{orgSlug}/sites/{siteSlug}/...),
// so this plugin forwards it as a header on every request instead of requiring
// each of the ~70 call sites across the dashboard to thread it through manually.
//
// This must stay client-only. Bare `$fetch()` calls everywhere in this codebase
// resolve to the literal `globalThis.$fetch` (Nuxt does not auto-import a
// nuxtApp-bound `$fetch` — see `node_modules/nuxt/dist/app/composables/fetch.js`),
// so the only way to actually affect those calls is to override that global
// instance. On the server, `globalThis` is shared across concurrent requests in
// the same Worker isolate, so mutating it per-request would let one tenant's
// site-slug header leak onto another tenant's in-flight request. In the
// browser, `globalThis` is scoped to a single tab/session, so the override is
// safe there. (A previous version of this plugin tried to scope the override
// via Nuxt's `provide()` instead of touching `globalThis` — but `provide(name)`
// itself prepends `$`, so `provide: { $fetch: ... }` registered as
// `nuxtApp.$$fetch`, which nothing in this codebase ever read. The header was
// never actually attached; multi-site dashboard pages were silently relying
// entirely on the single-site auto-resolve fallback in dashboard-context.ts.)
export default defineNuxtPlugin(() => {
  const route = useRoute()

  // Only run on dashboard routes — early exit for platform/tenant pages
  if (!route.path.startsWith('/dashboard')) return

  // Captured once, synchronously, while still inside the Nuxt app context for this
  // request/app instance — `route` stays a live reactive ref we can read later from
  // inside onRequest, where calling useRoute() again would be outside that context.

  // api_error tracking is bundled into this same override rather than a second
  // plugin overriding globalThis.$fetch — stacking two independent `.create()`
  // overrides here is fragile (composition depends on plugin load order), so
  // every dashboard-wide $fetch concern lives in this one place.
  const { trackApiError } = useAnalytics()

  globalThis.$fetch = $fetch.create({
    onRequest({ request, options }) {
      if (typeof request !== 'string' || !request.startsWith('/api/dashboard')) return
      const siteSlug = route.params.siteSlug
      if (typeof siteSlug !== 'string' || !siteSlug) return
      const headers = new Headers(options.headers as HeadersInit)
      headers.set('x-dashboard-site-slug', siteSlug)
      options.headers = headers
    },
    onResponseError({ request, response }) {
      if (typeof request !== 'string' || !request.startsWith('/api/dashboard')) return
      const endpoint = typeof request === 'string' ? request : String(request)
      const message = typeof response._data?.message === 'string'
        ? response._data.message
        : typeof response._data?.error === 'string'
          ? response._data.error
          : undefined
      trackApiError(endpoint, response.status, message)
    },
  })
})
