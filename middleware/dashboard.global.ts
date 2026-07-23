// Centralized dashboard auth-check (issue #293, Section B). Unlike
// middleware/account.ts and middleware/admin.ts — each wired via
// definePageMeta to a small, fixed set of pages — the dashboard area spans
// 40+ page files under pages/dashboard/**. Registering this as a Nuxt
// `.global.ts` middleware (auto-run on every navigation; Nuxt's own
// filename-convention feature, not a new mechanism) lets it cover every
// dashboard route without threading `middleware: 'dashboard'` through each
// page file individually, while still reusing the exact
// resolveAccountAccessForEvent() session check middleware/account.ts already
// uses server-side — no new auth primitive.
//
// This is UX-only: it exists so an expired/absent session redirects straight
// to a login screen with the destination preserved, instead of silently
// rendering an empty/broken dashboard (see layouts/dashboard.vue's
// dashboardContextError, which today is captured but never acted on). It is
// never the security boundary — every /api/dashboard/* route independently
// enforces its own getAuthSession/assertMemberScope/assertDashboardPathPermission
// check regardless of whether this middleware ran (verified during Workstream 3:
// see e.g. server/api/dashboard/context.get.ts's getDashboardContext() and
// server/api/dashboard/sites/[siteId]/guest-threads/*.ts's per-route scope checks).
import { isWhatsAppInboxDeepLinkPath } from '~/utils/dashboard-reauth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path !== '/dashboard' && !to.path.startsWith('/dashboard/')) return

  // "account" is a reserved top-level segment (pages/dashboard/account/**),
  // never a real organization slug. Vue Router only falls through to the
  // dynamic pages/dashboard/[orgSlug]/** route family for a path under
  // /dashboard/account/* when no static file matches it exactly — and once
  // that happens, org-context resolution ignores the URL param entirely and
  // falls back to the session's own active organization, silently rendering
  // the logged-in user's real org instead of a 404 (found via issue #316's
  // required 404 check for the removed /dashboard/account/settings route).
  if (to.params.orgSlug === 'account') {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }

  let allowed = false

  if (import.meta.server) {
    const event = useRequestEvent()
    if (event) {
      const { resolveAccountAccessForEvent } = await import('~/server/utils/route-access')
      const result = await resolveAccountAccessForEvent(event)
      allowed = result.status === 'ok' && result.allowed
    }
  } else {
    const access = await $fetch<{ allowed?: boolean }>('/api/account/access').catch((err) => {
      // Only treat known unauthenticated/forbidden responses as "not allowed"
      // Let network errors, 5xx, and other unexpected failures surface
      if (err?.statusCode === 401 || err?.statusCode === 403) return null
      throw err
    })
    allowed = Boolean(access?.allowed)
  }

  if (!allowed) {
    const query: Record<string, string> = { redirect: to.fullPath }
    // Only the WhatsApp-notification inbox deep link forces the focused
    // phone-OTP login branch — see isWhatsAppInboxDeepLinkPath's doc comment.
    if (isWhatsAppInboxDeepLinkPath(to.path)) query.mode = 'whatsapp'
    return navigateTo({ path: '/login', query })
  }

  // Capability-gated manager pages (definePageMeta({ cmsCapabilityKey: 'site.qa' | ... }),
  // matching a config/cms-registry.ts manager `key`) 404 instead of rendering when the
  // resolved site/location doesn't have that feature enabled — see issue #342 requirement 5,
  // "unsupported routes must throw a Nuxt 404, never redirect or render a fallback". This is
  // the ONLY place that enforces it; every gated page file just declares its key.
  const capabilityKey = typeof to.meta.cmsCapabilityKey === 'string' ? to.meta.cmsCapabilityKey : null
  if (capabilityKey) {
    const organizationSlug = typeof to.params.orgSlug === 'string' ? to.params.orgSlug : ''
    const siteSlug = typeof to.params.siteSlug === 'string' ? to.params.siteSlug : ''
    const locationSlug = typeof to.params.locationSlug === 'string' ? to.params.locationSlug : null

    let capabilityAllowed = false
    if (import.meta.server) {
      const event = useRequestEvent()
      if (event) {
        const [{ cloudflareEnv }, { getAuthSession }, { isDashboardRouteCapabilityAllowed }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/auth'),
          import('~/server/utils/dashboard-route-capability'),
        ])
        const env = cloudflareEnv(event)
        const session = await getAuthSession(event, env)
        if (session?.user?.id && env.DB) {
          capabilityAllowed = await isDashboardRouteCapabilityAllowed(env.DB, session.user.id, {
            organizationSlug,
            siteSlug,
            locationSlug,
            capabilityKey,
          })
        }
      }
    } else {
      const result = await $fetch<{ allowed?: boolean }>('/api/dashboard/route-capability', {
        query: { orgSlug: organizationSlug, siteSlug, locationSlug: locationSlug ?? undefined, key: capabilityKey },
      }).catch(() => null)
      capabilityAllowed = Boolean(result?.allowed)
    }

    if (!capabilityAllowed) {
      throw createError({ statusCode: 404, statusMessage: 'Page not found' })
    }
  }
})
