<template>
  <article class="relative">
    <div class="relative w-full overflow-hidden bg-black" style="aspect-ratio: 4 / 5;">
      <video
        v-if="coverMedia?.kind === 'video'"
        :src="coverMedia.url"
        autoplay
        muted
        loop
        playsinline
        class="h-full w-full object-cover"
      />
      <img
        v-else-if="coverMedia"
        :src="coverMedia.url"
        :alt="coverMedia.alt || post.title || t('saya.posts.image_alt')"
        class="h-full w-full object-cover"
      >
      <div v-else class="flex h-full w-full items-center justify-center text-sm italic text-white/40">
        {{ t('saya.posts.no_preview') }}
      </div>

      <div class="absolute inset-x-0 top-0 z-10 px-4 pt-4 sm:px-6">
        <NuxtLink
          to="/posts"
          class="inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-medium text-white no-underline backdrop-blur-md transition hover:bg-black/50"
        >
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          {{ t('saya.posts.back_to_updates') }}
        </NuxtLink>
      </div>
    </div>

    <!-- Configurable post CTA — one button, like Facebook/Instagram post CTAs:
         the post author chooses the button text (actionType) and destination
         (url). Slot lets a caller fully replace it; default renders the
         standard centered pill-with-link-icon button from post.callToAction. -->
    <div v-if="post.callToAction?.url || $slots.cta" class="flex justify-center bg-default px-4 py-4">
      <slot name="cta" :cta="post.callToAction" :label="post.callToAction ? formatCta(post.callToAction.actionType) : null">
        <NuxtLink
          v-if="post.callToAction?.url"
          :to="post.callToAction.url"
          class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-5 py-2.5 text-sm font-semibold text-default no-underline shadow-sm transition hover:bg-elevated"
        >
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 15 15 9M11 6l.88-.88a4 4 0 0 1 5.66 5.66L16 12M13 18l-.88.88a4 4 0 0 1-5.66-5.66L8 12" /></svg>
          {{ formatCta(post.callToAction?.actionType) }}
        </NuxtLink>
      </slot>
    </div>

    <div class="bg-inverted text-inverted px-5 py-6 sm:px-10">
      <div class="mx-auto flex max-w-3xl items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <time v-if="post.createTime" :datetime="post.createTime" class="mb-2 block text-[10px] font-bold uppercase tracking-widest text-inverted/60">
            {{ formatDate(post.createTime) }}
          </time>
          <h1 class="saya-display-md text-inverted">
            <em class="saya-italic">{{ post.title || t('saya.posts.business_update') }}</em>
          </h1>
          <p v-if="post.location" class="mt-2 text-sm text-inverted/70">{{ post.location.title }}</p>

          <div class="mt-4 text-base leading-7 text-inverted/90">
            <p :class="['whitespace-pre-line', !descriptionExpanded && 'line-clamp-3']">{{ post.summary || post.body }}</p>
            <button
              v-if="descriptionTruncatable"
              type="button"
              class="mt-1 text-sm font-semibold text-inverted/60 hover:text-inverted"
              @click="descriptionExpanded = !descriptionExpanded"
            >
              {{ descriptionExpanded ? t('saya.posts.show_less') : t('saya.posts.show_more') }}
            </button>
          </div>

          <div v-if="post.event" class="mt-4 rounded-xl bg-inverted/10 p-3 text-sm backdrop-blur-md">
            <p class="mb-1 font-bold text-inverted">{{ t('saya.posts.event_details_label') }}</p>
            <p class="text-inverted/90">{{ post.event.title }} <span v-if="post.event.startDate">• {{ formatDate(post.event.startDate) }}</span></p>
          </div>
          <div v-if="post.offer" class="mt-4 rounded-xl bg-inverted/10 p-3 text-sm backdrop-blur-md">
            <p class="mb-1 font-bold text-inverted">{{ t('saya.posts.special_offer_label') }}</p>
            <p class="text-inverted/90">{{ post.offer.title }} <span v-if="post.offer.couponCode">• {{ t('saya.posts.code_label') }} {{ post.offer.couponCode }}</span></p>
            <p v-if="post.offer.terms" class="mt-1 text-inverted/70">{{ post.offer.terms }}</p>
          </div>
        </div>

        <div class="relative shrink-0">
          <button
            type="button"
            class="flex size-10 items-center justify-center rounded-full border border-inverted/15 text-inverted transition hover:border-inverted/50"
            :title="t('saya.posts.share')"
            @click="share"
          >
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
          </button>
          <span
            v-if="shareStatus"
            role="status"
            class="absolute top-full right-0 mt-1.5 whitespace-nowrap rounded bg-inverted/10 px-2 py-1 text-xs text-inverted/80"
          >
            {{ shareStatus }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="galleryMedia.length > 0" class="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-8">
      <div
        v-for="item in galleryMedia"
        :key="item.id || item.mediaAssetId || item.url"
        class="overflow-hidden rounded-xl bg-muted"
      >
        <video
          v-if="item.kind === 'video'"
          :src="item.url"
          muted
          playsinline
          preload="metadata"
          class="aspect-square w-full object-cover"
        />
        <img
          v-else
          :src="item.url"
          :alt="item.alt || post.title || t('saya.posts.image_alt')"
          class="aspect-square w-full object-cover"
        >
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
interface SayaPostDetailMedia {
  id?: string
  mediaAssetId?: string
  url: string
  kind: 'image' | 'video'
  alt?: string | null
}

interface SayaPostDetailPost {
  title: string
  body: string
  summary: string
  createTime: string | null
  cover?: SayaPostDetailMedia | null
  media: SayaPostDetailMedia[]
  gallery: SayaPostDetailMedia[]
  callToAction?: { actionType: string | null; url: string } | null
  event?: { title: string | null; startDate: string | null; endDate: string | null } | null
  offer?: { title: string | null; couponCode: string | null; terms: string | null } | null
  location?: { id: string; title: string | null; slug: string | null } | null
}

const props = defineProps<{ post: SayaPostDetailPost }>()

defineSlots<{
  cta(_slotProps: { cta: SayaPostDetailPost['callToAction']; label: string | null }): unknown
}>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()

const coverMedia = computed(() => props.post.cover || props.post.media?.[0] || null)
const galleryMedia = computed(() => {
  const gallery = props.post.gallery ?? []
  const media = props.post.media ?? []
  const coverId = coverMedia.value?.id || coverMedia.value?.mediaAssetId
  const source = gallery.length ? gallery : media
  if (!coverId) return source
  return source.filter(item => item.id !== coverId && item.mediaAssetId !== coverId)
})

function formatCta(value: string | null | undefined) {
  // cta_type is freeform text (business owners and Google Business Profile
  // sync can both set it to anything, see server/utils/mcp-tools/posts.ts —
  // no fixed enum to map to per-locale translation keys), so a provided
  // value is only reformatted, not translated. The no-value fallback is a
  // fixed string this component controls, so it does go through t().
  if (!value) return t('saya.posts.cta_default')
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, char => char.toUpperCase())
}

