<template>
  <UBreadcrumb :items="breadcrumbItems" class="mb-6" />
</template>

<script setup lang="ts">
interface DocsBreadcrumbEntry {
  name: string
  url: string
}

// Takes the exact same { name, url }[] array passed to useContentPageSchema's
// `breadcrumbs` option, so the visible trail and the BreadcrumbList JSON-LD
// can never drift apart.
const props = defineProps<{ crumbs: DocsBreadcrumbEntry[] }>()

const breadcrumbItems = computed(() => props.crumbs.map((crumb, index) => ({
  label: crumb.name,
  to: index === props.crumbs.length - 1 ? undefined : crumb.url,
})))
</script>
