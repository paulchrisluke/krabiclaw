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
        @click="openPost(post)"
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
            />
          </template>
          <div v-else class="w-full h-full flex items-center justify-center text-muted italic text-xs">
            {{ t('saya.posts.no_preview') }}
          </div>

          <div class="absolute top-4 left-4 flex gap-2">
            <span v-if="post.event" class="inline-flex items-center rounded bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur">{{ t('saya.posts.badge.event') }}</span>
            <span v-else-if="post.offer" class="inline-flex items-center rounded bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur">{{ t('saya.posts.badge.offer') }}</span>
            <span v-else class="inline-flex items-center rounded bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur">{{ t('saya.posts.badge.update') }}</span>
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

    </div>

    <!-- Posts are optional, supplementary content — unlike menu items or locations, a
         live, fully-operational business legitimately may never post updates. Show a
         low-key empty state rather than a fabricated example, so it reads as "optional"
         rather than "this site is unfinished". -->
    <div v-if="posts.length === 0 && showEmptyState" class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-default bg-muted/20 py-20 text-center">
      <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
        <svg viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6z"/></svg>
      </div>
      <h3 class="mt-6 saya-display saya-italic text-3xl text-default">{{ t('saya.posts.empty_title') }}</h3>
      <p class="mt-2 max-w-sm text-sm text-muted">{{ t('saya.posts.empty_desc') }}</p>
      <SayaMcpHint :hint="sayaEmptyStates.posts.hint" />
    </div>

    <div v-if="showViewMore && limit && posts.length > 0" class="mt-12 text-center">
      <NuxtLink to="/posts" class="inline-flex items-center justify-center rounded ring-1 ring-inset ring-(--brand-color) px-6 py-3 text-base font-medium text-(--brand-color) no-underline transition hover:bg-(--brand-color)/10">
        {{ t('saya.posts.view_all') }}
      </NuxtLink>
    </div>

    <!-- Full-screen lightbox for post details -->
    <SayaLightbox
      v-if="selectedPost"
      v-model:open="modalOpen"
      :items="lightboxItems"
      :index="0"
      :title="selectedPost.title || t('saya.posts.business_update')"
    >
      <template #caption>
        <time :datetime="selectedPost.createTime" class="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-2 block">
          {{ formatDate(selectedPost.createTime) }}
        </time>
        <div class="text-white/90 text-sm leading-relaxed whitespace-pre-line line-clamp-6">{{ selectedPost.summary }}</div>
        <div v-if="selectedPost.event" class="mt-4 rounded-xl bg-white/10 backdrop-blur-md p-3 text-sm">
          <p class="mb-1 font-bold text-white">{{ t('saya.posts.event_details_label') }}</p>
          <p class="text-white/90">{{ selectedPost.event.title }} • {{ formatDate(selectedPost.event.startDate) }}</p>
        </div>
        <div v-if="selectedPost.offer" class="mt-4 rounded-xl bg-white/10 backdrop-blur-md p-3 text-sm">
          <p class="mb-1 font-bold text-white">{{ t('saya.posts.special_offer_label') }}</p>
          <p class="text-white/90">{{ selectedPost.offer.title }} <span v-if="selectedPost.offer.couponCode">• {{ t('saya.posts.code_label') }} {{ selectedPost.offer.couponCode }}</span></p>
        </div>
        <div v-if="selectedPostPath" class="mt-4 flex flex-wrap gap-2">
          <NuxtLink
            :to="selectedPostPath"
            class="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-base font-medium text-black no-underline transition hover:bg-zinc-200"
          >
            {{ t('saya.posts.read_full_story') }}
          </NuxtLink>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2.5 text-base font-medium text-white transition hover:bg-white/25"
            @click="copySelectedPostUrl"
          >
            Copy link
          </button>
        </div>
        <NuxtLink
          v-if="selectedPost.callToAction && selectedPost.callToAction.url"
          :to="selectedPost.callToAction.url"
          class="mt-4 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-base font-medium text-black no-underline transition hover:bg-zinc-200"
        >
          {{ (selectedPost.callToAction.actionType ?? '').replaceAll('_', ' ') }}
        </NuxtLink>
      </template>
    </SayaLightbox>
  </AppSection>
</template>

<script setup>
import SayaMcpHint from '~/components/saya/SayaMcpHint.vue'
import { sayaEmptyStates } from '~/config/saya-empty-states'

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

async function openPost(post) {
  const path = resolvePostPath(post)
  if (path) {
    await navigateTo(path)
    return
  }
  openModal(post)
}

function openModal(post) {
  selectedPost.value = post
  modalOpen.value = true
}

const lightboxItems = computed(() => {
  const media = selectedPost.value?.media || selectedPost.value?.gallery || []
  return media
    .filter(item => item?.googleUrl || item?.url)
    .map(item => ({
      url: item.googleUrl || item.url,
      kind: item.mediaFormat === 'VIDEO' || item.kind === 'video' ? 'video' : 'image',
      alt: item.alt || item.altText || selectedPost.value.title || t('saya.posts.image_alt'),
      description: item.caption || selectedPost.value.summary
    }))
})

const selectedPostPath = computed(() => selectedPost.value ? resolvePostPath(selectedPost.value) : '')

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

function resolvePostPath(post) {
  return post?.publicPath || post?.public_path || ''
}

async function copySelectedPostUrl() {
  if (!selectedPostPath.value || !import.meta.client) return
  const url = new URL(selectedPostPath.value, window.location.origin).toString()
  await navigator.clipboard?.writeText(url)
}
</script>
