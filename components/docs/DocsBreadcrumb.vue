<template>
  <nav aria-label="Breadcrumb" class="mb-6">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm">
      <li v-for="(crumb, index) in crumbs" :key="crumb.url" class="flex items-center gap-1.5">
        <NuxtLink
          v-if="index !== crumbs.length - 1"
          :to="crumb.url"
          class="text-muted no-underline transition-colors hover:text-default"
        >
          {{ crumb.name }}
        </NuxtLink>
        <span v-else class="font-medium text-primary">{{ crumb.name }}</span>
        <PlatformIcon v-if="index !== crumbs.length - 1" name="chevron-right" class="size-3.5 shrink-0 text-dimmed" />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
interface DocsBreadcrumbEntry {
  name: string
  url: string
}

// Takes the exact same { name, url }[] array passed to useContentPageSchema's
// `breadcrumbs` option, so the visible trail and the BreadcrumbList JSON-LD
// can never drift apart.
defineProps<{ crumbs: DocsBreadcrumbEntry[] }>()
</script>
