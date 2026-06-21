<template>
  <UModal v-model:open="openModel" fullscreen :ui="{ content: 'bg-black overflow-hidden' }">
    <template #content>
      <div class="relative h-dvh w-full bg-black text-white">
        <!-- Header -->
        <div class="absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-4 pt-4 pb-4 bg-gradient-to-b from-black/70 to-transparent">
          <button
            class="flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-md"
            aria-label="Close"
            @click="openModel = false"
          >
            <UIcon name="i-heroicons-chevron-left" class="size-6" />
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
            class="relative h-dvh w-full snap-start snap-always"
          >
            <video
              v-if="item.kind === 'video'"
              :ref="el => setVideoRef(el, i)"
              :src="item.url"
              muted
              loop
              playsinline
              preload="metadata"
              class="h-full w-full object-cover"
            />
            <img
              v-else
              :src="item.url"
              :alt="item.alt || ''"
              class="h-full w-full object-cover"
            >

            <!-- Bottom caption gradient -->
            <div class="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pb-8 pt-40">
              <slot name="caption" :item="item" :index="i">
                <p v-if="item.description" class="text-lg leading-snug">{{ item.description }}</p>
              </slot>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UModal>
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
const videoRefs = ref<Record<number, HTMLVideoElement>>({})

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
  await nextTick()

  if (!open) {
    Object.values(videoRefs.value).forEach(video => video.pause())
    return
  }

  scroller.value?.scrollTo({
    top: currentIndex.value * getPageHeight(),
    behavior: 'auto'
  })

  syncVideos()
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
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
