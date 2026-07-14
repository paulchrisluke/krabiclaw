// Server-side: bypass useRequestFetch()'s internal self-fetch entirely per
// CLAUDE.md's "Nested SSR self-fetch loses Cloudflare bindings" rule — call the
// exact same resolver GET /api/admin/access uses, directly against the request
// event. Client-side (client-only navigation): fall back to $fetch.
export default defineNuxtRouteMiddleware(async () => {
  let allowed = false

  if (import.meta.server) {
    const event = useRequestEvent()
    if (event) {
      const { resolveAdminAccessForEvent } = await import('~/server/utils/route-access')
      const result = await resolveAdminAccessForEvent(event)
      allowed = result.status === 'ok' && result.allowed
    }
  } else {
    const access = await $fetch<{ allowed?: boolean }>('/api/admin/access').catch(() => null)
    allowed = Boolean(access?.allowed)
  }

  if (!allowed) {
    return navigateTo('/login')
  }
})
