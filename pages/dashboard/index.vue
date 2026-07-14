<template>
  <div class="min-h-[20vh]" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
const dashboardError = ref<string | null>(null)

onMounted(async () => {
  try {
    if (!dashboard.state.value) await dashboard.refresh()

    const { organization } = dashboard
    const slug = organization.value?.slug

    // If no org, this may be a guest/end-customer account rather than a
    // brand-new tenant operator (see
    // docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md).
    // A genuinely new signup has no linked customers rows, so its onboarding
    // redirect below is unchanged.
    if (!slug) {
      const fetch = useRequestFetch()
      const status = await fetch<{ isGuest?: boolean }>('/api/account/status').catch(() => null)
      if (status?.isGuest) {
        await navigateTo('/account', { replace: true })
        return
      }
      await navigateTo('/dashboard/onboarding', { replace: true })
      return
    }

    await navigateTo(`/dashboard/${slug}`, { replace: true })
  } catch (error: unknown) {
    console.error('Failed to refresh dashboard:', error)
    dashboardError.value = error instanceof Error ? error.message : 'Failed to load dashboard.'
  }
})
</script>
