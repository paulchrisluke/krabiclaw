<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
await navigateTo(
  `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`,
  { redirectCode: 301, replace: true },
)
</script>
