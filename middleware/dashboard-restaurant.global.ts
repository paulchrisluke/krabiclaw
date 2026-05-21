export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (!to.path.startsWith('/dashboard')) return

  const context = await $fetch<{ organization: { slug: string | null } | null; restaurant: ApiRecord | null }>('/api/dashboard/context').catch(() => null)
  const hasRestaurant = context?.restaurant?.onboarding_status === 'active'

  if (to.path.startsWith('/dashboard/onboarding')) {
    if (hasRestaurant) {
      const orgSlug = context?.organization?.slug
      return navigateTo(orgSlug ? `/dashboard/${orgSlug}` : '/dashboard')
    }
    return
  }

  if (!hasRestaurant) return navigateTo('/dashboard/onboarding')
})
