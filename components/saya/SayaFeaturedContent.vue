<template>
  <AppSection v-if="items.length && !allUnavailable" :bg="bg" :padding="padding">
    <!-- Section header -->
    <div class="mb-10">
      <p class="saya-kicker mb-6">{{ data.kicker }}</p>
      <h2 class="saya-display-md text-default">{{ data.heading }}</h2>
      <NuxtLink
        v-if="items.length && linkTarget"
        :to="localePath(linkTarget)"
        class="mt-4 inline-block border-b border-default pb-1 text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
      >
        {{ t('saya.common.view_all') }} →
      </NuxtLink>
    </div>

    <!-- Scroll track -->
    <div
      ref="trackRef"
      class="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <NuxtLink
        v-for="(item, i) in items"
        :key="i"
        :to="localePath(item.href || '')"
        data-carousel-item
        class="group relative flex w-[85vw] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl bg-elevated no-underline text-default transition hover:opacity-90 sm:w-[45vw] lg:w-[30vw]"
      >
        <!-- Image (when present) -->
        <div v-if="item.image" class="relative aspect-[4/3] overflow-hidden bg-muted">
          <SayaBadgeUnavailable
            v-if="item.unavailable"
            overlay
            :text="t('saya.common.temporarily_unavailable')"
          />
          <img
            :src="item.image"
            :srcset="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? cfImageSrcset(item.image) ?? undefined : undefined"
            :sizes="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? '(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw' : undefined"
            :alt="item.alt"
            loading="lazy"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        <!-- Card body -->
        <div class="flex flex-1 flex-col p-7">
          <div>
            <p v-if="item.category" class="saya-kicker mb-3 text-xs">{{ item.category }}</p>
            <p class="saya-display saya-italic text-2xl text-default leading-snug">{{ item.name }}</p>
            <p v-if="item.description" class="mt-3 text-sm leading-relaxed text-muted line-clamp-3">{{ item.description }}</p>
          </div>
          <div class="mt-auto pt-6">
            <p v-if="item.price" class="mb-4 flex items-baseline gap-2 text-xl font-semibold tabular-nums text-default">
              <span v-if="item.compareAtPrice" class="font-normal text-sm text-muted line-through">{{ item.compareAtPrice }}</span>
              <span>{{ item.price }}</span>
            </p>
            <span class="border-b border-current pb-0.5 text-xs uppercase tracking-widest text-default">
              {{ t('saya.common.view_dish') }} →
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Controls: ← [dashes] → centered below carousel -->
    <div class="mt-8 flex items-center justify-center gap-4">
      <button
        type="button"
        :disabled="activeIndex === 0"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-default text-default transition hover:opacity-60 disabled:opacity-25"
        aria-label="Previous"
        @click="scroll(-1)"
      >
        ←
      </button>
      <div class="flex items-center gap-3">
        <button
          v-for="(_, i) in items"
          :key="i"
          type="button"
          class="h-0.5 rounded-full transition-all duration-300"
          :class="i === activeIndex ? 'w-10 bg-inverted' : 'w-6 bg-inverted/30'"
          :aria-label="`Go to item ${i + 1}`"
          @click="scrollToIndex(i)"
        />
      </div>
      <button
        type="button"
        :disabled="activeIndex >= items.length - 1"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-default text-default transition hover:opacity-60 disabled:opacity-25"
        aria-label="Next"
        @click="scroll(1)"
      >
        →
      </button>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import { cfImageSrcset } from '~/utils/cf-image'

interface Props {
  data?: {
    items?: Array<{
      name: string
      image?: string | null
      alt?: string
      price?: string | null
      compareAtPrice?: string | null
      href?: string
      unavailable?: boolean
      category?: string | null
      description?: string | null
    }>
    kicker: string
    heading: string
    linkTarget?: string | null
  }
  bg?: string
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({ items: [], kicker: '', heading: '' }),
  bg: 'default',
  padding: 'lg'
})
const { localePath, t } = useI18n()

const items = computed(() => (props.data?.items || []).filter(item => Boolean(item.href)))
// A location-wide closure marks every item unavailable at once — showing a
// row of all-badged cards reads as broken, so hide the whole section instead.
const allUnavailable = computed(() => {
  const list = items.value
  return list.length > 0 && list.every(item => item.unavailable)
})
const linkTarget = computed(() => props.data?.linkTarget || '')

// --- Carousel state ---
const trackRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

function cards(): HTMLElement[] {
  return Array.from(trackRef.value?.querySelectorAll<HTMLElement>('[data-carousel-item]') ?? [])
}

function scrollToIndex(index: number) {
  const card = cards()[index]
  const track = trackRef.value
  if (!card || !track) return
  track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
}

function scroll(direction: -1 | 1) {
  scrollToIndex(Math.max(0, Math.min(items.value.length - 1, activeIndex.value + direction)))
}

// IntersectionObserver drives active dash state.
// Pick the entry with the highest intersectionRatio so fast swipes
// don't clobber activeIndex with an intermediate card.
let observer: IntersectionObserver | null = null

function setupObserver() {
  observer?.disconnect()
  const track = trackRef.value
  if (!track) return
  observer = new IntersectionObserver(
    (entries) => {
      const best = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!best) return
      const idx = cards().indexOf(best.target as HTMLElement)
      if (idx !== -1) activeIndex.value = idx
    },
    { root: track, threshold: 0.5 }
  )
  cards().forEach(card => observer!.observe(card))
}

// Re-run when items list changes (e.g. parent swaps location data).
watch(items, () => nextTick(setupObserver))
onMounted(setupObserver)
onBeforeUnmount(() => observer?.disconnect())
</script>