// line-clamp-3 always applies visually up to ~3 lines regardless of actual
// length, so "show more" only makes sense past a length that would realistically
// wrap beyond 3 lines. This threshold is a heuristic, not an exact layout
// measurement (font size/viewport width vary), erring toward showing the
// toggle rather than hiding a truncated description with no way to expand it.
const DESCRIPTION_TRUNCATE_THRESHOLD = 180
const descriptionExpanded = ref(false)
const descriptionTruncatable = computed(() => (props.post.summary || props.post.body || '').length > DESCRIPTION_TRUNCATE_THRESHOLD)

const shareStatus = ref('')
let shareStatusTimeout: ReturnType<typeof setTimeout> | undefined

function flashShareStatus(message: string) {
  shareStatus.value = message
  clearTimeout(shareStatusTimeout)
  shareStatusTimeout = setTimeout(() => { shareStatus.value = '' }, 2000)
}

async function share() {
  if (!import.meta.client) return
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: props.post.title || undefined, url })
      return
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      flashShareStatus(t('saya.posts.link_copied'))
      return
    }
    flashShareStatus(t('saya.posts.share_unavailable'))
  } catch (error) {
    // User-cancelled share sheets throw AbortError — not a real failure.
    if ((error as Error).name !== 'AbortError') {
      flashShareStatus(t('saya.posts.share_failed'))
    }
  }
}

onUnmounted(() => clearTimeout(shareStatusTimeout))
</script>
