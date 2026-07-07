<template>
  <nav aria-label="Blog">
    <PlatformCommandSearchTrigger
      surface="blog"
      label="Search blog, docs, help..."
      aria-label="Open blog search"
      class="mb-3"
    />

    <NuxtLink
      to="/blog"
      class="mb-3 flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors no-underline hover:text-default"
      :class="route.path === '/blog' ? 'text-default' : ''"
      @click="emit('navigate')"
    >
      <PlatformIcon name="newspaper" class="size-4 shrink-0" />
      <span class="truncate">All posts</span>
    </NuxtLink>

    <PlatformSidebarNav aria-label="Blog" :groups="groups" @navigate="emit('navigate')" />
  </nav>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import { getBlogPostPath } from '~/utils/blog-categories'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { categories } = useBlogNav()

const groups = computed(() => categories.value.map(({ category, posts }) => ({
  label: category,
  items: posts.reduce<Array<{ label: string; to: string; active: boolean }>>((items, post) => {
    const to = getBlogPostPath(post.category, post.slug)
    if (!to) return items
    items.push({
      label: post.label,
      to,
      active: route.path === to,
    })
    return items
  }, []),
})))
</script>
