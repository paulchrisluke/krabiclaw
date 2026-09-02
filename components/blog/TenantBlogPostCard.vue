<template>
  <NuxtLink :to="postPath" class="group block h-full no-underline">
    <div
      v-if="featured"
      :class="[
        'grid gap-0 overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md',
        featuredMedia?.public_url ? 'md:grid-cols-2' : 'md:grid-cols-1',
        variant === 'blawby' ? 'border-[var(--blawby-border)] bg-white' : 'border-default bg-elevated',
      ]"
    >
      <div class="p-8">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="variant === 'blawby' ? 'bg-[var(--blawby-accent-100)] text-[var(--blawby-accent-strong)]' : 'bg-muted text-muted'"
          >
            {{ t('saya.posts.title') }}
          </span>
          <span v-if="post.category" class="rounded-full px-2.5 py-1 text-xs font-medium" :class="categoryClass">{{ post.category }}</span>
        </div>
        <p class="mb-3 text-sm" :class="metaTextClass">
          <NuxtTime v-if="post.published_at" :datetime="post.published_at" :locale="locale" year="numeric" month="long" day="numeric" time-zone="UTC" />
        </p>
        <h2 class="mb-4 text-2xl font-bold sm:text-3xl" :class="titleClass">{{ post.title }}</h2>
        <p v-if="post.excerpt" class="mb-6 leading-relaxed" :class="excerptClass">{{ post.excerpt }}</p>
        <span class="text-sm font-semibold" :class="linkClass">{{ t('saya.posts.read_full_story') }} →</span>
      </div>
      <div v-if="featuredMedia?.public_url" class="min-h-64 overflow-hidden">
        <video
          v-if="featuredMedia.kind === 'video'"
          :src="featuredMedia.public_url"
          :poster="featuredMedia.thumbnail_url || undefined"
          autoplay
          muted
          loop
          playsinline
          class="h-full w-full object-cover"
        />
        <img v-else :src="featuredMedia.public_url" :alt="post.title" loading="lazy" class="h-full w-full object-cover">
      </div>
    </div>

    <div
      v-else
      class="h-full overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
      :class="variant === 'blawby' ? 'border-[var(--blawby-border)] bg-white' : 'border-default bg-elevated'"
    >
      <div v-if="featuredMedia?.public_url" class="h-48 overflow-hidden">
        <video
          v-if="featuredMedia.kind === 'video'"
          :src="featuredMedia.public_url"
          :poster="featuredMedia.thumbnail_url || undefined"
          autoplay
          muted
          loop
          playsinline
          class="h-full w-full object-cover"
        />
        <img v-else :src="featuredMedia.public_url" :alt="post.title" loading="lazy" class="h-full w-full object-cover">
      </div>
      <div class="p-6">
        <div class="mb-3 flex flex-wrap items-center gap-3 text-sm" :class="metaTextClass">
          <span v-if="post.category" class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="categoryClass">{{ post.category }}</span>
          <span v-if="post.published_at"><NuxtTime :datetime="post.published_at" :locale="locale" year="numeric" month="long" day="numeric" time-zone="UTC" /></span>
        </div>
        <h3 class="mb-2 text-xl font-bold" :class="titleClass">{{ post.title }}</h3>
        <p v-if="post.excerpt" class="mb-4 line-clamp-3 text-sm" :class="excerptClass">{{ post.excerpt }}</p>
        <span class="text-sm font-semibold" :class="linkClass">{{ t('saya.posts.read_full_story') }} →</span>
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
  canonical_url?: string | null
  published_at?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url?: string | null; kind?: string | null; width?: number | null; height?: number | null }>
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

const { locale, localePath, t } = useI18n()
const postPath = computed(() => localePath(props.post.canonical_url || `${props.basePath}/${props.post.slug}`))
const isBlawby = computed(() => props.variant === 'blawby')
const featuredMedia = computed(() => props.post.media?.find(item => item.slot === 'featured') ?? null)
const metaTextClass = computed(() => isBlawby.value ? 'text-gray-500' : 'text-dimmed')
const categoryClass = computed(() => isBlawby.value ? 'bg-[var(--blawby-primary-100)] text-[var(--blawby-primary)]' : 'bg-muted text-muted')
const titleClass = computed(() => isBlawby.value ? 'blawby-display text-[var(--blawby-primary)]' : 'text-default')
const excerptClass = computed(() => isBlawby.value ? 'text-gray-600' : 'text-muted')
const linkClass = computed(() => isBlawby.value ? 'text-[var(--blawby-accent-strong)]' : 'text-primary')
</script>
