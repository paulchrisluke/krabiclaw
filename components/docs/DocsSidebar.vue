<template>
  <nav aria-label="Documentation">
    <PlatformCommandSearchTrigger
      surface="docs"
      label="Search docs, blog, help..."
      aria-label="Open documentation search"
      class="mb-3"
    />

    <!-- Inside a category the sidebar scopes to that category's articles plus a
         back link, the same drill-down the dashboard uses. -->
    <NuxtLink
      v-if="drilledCategory"
      to="/docs"
      class="mb-3 flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-default transition-colors no-underline"
      @click="emit('navigate')"
    >
      <PlatformIcon name="arrow-left" class="size-4 shrink-0" />
      <span class="truncate">Back to Docs</span>
    </NuxtLink>

    <div v-for="section in sections" :key="section.categorySlug" class="mb-4 last:mb-0">
      <p class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ section.category }}</p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="article in section.articles" :key="article.path">
          <NuxtLink
            :to="article.path"
            class="block truncate rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors"
            :class="route.path === article.path ? 'bg-elevated text-primary font-medium' : 'text-muted hover:text-default hover:bg-muted'"
            @click="emit('navigate')"
          >
            {{ article.title }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { articles, categories } = await useDocsArticles()

// Reading an article narrows the sidebar to that article's own category. The
// category used to be the path's second segment; it is the article's own field
// now, so the section is found from the article the path names.
const drilledCategory = computed(() =>
  articles.value.find(article => article.path === route.path)?.categorySlug ?? null)

const sections = computed(() => drilledCategory.value
  ? categories.value.filter(section => section.categorySlug === drilledCategory.value)
  : categories.value)
</script>
