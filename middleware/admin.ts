export default defineNuxtRouteMiddleware(async () => {
  const fetch = useRequestFetch()
  const access = await fetch<{ allowed?: boolean }>('/api/admin/access').catch(() => null)
  if (!access?.allowed) {
    return navigateTo('/login')
  }
})
