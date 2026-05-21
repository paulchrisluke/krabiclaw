<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const { organization } = useDashboardRestaurant()
const slug = organization.value?.slug

await navigateTo(slug ? `/dashboard/${slug}` : '/dashboard/onboarding', { replace: true })
</script>
