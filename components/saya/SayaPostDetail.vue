<template>
  <article class="relative">
    <section class="relative flex min-h-[70vh] w-full flex-col justify-end bg-black sm:min-h-[80vh]">
      <div class="absolute inset-0 overflow-hidden">
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
      </div>

      <div class="absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-6">
        <NuxtLink
          to="/posts"
          class="inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-medium text-white no-underline backdrop-blur-md transition hover:bg-black/50"
        >
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          {{ t('saya.posts.back_to_updates') }}
        </NuxtLink>
      </div>

      <!-- Content is in normal flow (not absolutely positioned against a fixed pt),
           so a long heading/summary grows the section instead of overlapping the
           back button above or clipping the CTAs below — both previously happened
           depending on viewport aspect ratio. -->
      <div class="relative z-10 bg-linear-to-t from-black/90 via-black/55 to-transparent px-5 pb-10 pt-24 sm:px-10">
        <div class="mx-auto max-w-3xl">
          <time v-if="post.createTime" :datetime="post.createTime" class="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/60">
            {{ formatDate(post.createTime) }}
          </time>
          <h1 class="saya-display-md text-white">
            <em class="saya-italic">{{ post.title || t('saya.posts.business_update') }}</em>
          </h1>
          <p v-if="post.location" class="mt-2 text-sm text-white/70">{{ post.location.title }}</p>

          <div class="mt-4 whitespace-pre-line text-base leading-7 text-white/90">{{ post.summary || post.body }}</div>

          <div v-if="post.event" class="mt-4 rounded-xl bg-white/10 p-3 text-sm backdrop-blur-md">
            <p class="mb-1 font-bold text-white">{{ t('saya.posts.event_details_label') }}</p>
            <p class="text-white/90">{{ post.event.title }} <span v-if="post.event.startDate">• {{ formatDate(post.event.startDate) }}</span></p>
          </div>
          <div v-if="post.offer" class="mt-4 rounded-xl bg-white/10 p-3 text-sm backdrop-blur-md">
            <p class="mb-1 font-bold text-white">{{ t('saya.posts.special_offer_label') }}</p>
            <p class="text-white/90">{{ post.offer.title }} <span v-if="post.offer.couponCode">• {{ t('saya.posts.code_label') }} {{ post.offer.couponCode }}</span></p>
            <p v-if="post.offer.terms" class="mt-1 text-white/70">{{ post.offer.terms }}</p>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            <!-- Configurable post CTA — one button, like Facebook/Instagram post CTAs:
                 the post author chooses the button text (actionType) and destination
                 (url). Slot lets a caller fully replace it; default renders the
                 standard button from post.callToAction. -->
            <slot name="cta" :cta="post.callToAction" :label="post.callToAction ? formatCta(post.callToAction.actionType) : null">
              <NuxtLink
                v-if="post.callToAction?.url"
                :to="post.callToAction.url"
                class="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black no-underline transition hover:bg-zinc-200"
              >
                {{ formatCta(post.callToAction.actionType) }}
              </NuxtLink>
            </slot>
            <NuxtLink
              v-if="post.location?.slug"
              :to="`/locations/${post.location.slug}`"
              class="inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white no-underline backdrop-blur-md transition hover:bg-white/25"
            >
              {{ t('saya.posts.view_location') }}
            </NuxtLink>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/25"
              @click="copyUrl"
            >
              {{ copied ? t('saya.posts.link_copied') : t('saya.posts.copy_link') }}
            </button>
          </div>
        </div>
      </div>
    </section>

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
  return (value || 'Learn more').replaceAll('_', ' ').toLowerCase().replace(/^\w/, char => char.toUpperCase())
}

const copied = ref(false)
let copiedTimeout: ReturnType<typeof setTimeout> | undefined

async function copyUrl() {
  if (!import.meta.client) return
  if (!navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    clearTimeout(copiedTimeout)
    copiedTimeout = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard write failed (e.g. permission denial); leave state unchanged
  }
}

onUnmounted(() => clearTimeout(copiedTimeout))
</script>
