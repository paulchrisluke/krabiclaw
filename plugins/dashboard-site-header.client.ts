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
  // Captured once, synchronously, while still inside the Nuxt app context for this
  // app instance — `route` is the same reactive object Nuxt hands out everywhere,
  // so reading `route.params`/`route.path` later inside onRequest reflects
  // whatever page is active *at request time*, not just the boot route. The
  // override itself must install unconditionally: if this app instance boots
  // outside /dashboard (e.g. the marketing homepage, /admin) and the user then
  // client-navigates into /dashboard/..., there is no second plugin run to
  // install it later — Nuxt plugins run once per app instance.
  const route = useRoute()

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
      trackApiError(endpoint, response.status, undefined)
    },
  })
})
