<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-(--ui-border) pb-8">
      <div>
        <h2 class="text-base font-semibold text-(--ui-text) tracking-wide uppercase">Latest Updates</h2>
        <p class="mt-2 text-4xl font-bold text-(--ui-text) italic">News & Events</p>
      </div>
      <p v-if="description" class="text-(--ui-text-muted) max-w-md md:text-right">{{ description }}</p>
    </div>

    <div :class="['grid gap-8', layoutClass]">
      <article
        v-for="(post, index) in displayedPosts"
        :id="getPostSlug(post.name) || `post-${index}`"
        :key="getPostSlug(post.name) || `post-${index}`"
        class="flex flex-col bg-(--ui-bg) border border-(--ui-border) rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group"
      >
        <div class="aspect-[4/5] overflow-hidden bg-(--ui-bg-muted) relative">
          <template v-if="post.media?.[0]">
            <video
              v-if="post.media[0].mediaFormat === 'VIDEO'"
              :src="post.media[0].googleUrl"
              autoplay
              muted
              loop
              playsinline
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <img
              v-else
              :src="post.media[0].googleUrl"
              :alt="post.title || 'Restaurant update'"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            >
          </template>
          <div v-else class="w-full h-full flex items-center justify-center text-(--ui-text-muted) italic text-xs">
            No preview available
          </div>

          <div class="absolute top-4 left-4 flex gap-2">
            <UBadge v-if="post.event" color="neutral" variant="solid" size="xs" class="bg-(--ui-bg) backdrop-blur shadow-sm text-(--ui-text)">Event</UBadge>
            <UBadge v-else-if="post.offer" color="neutral" variant="solid" size="xs" class="bg-(--ui-bg) backdrop-blur shadow-sm text-(--ui-text)">Offer</UBadge>
            <UBadge v-else color="neutral" variant="solid" size="xs" class="bg-(--ui-bg) backdrop-blur shadow-sm text-(--ui-text)">Update</UBadge>
          </div>
        </div>

        <div class="p-8 flex flex-col flex-grow">
          <time :datetime="post.createTime" class="text-[10px] text-(--ui-text-muted) font-bold uppercase tracking-widest mb-3">
            {{ formatDate(post.createTime) }}
          </time>
          <h3 class="text-xl font-bold text-(--ui-text) mb-3 leading-tight">{{ post.title || 'Business Update' }}</h3>

          <div :class="['text-(--ui-text-muted) text-sm leading-relaxed mb-6 flex-grow', { 'line-clamp-3': limit }]">
            {{ post.summary }}
          </div>

          <div v-if="!limit" class="space-y-4 mb-6">
            <div v-if="post.event" class="rounded-xl border border-(--ui-border) bg-(--ui-bg-muted) p-4 text-xs">
              <p class="mb-1 font-bold text-(--ui-text)">Event Details:</p>
              <p class="text-(--ui-text)">{{ post.event.title }} • {{ formatDate(post.event.startDate) }}</p>
            </div>
            <div v-if="post.offer" class="rounded-xl border border-(--ui-border) bg-(--ui-bg-muted) p-4 text-xs">
              <p class="mb-1 font-bold text-(--ui-text)">Special Offer:</p>
              <p class="text-(--ui-text)">{{ post.offer.title }} <span v-if="post.offer.couponCode">• Code: {{ post.offer.couponCode }}</span></p>
            </div>
          </div>

          <NuxtLink
            v-if="limit"
            :to="'/posts#' + getPostSlug(post.name)"
            class="inline-flex items-center gap-2 text-sm font-bold text-(--ui-text) group/link"
          >
            <span>Read Full Story</span>
            <span class="transition-transform group-hover/link:translate-x-1">→</span>
          </NuxtLink>

          <UButton
            v-else-if="post.callToAction"
            :to="post.callToAction.url"
            variant="solid"
            color="neutral"
            size="xl"
            class="self-start rounded-full"
          >
            {{ (post.callToAction.actionType ?? '').replaceAll('_', ' ') }}
          </UButton>
        </div>
      </article>

      <template v-if="posts.length === 0 && showEmptyState">
        <div v-for="i in (limit || 3)" :key="`placeholder-${i}`" class="flex flex-col bg-(--ui-bg) border border-(--ui-border) rounded-3xl overflow-hidden">
          <div class="flex aspect-[4/5] items-center justify-center bg-(--ui-bg-muted) p-8">
            <div class="h-full w-full animate-pulse rounded-2xl bg-(--ui-border)" />
          </div>
          <div class="p-8 flex flex-col flex-grow">
            <div class="h-3 bg-(--ui-border) rounded animate-pulse mb-3" />
            <div class="h-6 bg-(--ui-border) rounded animate-pulse mb-4" />
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-(--ui-border) rounded animate-pulse" />
              <div class="h-3 bg-(--ui-border) rounded animate-pulse w-4/5" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showViewMore && limit && posts.length > 0" class="mt-12 text-center">
      <UButton to="/posts" color="neutral" variant="outline" size="xl">
        View All Updates
      </UButton>
    </div>
  </AppSection>
</template>

<script setup>
const props = defineProps({
  posts: { type: Array, default: () => [] },
  limit: { type: Number, default: undefined },
  bg: { type: String, default: 'white' },
  padding: { type: String, default: 'lg' },
  showTitle: { type: Boolean, default: true },
  description: { type: String, default: undefined },
  showViewMore: { type: Boolean, default: false },
  showEmptyState: { type: Boolean, default: true }
})

const displayedPosts = computed(() => {
  return props.limit ? props.posts.slice(0, props.limit) : props.posts
})

const layoutClass = computed(() => {
  if (props.limit === 3) return 'md:grid-cols-3'
  if (props.limit === 2) return 'md:grid-cols-2'
  if (!props.limit) return 'md:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1'
})

const formatDate = (dateString) => {
  if (!dateString) return ''
  const d = new Date(dateString)
  if (isNaN(d.getTime()) || !isFinite(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Helper to extract a safe slug from post.name (last path segment, no slashes)
function getPostSlug(name) {
  if (!name) return ''
  return name.split('/').pop()
}
</script>
