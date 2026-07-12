<template>
  <div>
    <header class="mb-10">
      <h1 class="text-4xl font-bold sm:text-5xl" :class="headingClass">{{ title }}</h1>
      <p v-if="description" class="mt-3 max-w-2xl text-lg" :class="descriptionClass">{{ description }}</p>
    </header>

    <TenantBlogPostCard
      v-if="featuredPost"
      :post="featuredPost"
      :base-path="basePath"
      :variant="variant"
      featured
      class="mb-12"
    />

    <template v-if="remainingPosts.length > 0 || featuredPost === null">
      <div class="mb-8 flex flex-wrap items-center gap-3">
        <h2 class="mr-2 text-xl font-bold" :class="headingClass">Latest articles</h2>
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-sm font-medium transition"
          :class="activeCategory === null ? activeChipClass : inactiveChipClass"
          @click="activeCategory = null"
        >
          All topics
        </button>
        <button
          v-for="group in categories"
          :key="group.categorySlug"
          type="button"
          class="rounded-full px-3 py-1.5 text-sm font-medium transition"
          :class="activeCategory === group.category ? activeChipClass : inactiveChipClass"
          @click="activeCategory = group.category"
        >
          {{ group.category }}
        </button>
      </div>

      <div v-if="pagedPosts.length === 0" class="py-16 text-center" :class="descriptionClass">
        <p class="text-lg font-medium">No posts yet</p>
        <p class="mt-1 text-sm">Check back soon — new articles are on the way.</p>
      </div>
      <div v-else class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <TenantBlogPostCard
          v-for="post in pagedPosts"
          :key="post.id"
          :post="post"
          :base-path="basePath"
          :variant="variant"
        />
      </div>

      <BlogPagination v-model="currentPage" :total-pages="totalPages" :variant="variant" />
    </template>
  </div>
</template>

<script setup lang="ts">
import TenantBlogPostCard, { type TenantBlogCardPost } from './TenantBlogPostCard.vue'
import BlogPagination from './BlogPagination.vue'

export interface TenantBlogIndexPost extends TenantBlogCardPost {
  featured_order?: number | null
}

const props = withDefaults(defineProps<{
  title: string
  description?: string | null
  posts: TenantBlogIndexPost[]
  basePath: string
  variant?: 'blawby' | 'saya'
  perPage?: number
}>(), {
  description: null,
  variant: 'saya',
  perPage: 9,
})

// Featured post: an explicit featured_order wins (lower = more prominent,
// same COALESCE(featured_order, 999999) convention the platform blog and the
// backing queries already use), falling back to the most recently published
// post when nothing is explicitly marked.
const featuredPost = computed(() => {
  if (!props.posts.length) return null
  return [...props.posts].sort((a, b) => {
    const orderA = a.featured_order ?? 999999
    const orderB = b.featured_order ?? 999999
    if (orderA !== orderB) return orderA - orderB
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0
    return dateB - dateA
  })[0]
})

const activeCategory = ref<string | null>(null)
const currentPage = ref(1)

const remainingPosts = computed(() => props.posts.filter(post => post.id !== featuredPost.value?.id))
const postsRef = computed(() => remainingPosts.value)
const { categories } = useTenantBlogNav(postsRef)
const filteredPosts = computed(() => activeCategory.value === null
  ? remainingPosts.value
  : remainingPosts.value.filter(post => (post.category?.trim() || 'Uncategorized') === activeCategory.value))

const totalPages = computed(() => Math.max(1, Math.ceil(filteredPosts.value.length / props.perPage)))
const pagedPosts = computed(() => filteredPosts.value.slice((currentPage.value - 1) * props.perPage, currentPage.value * props.perPage))

watch(activeCategory, () => { currentPage.value = 1 })

const headingClass = computed(() => props.variant === 'blawby' ? 'blawby-display text-[var(--blawby-primary)]' : 'text-default')
const descriptionClass = computed(() => props.variant === 'blawby' ? 'text-gray-600' : 'text-muted')
const activeChipClass = computed(() => props.variant === 'blawby'
  ? 'bg-[var(--blawby-primary)] text-white'
  : 'bg-inverted text-inverted')
const inactiveChipClass = computed(() => props.variant === 'blawby'
  ? 'bg-[var(--blawby-primary-100)] text-[var(--blawby-primary)] hover:bg-[var(--blawby-primary-200)]'
  : 'bg-muted text-muted hover:bg-elevated')
</script>
