<script setup lang="ts">
// The site has no page of its own; its locations are the Locations tab.
definePageMeta({ layout: 'dashboard' })
const route = useRoute()
await navigateTo(`/dashboard/${String(route.params.orgSlug)}/sites`, { replace: true })
</script>
