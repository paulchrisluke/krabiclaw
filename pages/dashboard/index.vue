<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const dashboard = useDashboardRestaurant()
const dashboardError = ref<string | null>(null)

try {
  if (!dashboard.state.value) await dashboard.refresh()
} catch (error: any) {
  console.error('Failed to refresh dashboard:', error)
  dashboardError.value = error.message || 'Failed to load dashboard.'
  await navigateTo('/dashboard/account/settings', { replace: true })
}

if (!dashboardError.value) {
  const { organization } = dashboard
  const slug = organization.value?.slug
  await navigateTo(slug ? `/dashboard/${slug}` : '/dashboard/account/settings', { replace: true })
}
</script>
