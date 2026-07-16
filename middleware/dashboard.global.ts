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
    const query: Record<string, string> = { redirect: to.fullPath }
    // Only the WhatsApp-notification inbox deep link forces the focused
    // phone-OTP login branch — see isWhatsAppInboxDeepLinkPath's doc comment.
    if (isWhatsAppInboxDeepLinkPath(to.path)) query.mode = 'whatsapp'
    return navigateTo({ path: '/login', query })
  }
})
