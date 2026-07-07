<template>
  <nav aria-label="Documentation">
    <PlatformCommandSearchTrigger
      surface="docs"
      label="Search docs, blog, help..."
      aria-label="Open documentation search"
      class="mb-3"
    />

    <NuxtLink
      v-if="drilledCategory"
      to="/docs"
      class="mb-3 flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-default transition-colors no-underline"
      @click="emit('navigate')"
    >
      <PlatformIcon name="arrow-left" class="size-4 shrink-0" />
      <span class="truncate">Back to Docs</span>
    </NuxtLink>

    <PlatformSidebarNav aria-label="Documentation" :groups="groups" @navigate="emit('navigate')" />
  </nav>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { categories } = useDocsNav()

// Mirrors layouts/dashboard.vue's workspace drill-down: inside a category,
// the sidebar scopes to that category's docs (plus a back link) instead of
// showing every category at once.
const drilledCategory = computed(() => typeof route.params.category === 'string' ? route.params.category : null)

const groups = computed(() => {
  const visible = drilledCategory.value
    ? categories.value.filter(group => group.docs.some(doc => doc.categorySlug === drilledCategory.value))
      .map(group => ({
        ...group,
        docs: group.docs.filter(doc => doc.categorySlug === drilledCategory.value),
      }))
      .filter(group => group.docs.length)
    : categories.value

  return visible.map(({ category, docs }) => ({
    label: category,
    items: docs.map(doc => ({
      label: doc.label,
      to: doc.path,
      active: route.path === doc.path,
    })),
  }))
})
</script>
