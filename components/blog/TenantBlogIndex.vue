<template>
  <div>
    <header class="mb-10">
      <h1 class="text-4xl font-bold sm:text-5xl" :class="headingClass">{{ title }}</h1>
      <p v-if="description" class="mt-3 max-w-2xl text-lg" :class="descriptionClass">{{ description }}</p>
      <p v-if="activeTag" class="mt-6 flex items-center gap-3 text-sm" :class="descriptionClass">
        {{ t('saya.posts.tagged') }} <span class="rounded-full px-3 py-1 font-medium" :class="activeChipClass">{{ activeTag }}</span>
        <NuxtLink :to="{ query: {} }" class="font-medium underline">{{ t('saya.common.view_all') }}</NuxtLink>
      </p>
    </header>

    <TenantBlogPostCard
      v-if="featuredPost"
      :post="featuredPost"
      :variant="variant"
      featured
      class="mb-12"
    />

    <template v-if="remainingPosts.length > 0 || featuredPost === null">
      <h2 class="mb-8 text-xl font-bold" :class="headingClass">{{ t('saya.posts.title') }}</h2>

      <div v-if="pagedPosts.length === 0" class="py-16 text-center" :class="descriptionClass">
        <p class="text-lg font-medium">{{ t('saya.posts.empty_title') }}</p>
        <p class="mt-1 text-sm">{{ t('saya.posts.empty_desc') }}</p>
      </div>
      <div v-else class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <TenantBlogPostCard
          v-for="post in pagedPosts"
          :key="post.id"
          :post="post"
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

export type TenantBlogIndexPost = TenantBlogCardPost

const props = withDefaults(defineProps<{
  title: string
  description?: string | null
  posts: TenantBlogIndexPost[]
  variant?: 'blawby' | 'saya'
  perPage?: number
}>(), {
  description: null,
  variant: 'saya',
  perPage: 9,
})

const { t } = useI18n()

const currentPage = ref(1)

// The featured post is the most recently published one; a tag filter shows only
// matching articles, so the featured card is hidden while one is active.
const { activeTag, taggedPosts } = useBlogTagFilter(() => props.posts)

const featuredPost = computed(() => {
  if (activeTag.value !== null || !taggedPosts.value.length) return null
  return [...taggedPosts.value].sort((a, b) => {
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0
    return dateB - dateA
  })[0]
})

const remainingPosts = computed(() => taggedPosts.value.filter(post => post.id !== featuredPost.value?.id))
const totalPages = computed(() => Math.max(1, Math.ceil(remainingPosts.value.length / props.perPage)))
const pagedPosts = computed(() => remainingPosts.value.slice((currentPage.value - 1) * props.perPage, currentPage.value * props.perPage))

watch(activeTag, () => { currentPage.value = 1 })

const headingClass = computed(() => props.variant === 'blawby' ? 'blawby-display text-[var(--blawby-primary)]' : 'text-default')
const descriptionClass = computed(() => props.variant === 'blawby' ? 'text-gray-600' : 'text-muted')
const activeChipClass = computed(() => props.variant === 'blawby'
  ? 'bg-[var(--blawby-primary-dark)] text-white'
  : 'bg-inverted text-inverted')
</script>
