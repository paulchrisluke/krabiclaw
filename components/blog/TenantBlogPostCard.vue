<template>
  <NuxtLink :to="`${basePath}/${post.slug}`" class="group block h-full no-underline">
    <div
      v-if="featured"
      :class="[
        'grid gap-0 overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md',
        post.featured_image?.public_url ? 'md:grid-cols-2' : 'md:grid-cols-1',
        variant === 'blawby' ? 'border-[var(--blawby-border)] bg-white' : 'border-default bg-elevated',
      ]"
    >
      <div class="p-8">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="variant === 'blawby' ? 'bg-[var(--blawby-accent-100)] text-[var(--blawby-accent-strong)]' : 'bg-muted text-muted'"
          >
            Featured
          </span>
          <span v-if="post.category" class="rounded-full px-2.5 py-1 text-xs font-medium" :class="categoryClass">{{ post.category }}</span>
        </div>
        <p class="mb-3 text-sm" :class="metaTextClass">
          <NuxtTime v-if="post.published_at" :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
        </p>
        <h2 class="mb-4 text-2xl font-bold sm:text-3xl" :class="titleClass">{{ post.title }}</h2>
        <p v-if="post.excerpt" class="mb-6 leading-relaxed" :class="excerptClass">{{ post.excerpt }}</p>
        <span class="text-sm font-semibold" :class="linkClass">Read article →</span>
      </div>
      <div v-if="post.featured_image?.public_url" class="min-h-64 overflow-hidden">
        <img :src="post.featured_image.public_url" :alt="post.title" loading="lazy" class="h-full w-full object-cover">
      </div>
    </div>

    <div
      v-else
      class="h-full overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
      :class="variant === 'blawby' ? 'border-[var(--blawby-border)] bg-white' : 'border-default bg-elevated'"
    >
      <div v-if="post.featured_image?.public_url" class="h-48 overflow-hidden">
        <img :src="post.featured_image.public_url" :alt="post.title" loading="lazy" class="h-full w-full object-cover">
      </div>
      <div class="p-6">
        <div class="mb-3 flex flex-wrap items-center gap-3 text-sm" :class="metaTextClass">
          <span v-if="post.category" class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="categoryClass">{{ post.category }}</span>
          <span v-if="post.published_at"><NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" /></span>
        </div>
        <h3 class="mb-2 text-xl font-bold" :class="titleClass">{{ post.title }}</h3>
        <p v-if="post.excerpt" class="mb-4 line-clamp-3 text-sm" :class="excerptClass">{{ post.excerpt }}</p>
        <span class="text-sm font-semibold" :class="linkClass">Read more →</span>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
export interface TenantBlogCardPost {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  category?: string | null
  published_at?: string | null
  featured_image?: { public_url: string | null; kind?: string | null; width?: number | null; height?: number | null } | null
}

const props = withDefaults(defineProps<{
  post: TenantBlogCardPost
  basePath: string
  variant?: 'blawby' | 'saya'
  featured?: boolean
}>(), {
  variant: 'saya',
  featured: false,
})

const isBlawby = computed(() => props.variant === 'blawby')
const metaTextClass = computed(() => isBlawby.value ? 'text-gray-500' : 'text-dimmed')
const categoryClass = computed(() => isBlawby.value ? 'bg-[var(--blawby-primary-100)] text-[var(--blawby-primary)]' : 'bg-muted text-muted')
const titleClass = computed(() => isBlawby.value ? 'blawby-display text-[var(--blawby-primary)]' : 'text-default')
const excerptClass = computed(() => isBlawby.value ? 'text-gray-600' : 'text-muted')
const linkClass = computed(() => isBlawby.value ? 'text-[var(--blawby-accent-strong)]' : 'text-primary')
</script>
