export default defineNuxtRouteMiddleware(async (to) => {
  const session = await $fetch('/api/auth/get-session', {
    headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined
  })

  if (!session?.user) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
