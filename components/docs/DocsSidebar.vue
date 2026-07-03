<template>
  <nav aria-label="Documentation">
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
const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { categories } = useDocsNav()

// Mirrors layouts/dashboard.vue's workspace drill-down: inside a category,
// the sidebar scopes to that category's docs (plus a back link) instead of
// showing every category at once.
const drilledCategory = computed(() => typeof route.params.category === 'string' ? route.params.category : null)

const groups = computed(() => {
  const visible = drilledCategory.value
    ? categories.value.filter(c => c.categorySlug === drilledCategory.value)
    : categories.value

  return visible.map(({ category, categorySlug, docs }) => ({
    label: category,
    items: docs.map(doc => ({
      label: doc.title,
      to: `/docs/${categorySlug}/${doc.slug}`,
      active: route.path === `/docs/${categorySlug}/${doc.slug}`,
    })),
  }))
})
</script>
