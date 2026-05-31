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
    await navigateTo(slug ? `/dashboard/${slug}` : '/dashboard/account/settings', { replace: true })
  } catch (error: unknown) {
    console.error('Failed to refresh dashboard:', error)
    dashboardError.value = error instanceof Error ? error.message : 'Failed to load dashboard.'
    await navigateTo('/dashboard/account/settings', { replace: true })
  }
})
</script>
