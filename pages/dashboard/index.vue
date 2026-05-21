<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const dashboard = useDashboardRestaurant()
if (!dashboard.state.value) await dashboard.refresh()

const { organization } = dashboard
const slug = organization.value?.slug

await navigateTo(slug ? `/dashboard/${slug}` : '/dashboard/account/settings', { replace: true })
</script>
