<template>
  <div class="rounded-xl overflow-hidden">
    <div v-if="items.length === 0" class="flex aspect-4/3 items-center justify-center bg-muted">
      <SayaIcon :name="emptyIcon" class="size-16 text-dimmed" />
    </div>

    <button
      v-else-if="items.length === 1"
      type="button"
      class="relative block aspect-4/3 w-full overflow-hidden border-0 bg-transparent p-0 text-left lg:h-[520px]"
      :aria-label="items[0]?.kind === 'video' ? `Play video, ${title}` : `Open media, ${title}`"
      @click="openLightbox(0)"
    >
      <video
        v-if="items[0]?.kind === 'video' && items[0]?.url"
        :ref="el => setVideoRef(el, 0)"
        :src="items[0].url"
        :poster="items[0].poster || undefined"
        preload="metadata"
        muted
        loop
        playsinline
        class="h-full w-full object-cover"
        @loadeddata="handleVideoLoaded(0)"
        @playing="markVideoPlaying(0)"
        @pause="markVideoPaused(0)"
        @waiting="markVideoWaiting(0)"
      />
      <img
        v-else
        :src="items[0]?.url"
        :alt="items[0]?.alt || title"
        class="h-full w-full object-cover"
      />
      <span
        v-if="items[0]?.kind === 'video' && !isVideoReady(0)"
        class="pointer-events-none absolute inset-0 animate-pulse bg-muted"
        aria-hidden="true"
      />
      <span
        v-if="items[0]?.kind === 'video' && !isVideoPlaying(0)"
        class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white"
        aria-hidden="true"
      >
        <span class="flex size-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
          <SayaIcon name="play" class="ml-0.5 size-6" />
        </span>
      </span>
    </button>

    <div v-else>
      <div
        class="grid gap-1 h-[360px] sm:h-[440px] lg:h-[520px]"
        :class="items.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'"
      >
        <button
          v-for="(item, index) in visibleItems"
          :key="`${item.url}-${index}`"
          type="button"
          class="relative h-full w-full overflow-hidden border-0 bg-transparent p-0 text-left"
          :class="index === 0 && items.length >= 3 ? 'row-span-2' : ''"
          :aria-label="item.kind === 'video' ? `Play video, ${title}` : `Open media, ${title}`"
          @click="openLightbox(index)"
        >
          <video
            v-if="item.kind === 'video' && item.url"
            :ref="el => setVideoRef(el, index)"
            :src="item.url"
            :poster="item.poster || undefined"
            preload="metadata"
            muted
            loop
            playsinline
            class="h-full w-full object-cover"
            @loadeddata="handleVideoLoaded(index)"
            @playing="markVideoPlaying(index)"
            @pause="markVideoPaused(index)"
            @waiting="markVideoWaiting(index)"
          />
          <img
            v-else
            :src="item.url"
            :alt="item.alt || title"
            class="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
          <span
            v-if="item.kind === 'video' && !isVideoReady(index)"
            class="pointer-events-none absolute inset-0 animate-pulse bg-muted"
            aria-hidden="true"
          />
          <span
            v-if="item.kind === 'video' && !isVideoPlaying(index)"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white"
            aria-hidden="true"
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
              <SayaIcon name="play" class="ml-0.5 size-5" />
            </span>
          </span>
          <span
            v-if="index === 3 && items.length > 4"
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white text-sm font-semibold backdrop-blur-[2px] hover:bg-black/60 transition-colors"
          >
            <SayaIcon name="squares-2x2" class="size-5" />
            Show all {{ items.length }} media
          </span>
        </button>
      </div>
    </div>

    <SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIndex" :items="items" :title="title">
      <template v-if="$slots.caption" #caption="slotProps">
        <slot name="caption" v-bind="slotProps" />
      </template>
    </SayaLightbox>
  </div>
</template>

<script setup lang="ts">
interface GalleryItem {
  url: string
  kind?: 'image' | 'video'
  poster?: string
  alt?: string
  description?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  items: GalleryItem[]
  title: string
  emptyIcon?: string
}>(), {
  emptyIcon: 'sparkles',
})

defineSlots<{
  caption(_slotProps: { item: GalleryItem; index: number }): unknown
}>()

