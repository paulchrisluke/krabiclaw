<template>
  <Teleport to="body">
    <div ref="lightboxRoot" v-if="openModel" class="fixed inset-0 z-100 h-dvh w-full overflow-hidden bg-black text-white" role="dialog" aria-modal="true" :aria-label="title || 'Media Lightbox'">
      <!-- Header -->
      <div class="absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-4 pt-4 pb-4 bg-linear-to-b from-black/70 to-transparent">
        <button
          ref="closeButton"
          class="flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-md"
          aria-label="Close"
          @click="openModel = false"
        >
          <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>
        </button>

        <div class="min-w-0 flex-1">
          <div v-if="title" class="truncate text-base font-semibold">{{ title }}</div>
          <div v-if="items.length > 1" class="text-xs text-white/70">{{ currentIndex + 1 }} / {{ items.length }}</div>
        </div>
      </div>

      <!-- Vertical viewer -->
      <div
        ref="scroller"
        class="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain touch-pan-y scrollbar-hide"
        @scroll.passive="onScroll"
      >
        <section
          v-for="(item, i) in items"
          :key="`${item.url}-${i}`"
          class="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black"
        >
          <!-- Blurred fill behind letterboxed media, TikTok-style -->
          <video
            v-if="item.kind === 'video'"
            :src="item.url"
            muted
            playsinline
            preload="metadata"
            aria-hidden="true"
            tabindex="-1"
            class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl select-none"
          />
          <img
            v-else
            :src="item.url"
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl select-none"
          >

          <video
            v-if="item.kind === 'video'"
            :ref="el => setVideoRef(el, i)"
            :src="item.url"
            muted
            loop
            playsinline
            preload="metadata"
            class="relative z-10 h-full w-full object-contain"
          />
          <img
            v-else
            :src="item.url"
            :alt="item.alt || ''"
            class="relative z-10 h-full w-full object-contain"
          >

          <!-- Bottom caption gradient -->
          <div class="absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/90 via-black/55 to-transparent px-5 pb-8 pt-40">
            <slot name="caption" :item="item" :index="i">
              <p v-if="item.description" class="text-lg leading-snug">{{ item.description }}</p>
            </slot>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface LightboxItem {
  url: string
  kind?: 'image' | 'video'
  alt?: string
  description?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  open?: boolean
  items?: LightboxItem[]
  index?: number
  title?: string
}>(), {
  open: false,
  items: () => [],
  index: 0,
  title: undefined
})

defineSlots<{
  caption(_slotProps: { item: LightboxItem; index: number }): unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:index': [value: number]
}>()

const openModel = computed({
  get: () => props.open ?? false,
  set: (value: boolean) => emit('update:open', value)
})

const indexModel = computed({
  get: () => props.index ?? 0,
  set: (value: number) => emit('update:index', value)
})

const items = computed(() => props.items ?? [])
const scroller = ref<HTMLElement | null>(null)
const lightboxRoot = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLElement | null>(null)
const videoRefs = ref<Record<number, HTMLVideoElement>>({})

const { acquire: acquireScrollLock, release: releaseScrollLock } = useScrollLock()

const currentIndex = computed(() => {
  if (!items.value.length) return 0
  return Math.min(Math.max(indexModel.value, 0), items.value.length - 1)
})

watch(items, () => {
  videoRefs.value = {}
})

function setVideoRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLVideoElement) {
    videoRefs.value[index] = el
  }
}

function syncVideos() {
  for (const [key, video] of Object.entries(videoRefs.value)) {
    const i = Number(key)

    if (i === currentIndex.value) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }
}

function getPageHeight() {
  return scroller.value?.clientHeight || window.innerHeight
}

watch(indexModel, async () => {
  await nextTick()
  syncVideos()
})

watch(() => props.open, async (open) => {
  if (open) {
    acquireScrollLock()
    await nextTick()
    // Focus the close button when lightbox opens
    closeButton.value?.focus()
  } else {
    releaseScrollLock()
    Object.values(videoRefs.value).forEach(video => video.pause())
    return
  }

  await nextTick()

  scroller.value?.scrollTo({
    top: currentIndex.value * getPageHeight(),
    behavior: 'auto'
  })

  syncVideos()
})

function handleKeyDown(e: KeyboardEvent) {
  if (!openModel.value) return
  
  if (e.key === 'Tab' && lightboxRoot.value) {
    const focusableElements = Array.from(lightboxRoot.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), input[type="checkbox"]:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ))
    
    if (focusableElements.length === 0) return
    
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    if (!firstElement || !lastElement) return
    
    if (e.shiftKey) {
      // Shift+Tab on first element → focus last element
      if (document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
    } else {
      // Tab on last element → focus first element
      if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }
  }
}

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', handleKeyDown)
    releaseScrollLock()
  }
})

function onScroll() {
  if (!scroller.value) return
  const nextIndex = Math.round(scroller.value.scrollTop / getPageHeight())
  if (nextIndex !== indexModel.value && nextIndex >= 0 && nextIndex < items.value.length) {
    indexModel.value = nextIndex
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') openModel.value = false
  if (e.key === 'ArrowDown' && indexModel.value < items.value.length - 1) {
    indexModel.value++
    scroller.value?.scrollTo({ top: currentIndex.value * getPageHeight(), behavior: 'smooth' })
  }
  if (e.key === 'ArrowUp' && indexModel.value > 0) {
    indexModel.value--
    scroller.value?.scrollTo({ top: currentIndex.value * getPageHeight(), behavior: 'smooth' })
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  releaseScrollLock()
})
</script>
