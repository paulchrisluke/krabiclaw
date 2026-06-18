<template>
  <div class="min-h-[20vh]" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardRestaurant()
const dashboardError = ref<string | null>(null)

onMounted(async () => {
  try {
    if (!dashboard.state.value) await dashboard.refresh()

    const { organization } = dashboard
    const slug = organization.value?.slug

    // If no org, send to onboarding to create org + site
    if (!slug) {
      await navigateTo('/dashboard/onboarding', { replace: true })
      return
    }

    await navigateTo(`/dashboard/${slug}`, { replace: true })
  } catch (error: unknown) {
    console.error('Failed to refresh dashboard:', error)
    dashboardError.value = error instanceof Error ? error.message : 'Failed to load dashboard.'
    await navigateTo('/dashboard', { replace: true })
  }
})
</script>
