// Auth guard for the guest/end-customer surface — mirrors middleware/admin.ts's
// shape but only requires an authenticated session, not platform-admin role or
// organization membership. See
// docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
export default defineNuxtRouteMiddleware(async (to) => {
  const fetch = useRequestFetch()
  const access = await fetch<{ allowed?: boolean }>('/api/account/access').catch(() => null)
  if (!access?.allowed) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
