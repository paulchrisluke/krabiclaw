<template>
  <article class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <div class="mb-5 flex items-center justify-between gap-4">
      <NuxtLink
        :to="backTo"
        class="inline-flex items-center gap-2 text-sm font-medium text-muted no-underline transition hover:text-default"
      >
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        {{ t('saya.posts.back_to_updates') }}
      </NuxtLink>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm font-semibold text-default transition hover:bg-elevated lg:hidden"
        :aria-label="t('saya.posts.share')"
        @click="share"
      >
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
        {{ t('saya.posts.share') }}
      </button>
    </div>

    <div class="overflow-hidden rounded-2xl border border-default bg-default shadow-sm lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
      <section class="min-w-0 bg-black" aria-label="Post media">
        <div
          ref="viewer"
          class="group relative flex min-h-[420px] w-full items-center justify-center overflow-hidden bg-black outline-none sm:min-h-[560px] lg:min-h-[680px]"
          tabindex="0"
          @keydown.left.prevent="previousMedia"
          @keydown.right.prevent="nextMedia"
          @pointerdown="startSwipe"
          @pointerup="finishSwipe"
          @pointercancel="cancelSwipe"
        >
          <template v-if="activeMedia">
            <img
              v-if="activeBackdropUrl"
              :src="activeBackdropUrl"
              alt=""
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-45 blur-3xl select-none"
            >
            <div class="pointer-events-none absolute inset-0 bg-black/20" />

            <video
              v-if="activeMedia.kind === 'video'"
              :key="activeMedia.url"
              :src="activeMedia.url"
              autoplay
              muted
              loop
              playsinline
              controls
              preload="metadata"
              class="relative z-10 max-h-[78vh] w-full object-contain"
            />
            <img
              v-else
              :key="activeMedia.url"
              :src="activeMedia.url"
              :alt="activeMedia.alt || post.title || t('saya.posts.image_alt')"
              class="relative z-10 max-h-[78vh] w-full object-contain"
            >

            <div
              v-if="hasMultipleMedia"
              class="absolute right-4 top-4 z-20 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md"
              aria-live="polite"
            >
              {{ currentIndex + 1 }} / {{ mediaItems.length }}
            </div>

            <button
              v-if="hasPreviousMedia"
              type="button"
              class="absolute left-4 top-1/2 z-20 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75 group-hover:flex lg:flex"
              aria-label="Previous media"
              @click="previousMedia"
            >
              <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            </button>
            <button
              v-if="hasNextMedia"
              type="button"
              class="absolute right-4 top-1/2 z-20 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75 group-hover:flex lg:flex"
              aria-label="Next media"
              @click="nextMedia"
            >
              <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            </button>

            <p
              v-if="activeMedia.caption"
              class="absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/85 to-transparent px-5 pb-12 pt-20 text-sm text-white/90"
            >
              {{ activeMedia.caption }}
            </p>

            <div v-if="hasMultipleMedia" class="absolute inset-x-0 bottom-4 z-30 flex justify-center gap-2" aria-label="Media pagination">
              <button
                v-for="(_, index) in mediaItems"
                :key="index"
                type="button"
                :class="[
                  'size-2 rounded-full transition',
                  index === currentIndex ? 'bg-white' : 'bg-white/45 hover:bg-white/70',
                ]"
                :aria-label="`Show media ${index + 1}`"
                :aria-current="index === currentIndex ? 'true' : undefined"
                @click="goToMedia(index)"
              />
            </div>
          </template>

          <div v-else class="flex min-h-[420px] items-center justify-center px-8 text-center text-sm italic text-white/45">
            {{ t('saya.posts.no_preview') }}
          </div>
        </div>

        <div v-if="hasMultipleMedia" class="hidden gap-2 overflow-x-auto border-t border-white/10 bg-black p-3 scrollbar-hide sm:flex">
          <button
            v-for="(item, index) in mediaItems"
            :key="item.id || item.mediaAssetId || `${item.url}-${index}`"
            type="button"
            :class="[
              'relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-black transition',
              index === currentIndex ? 'border-white' : 'border-transparent opacity-65 hover:opacity-100',
            ]"
            :aria-label="`Show media ${index + 1}`"
            :aria-current="index === currentIndex ? 'true' : undefined"
            @click="goToMedia(index)"
          >
            <img
              v-if="item.thumbnailUrl || item.kind === 'image'"
              :src="item.thumbnailUrl || item.url"
              :alt="item.alt || ''"
              class="size-full object-cover"
            >
            <div v-else class="flex size-full items-center justify-center text-white/70">
              <svg viewBox="0 0 24 24" class="size-6" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </div>
            <span v-if="item.kind === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              <svg viewBox="0 0 24 24" class="size-5 drop-shadow" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col px-5 py-6 sm:px-7 sm:py-8 lg:max-h-[780px] lg:overflow-y-auto">
        <div class="flex items-start justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <img
              v-if="brand.logoUrl"
              :src="brand.logoUrl"
              :alt="`${brand.name} logo`"
              class="size-12 shrink-0 rounded-full border border-default bg-white object-contain p-1"
            >
            <div v-else class="flex size-12 shrink-0 items-center justify-center rounded-full border border-default bg-elevated text-lg font-bold text-default">
              {{ brandInitial }}
            </div>
            <div class="min-w-0">
              <p class="truncate font-semibold text-default">{{ brand.name }}</p>
              <NuxtLink
                v-if="post.location?.slug"
                :to="locationPath"
                class="mt-0.5 block truncate text-sm text-muted no-underline transition hover:text-default"
              >
                {{ post.location.title }}
              </NuxtLink>
              <p v-else-if="post.location?.title" class="mt-0.5 truncate text-sm text-muted">{{ post.location.title }}</p>
              <time v-if="post.createTime" :datetime="post.createTime" class="mt-0.5 block text-xs text-dimmed">
                {{ formatDate(post.createTime) }}
              </time>
            </div>
          </div>

          <div class="relative hidden shrink-0 lg:block">
            <button
              type="button"
              class="flex size-10 items-center justify-center rounded-full border border-default text-default transition hover:bg-elevated"
              :aria-label="t('saya.posts.share')"
              @click="share"
            >
              <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
            </button>
            <span
              v-if="shareStatus"
              role="status"
              class="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-lg border border-default bg-default px-3 py-2 text-xs text-muted shadow-lg"
            >
              {{ shareStatus }}
            </span>
          </div>
        </div>

        <div class="mt-7">
          <h1 class="text-3xl font-bold leading-tight text-default sm:text-4xl">
            {{ post.title || t('saya.posts.business_update') }}
          </h1>

          <div v-if="description" class="mt-5 text-base leading-7 text-default">
            <p :class="['whitespace-pre-line', !descriptionExpanded && 'line-clamp-5']">{{ description }}</p>
            <button
              v-if="descriptionTruncatable"
              type="button"
              class="mt-2 text-sm font-semibold text-muted transition hover:text-default"
              @click="descriptionExpanded = !descriptionExpanded"
            >
              {{ descriptionExpanded ? t('saya.posts.show_less') : t('saya.posts.show_more') }}
            </button>
          </div>
        </div>

        <div v-if="post.event" class="mt-6 rounded-xl border border-default bg-elevated p-4">
          <div class="flex items-start gap-3">
            <svg viewBox="0 0 24 24" class="mt-0.5 size-5 shrink-0 text-default" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <div>
              <p class="text-xs font-bold uppercase tracking-widest text-muted">{{ t('saya.posts.event_details_label') }}</p>
              <p v-if="post.event.title" class="mt-1 font-semibold text-default">{{ post.event.title }}</p>
              <p v-if="post.event.startDate" class="mt-1 text-sm text-muted">
                {{ formatDate(post.event.startDate) }}<span v-if="post.event.endDate"> – {{ formatDate(post.event.endDate) }}</span>
              </p>
            </div>
          </div>
        </div>

        <div v-else-if="post.offer" class="mt-6 rounded-xl border border-default bg-elevated p-4">
          <div class="flex items-start gap-3">
            <svg viewBox="0 0 24 24" class="mt-0.5 size-5 shrink-0 text-default" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" aria-hidden="true"><path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82Z"/><circle cx="7.5" cy="6.5" r=".5" fill="currentColor"/></svg>
            <div>
              <p class="text-xs font-bold uppercase tracking-widest text-muted">{{ t('saya.posts.special_offer_label') }}</p>
              <p v-if="post.offer.title" class="mt-1 font-semibold text-default">{{ post.offer.title }}</p>
              <p v-if="post.offer.couponCode" class="mt-1 text-sm font-semibold text-default">
                {{ t('saya.posts.code_label') }} {{ post.offer.couponCode }}
              </p>
              <p v-if="post.offer.terms" class="mt-1 text-sm leading-6 text-muted">{{ post.offer.terms }}</p>
            </div>
          </div>
        </div>

        <div v-if="post.callToAction?.url || $slots.cta" class="mt-6">
          <slot name="cta" :cta="post.callToAction" :label="post.callToAction ? formatCta(post.callToAction.actionType) : null">
            <NuxtLink
              v-if="post.callToAction?.url"
              :to="post.callToAction.url"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--saya-surface-dark)] px-5 py-3.5 text-sm font-bold text-[var(--saya-on-surface-dark)] no-underline transition hover:opacity-90"
            >
              {{ formatCta(post.callToAction.actionType) }}
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </NuxtLink>
          </slot>
        </div>

        <div v-if="post.location?.title" class="mt-6 border-t border-default pt-5">
          <p class="text-xs font-bold uppercase tracking-widest text-muted">{{ t('saya.location.address') }}</p>
          <NuxtLink
            v-if="post.location.slug"
            :to="locationPath"
            class="mt-2 inline-flex items-center gap-2 font-semibold text-default no-underline transition hover:text-muted"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            {{ post.location.title }}
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </NuxtLink>
          <p v-else class="mt-2 font-semibold text-default">{{ post.location.title }}</p>
        </div>

        <div class="mt-6 border-t border-default pt-5 lg:mt-auto">
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-default bg-default px-5 py-3 text-sm font-semibold text-default transition hover:bg-elevated"
            @click="share"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
            {{ t('saya.posts.share') }}
          </button>
          <p v-if="shareStatus" role="status" class="mt-2 text-center text-xs text-muted lg:hidden">{{ shareStatus }}</p>
        </div>
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
interface SayaPostDetailMedia {
  id?: string
  mediaAssetId?: string
  url: string
  thumbnailUrl?: string | null
  kind: 'image' | 'video'
  role?: 'cover' | 'gallery'
  caption?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
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

interface SayaPostBrand {
  name: string
  logoUrl?: string | null
}

const props = withDefaults(defineProps<{
  post: SayaPostDetailPost
  brand?: SayaPostBrand
}>(), {
  brand: () => ({ name: 'KrabiClaw', logoUrl: null }),
})

defineSlots<{
  cta(_slotProps: { cta: SayaPostDetailPost['callToAction']; label: string | null }): unknown
}>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()

const brand = computed(() => ({
  name: props.brand.name || 'KrabiClaw',
  logoUrl: props.brand.logoUrl || null,
}))
const brandInitial = computed(() => brand.value.name.trim().charAt(0).toUpperCase() || 'K')
const locationPath = computed(() => props.post.location?.slug ? `/locations/${props.post.location.slug}` : '/locations')
const backTo = computed(() => props.post.location?.slug ? `/locations/${props.post.location.slug}/posts` : '/posts')
const description = computed(() => props.post.summary || props.post.body || '')

const mediaItems = computed<SayaPostDetailMedia[]>(() => {
  const source = props.post.media?.length ? props.post.media : props.post.gallery ?? []
  const items = [...source]
  const cover = props.post.cover
  if (cover && !items.some(item => mediaKey(item) === mediaKey(cover))) items.unshift(cover)
  return items.filter(item => item.url)
})

const currentIndex = ref(0)
const activeMedia = computed(() => mediaItems.value[currentIndex.value] ?? null)
const activeBackdropUrl = computed(() => {
  const item = activeMedia.value
  if (!item) return null
  return item.thumbnailUrl || (item.kind === 'image' ? item.url : null)
})
const hasMultipleMedia = computed(() => mediaItems.value.length > 1)
const hasPreviousMedia = computed(() => currentIndex.value > 0)
const hasNextMedia = computed(() => currentIndex.value < mediaItems.value.length - 1)

watch(mediaItems, (items) => {
  if (currentIndex.value >= items.length) currentIndex.value = Math.max(0, items.length - 1)
})

function mediaKey(item: SayaPostDetailMedia) {
  return item.id || item.mediaAssetId || item.url
}

function goToMedia(index: number) {
  if (index < 0 || index >= mediaItems.value.length) return
  currentIndex.value = index
}

function previousMedia() {
  if (hasPreviousMedia.value) currentIndex.value -= 1
}

function nextMedia() {
  if (hasNextMedia.value) currentIndex.value += 1
}

const swipeStartX = ref<number | null>(null)

function startSwipe(event: PointerEvent) {
  if (event.pointerType === 'mouse') return
  swipeStartX.value = event.clientX
}

function finishSwipe(event: PointerEvent) {
  if (swipeStartX.value === null) return
  const distance = event.clientX - swipeStartX.value
  swipeStartX.value = null
  if (Math.abs(distance) < 48) return
  if (distance < 0) nextMedia()
  else previousMedia()
}

function cancelSwipe() {
  swipeStartX.value = null
}

function formatCta(value: string | null | undefined) {
  if (!value) return t('saya.posts.cta_default')
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, char => char.toUpperCase())
}

const DESCRIPTION_TRUNCATE_THRESHOLD = 320
const descriptionExpanded = ref(false)
const descriptionTruncatable = computed(() => description.value.length > DESCRIPTION_TRUNCATE_THRESHOLD)

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
    if ((error as Error).name !== 'AbortError') flashShareStatus(t('saya.posts.share_failed'))
  }
}

onUnmounted(() => clearTimeout(shareStatusTimeout))
</script>
