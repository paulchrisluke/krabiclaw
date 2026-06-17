<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-default pb-8">
      <div>
        <h2 class="text-base font-semibold text-default tracking-wide uppercase">{{ t('saya.posts.title') }}</h2>
        <p class="mt-2 text-4xl font-bold text-default italic">{{ t('saya.posts.subtitle') }}</p>
      </div>
      <p v-if="description" class="text-muted max-w-md md:text-right">{{ description }}</p>
    </div>

    <div :class="['grid gap-8', layoutClass]">
      <article
        v-for="(post, index) in displayedPosts"
        :id="getPostSlug(post.name) || `post-${index}`"
        :key="getPostSlug(post.name) || `post-${index}`"
        class="flex flex-col bg-default border border-default rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer"
        @click="openModal(post)"
      >
        <div class="aspect-4/5 overflow-hidden bg-muted relative">
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
              :alt="post.title || t('saya.posts.image_alt')"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            >
          </template>
          <div v-else class="w-full h-full flex items-center justify-center text-muted italic text-xs">
            {{ t('saya.posts.no_preview') }}
          </div>

          <div class="absolute top-4 left-4 flex gap-2">
            <UBadge v-if="post.event" color="neutral" variant="solid" size="xs" class="bg-black/80 backdrop-blur shadow-sm text-white">{{ t('saya.posts.badge.event') }}</UBadge>
            <UBadge v-else-if="post.offer" color="neutral" variant="solid" size="xs" class="bg-black/80 backdrop-blur shadow-sm text-white">{{ t('saya.posts.badge.offer') }}</UBadge>
            <UBadge v-else color="neutral" variant="solid" size="xs" class="bg-black/80 backdrop-blur shadow-sm text-white">{{ t('saya.posts.badge.update') }}</UBadge>
          </div>
        </div>

        <div class="p-8 flex flex-col grow">
          <time :datetime="post.createTime" class="text-[10px] text-muted font-bold uppercase tracking-widest mb-3">
            {{ formatDate(post.createTime) }}
          </time>
          <h3 class="text-xl font-bold text-default mb-3 leading-tight">{{ post.title || t('saya.posts.business_update') }}</h3>

          <div :class="['text-muted text-sm leading-relaxed mb-6 grow', { 'line-clamp-3': limit }]">
            {{ post.summary }}
          </div>

          <div v-if="!limit" class="space-y-4 mb-6">
            <div v-if="post.event" class="rounded-xl border border-default bg-muted p-4 text-xs">
              <p class="mb-1 font-bold text-default">{{ t('saya.posts.event_details_label') }}</p>
              <p class="text-default">{{ post.event.title }} • {{ formatDate(post.event.startDate) }}</p>
            </div>
            <div v-if="post.offer" class="rounded-xl border border-default bg-muted p-4 text-xs">
              <p class="mb-1 font-bold text-default">{{ t('saya.posts.special_offer_label') }}</p>
              <p class="text-default">{{ post.offer.title }} <span v-if="post.offer.couponCode">• {{ t('saya.posts.code_label') }} {{ post.offer.couponCode }}</span></p>
            </div>
          </div>

          <div class="inline-flex items-center gap-2 text-sm font-bold text-default group/link">
            <span>{{ t('saya.posts.read_full_story') }}</span>
            <span class="transition-transform group-hover:translate-x-1">→</span>
          </div>
        </div>
      </article>

      <template v-if="posts.length === 0 && showEmptyState">
        <div v-for="i in (limit || 3)" :key="`placeholder-${i}`" class="flex flex-col bg-default border border-default rounded-3xl overflow-hidden">
          <div class="flex aspect-4/5 items-center justify-center bg-muted p-8">
            <div class="h-full w-full animate-pulse rounded-2xl bg-default" />
          </div>
          <div class="p-8 flex flex-col grow">
            <div class="h-3 bg-default rounded animate-pulse mb-3" />
            <div class="h-6 bg-default rounded animate-pulse mb-4" />
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-default rounded animate-pulse" />
              <div class="h-3 bg-default rounded animate-pulse w-4/5" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showViewMore && limit && posts.length > 0" class="mt-12 text-center">
      <UButton to="/posts" color="primary" variant="outline" size="xl">
        {{ t('saya.posts.view_all') }}
      </UButton>
    </div>

    <!-- Full-screen modal for post details -->
    <UModal v-model:open="modalOpen" fullscreen>
      <template #body v-if="selectedPost">
        <div class="flex h-full flex-col">
          <div v-if="selectedPost.media?.[0]" class="flex-1 overflow-hidden bg-muted">
            <video
              v-if="selectedPost.media[0].mediaFormat === 'VIDEO'"
              :src="selectedPost.media[0].googleUrl"
              autoplay
              muted
              loop
              playsinline
              class="h-full w-full object-contain"
            />
            <img
              v-else
              :src="selectedPost.media[0].googleUrl"
              :alt="selectedPost.title || t('saya.posts.image_alt')"
              class="h-full w-full object-contain"
            >
          </div>
          <div class="p-6 sm:p-8">
            <time :datetime="selectedPost.createTime" class="text-[10px] text-muted font-bold uppercase tracking-widest mb-3 block">
              {{ formatDate(selectedPost.createTime) }}
            </time>
            <h3 class="text-2xl font-bold text-default mb-4 leading-tight">{{ selectedPost.title || t('saya.posts.business_update') }}</h3>
            <div class="text-muted text-base leading-relaxed whitespace-pre-line">{{ selectedPost.summary }}</div>
            <div v-if="selectedPost.event" class="mt-6 rounded-xl border border-default bg-muted p-4 text-sm">
              <p class="mb-1 font-bold text-default">{{ t('saya.posts.event_details_label') }}</p>
              <p class="text-default">{{ selectedPost.event.title }} • {{ formatDate(selectedPost.event.startDate) }}</p>
            </div>
            <div v-if="selectedPost.offer" class="mt-6 rounded-xl border border-default bg-muted p-4 text-sm">
              <p class="mb-1 font-bold text-default">{{ t('saya.posts.special_offer_label') }}</p>
              <p class="text-default">{{ selectedPost.offer.title }} <span v-if="selectedPost.offer.couponCode">• {{ t('saya.posts.code_label') }} {{ selectedPost.offer.couponCode }}</span></p>
            </div>
            <UButton
              v-if="selectedPost.callToAction"
              :to="selectedPost.callToAction.url"
              variant="solid"
              color="neutral"
              size="xl"
              class="mt-6 rounded-full"
            >
              {{ (selectedPost.callToAction.actionType ?? '').replaceAll('_', ' ') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
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

const modalOpen = ref(false)
const selectedPost = ref(null)

function openModal(post) {
  selectedPost.value = post
  modalOpen.value = true
}

const displayedPosts = computed(() => {
  return props.limit ? props.posts.slice(0, props.limit) : props.posts
})

const layoutClass = computed(() => {
  if (props.limit === 3) return 'md:grid-cols-3'
  if (props.limit === 2) return 'md:grid-cols-2'
  if (!props.limit) return 'md:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1'
})

const { formatDate } = useLocaleDate()

const { t } = useI18n()

// Helper to extract a safe slug from post.name (last path segment, no slashes)
function getPostSlug(name) {
  if (!name) return ''
  return name.split('/').pop()
}
</script>
