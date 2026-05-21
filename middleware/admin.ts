export default defineNuxtRouteMiddleware(async () => {
  const fetch = useRequestFetch()
  const session = await fetch<{ user?: { role?: string } }>('/api/auth/get-session').catch(() => null)
  if (session?.user?.role !== 'admin') {
    return navigateTo('/login')
  }
})