const items = computed(() => props.items.filter(item => item.url))
const visibleItems = computed(() => items.value.slice(0, 4))
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const videoRefs = ref<Record<number, HTMLVideoElement>>({})
const videoVisibility = ref<Record<number, number>>({})
const videoReady = ref<Record<number, boolean>>({})
const videoPlaying = ref<Record<number, boolean>>({})
let videoObserver: IntersectionObserver | null = null
let syncToken = 0

function pauseVideo(video: HTMLVideoElement) {
  video.pause()
}

function pauseVideos() {
  Object.values(videoRefs.value).forEach(pauseVideo)
}

function mostVisibleVideoIndex() {
  let selectedIndex: number | null = null
  let selectedRatio = 0
  for (const [key, ratio] of Object.entries(videoVisibility.value)) {
    const index = Number(key)
    if (ratio > selectedRatio && videoRefs.value[index]) {
      selectedIndex = index
      selectedRatio = ratio
    }
  }
  return selectedRatio > 0 ? selectedIndex : null
}

function getViewportIntersectionRatio(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return 0

  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
  return (visibleWidth * visibleHeight) / (rect.width * rect.height)
}

function syncVideoVisibility() {
  for (const [key, video] of Object.entries(videoRefs.value)) {
    videoVisibility.value[Number(key)] = getViewportIntersectionRatio(video)
  }
}

function scheduleVideoPreviewSync() {
  if (!import.meta.client) return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    syncVideoVisibility()
    void syncVideoPreviews()
  }))
}

async function syncVideoPreviews() {
  const currentToken = ++syncToken
  if (!import.meta.client) return
  if (lightboxOpen.value || document.visibilityState !== 'visible') {
    pauseVideos()
    return
  }

  const selectedIndex = mostVisibleVideoIndex()
  for (const [key, video] of Object.entries(videoRefs.value)) {
    if (currentToken !== syncToken) return
    const index = Number(key)
    if (index !== selectedIndex) {
      pauseVideo(video)
      videoPlaying.value[index] = false
      continue
    }
    try {
      await video.play()
      if (currentToken !== syncToken) {
        return
      }
    } catch {
      videoPlaying.value[index] = false
    }
  }
}

function markVideoReady(index: number) {
  videoReady.value[index] = true
}

function handleVideoLoaded(index: number) {
  markVideoReady(index)
  syncVideoVisibility()
  void syncVideoPreviews()
}

function markVideoPlaying(index: number) {
  videoReady.value[index] = true
  videoPlaying.value[index] = true
}

function markVideoPaused(index: number) {
  videoPlaying.value[index] = false
}

function markVideoWaiting(index: number) {
  videoPlaying.value[index] = false
}

function isVideoReady(index: number) {
  return videoReady.value[index] === true
}

function isVideoPlaying(index: number) {
  return videoPlaying.value[index] === true
}

function setVideoRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (!import.meta.client || !(el instanceof HTMLVideoElement)) return
  createVideoObserver()
  videoRefs.value[index] = el
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markVideoReady(index)
  if (!el.paused && !el.ended) markVideoPlaying(index)
  videoObserver?.observe(el)
  scheduleVideoPreviewSync()
}

function disconnectVideoObserver() {
  videoObserver?.disconnect()
  videoObserver = null
  videoRefs.value = {}
  videoVisibility.value = {}
  videoReady.value = {}
  videoPlaying.value = {}
}

function createVideoObserver() {
  if (videoObserver) return
  if (!import.meta.client || !('IntersectionObserver' in window)) return

  videoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const index = Object.entries(videoRefs.value)
        .find(([, video]) => video === entry.target)?.[0]
      if (index === undefined) continue
      videoVisibility.value[Number(index)] = entry.isIntersecting ? entry.intersectionRatio : 0
    }
    void syncVideoPreviews()
  }, {
    threshold: [0, 0.25, 0.5, 0.75, 1],
  })
}

function onVisibilityChange() {
  void syncVideoPreviews()
}

function openLightbox(index: number) {
  if (!items.value[index]) return
  pauseVideos()
  lightboxIndex.value = index
  lightboxOpen.value = true
}

watch(lightboxOpen, () => {
  void syncVideoPreviews()
})

watch(items, async () => {
  disconnectVideoObserver()
  await nextTick()
  void syncVideoPreviews()
})

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('visibilitychange', onVisibilityChange)
  scheduleVideoPreviewSync()
})

onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('visibilitychange', onVisibilityChange)
  disconnectVideoObserver()
})
</script>
