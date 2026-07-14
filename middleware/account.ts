// Auth guard for the guest/end-customer surface — mirrors middleware/admin.ts's
// shape but only requires an authenticated session, not platform-admin role or
// organization membership. See
// docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
//
// Server-side: bypass useRequestFetch()'s internal self-fetch entirely per
// CLAUDE.md's "Nested SSR self-fetch loses Cloudflare bindings" rule — call the
// exact same resolver GET /api/account/access uses, directly against the
// request event. Client-side (client-only navigation): fall back to $fetch.
export default defineNuxtRouteMiddleware(async (to) => {
  let allowed = false

  if (import.meta.server) {
    const event = useRequestEvent()
    if (event) {
      const { resolveAccountAccessForEvent } = await import('~/server/utils/route-access')
      const result = await resolveAccountAccessForEvent(event)
      allowed = result.status === 'ok' && result.allowed
    }
  } else {
    const access = await $fetch<{ allowed?: boolean }>('/api/account/access').catch(() => null)
    allowed = Boolean(access?.allowed)
  }

  if (!allowed) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
