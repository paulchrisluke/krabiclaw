<template>
  <!--
    The way back up from this page: the index, then the category. The page
    itself is the heading right below, so it is not repeated here — a long
    article title made the trail wrap into a second headline.
  -->
  <nav v-if="trail.length" aria-label="Breadcrumb" class="mb-6">
    <ol class="flex flex-wrap items-center gap-1.5 text-sm">
      <li v-for="(crumb, index) in trail" :key="crumb.url" class="flex items-center gap-1.5">
        <NuxtLink :to="crumb.url" class="text-muted no-underline transition-colors hover:text-default">{{ crumb.name }}</NuxtLink>
        <PlatformIcon v-if="index !== trail.length - 1" name="chevron-right" class="size-3.5 shrink-0 text-dimmed" />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
interface ArticleBreadcrumbEntry {
  name: string
  url: string
}

// Takes the exact { name, url }[] array the page's BreadcrumbList JSON-LD is
// built from, so the two cannot drift: the structured list ends with the page
// itself, and the visible trail is that list without it.
const props = defineProps<{ crumbs: ArticleBreadcrumbEntry[] }>()
const trail = computed(() => props.crumbs.slice(0, -1))
</script>
