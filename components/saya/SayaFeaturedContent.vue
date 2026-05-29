<template>
  <section v-if="items.length" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
    <!-- Section header -->
    <div class="mb-10 flex flex-col gap-3 border-b border-default pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="saya-kicker mb-3">{{ copy.featuredEyebrow }}</p>
        <h2 class="saya-display-sm saya-italic text-default">{{ copy.featuredHeading }}</h2>
        <p class="mt-3 max-w-sm text-sm text-muted">{{ copy.featuredSubtitle }}</p>
      </div>
      <NuxtLink
        :to="linkTarget"
        class="group mb-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-default no-underline opacity-70 transition-opacity hover:opacity-100"
      >
        {{ copy.featuredViewAll }}
        <span class="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
      </NuxtLink>
    </div>

    <!-- Cards -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="(item, i) in items"
        :key="i"
        :to="item.href || linkTarget"
        class="group flex flex-col overflow-hidden rounded-2xl border border-default bg-elevated no-underline text-default transition duration-300 hover:shadow-xl"
      >
        <div class="aspect-4/5 overflow-hidden bg-muted">
          <video
            v-if="item.imageKind === 'video' && item.image"
            :src="clientReady ? item.image : undefined"
            :autoplay="i === 0"
            :preload="i === 0 ? 'auto' : 'none'"
            muted
            loop
            playsinline
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <img
            v-else-if="item.image"
            :src="item.image"
            :alt="item.alt || item.name"
            :loading="i === 0 ? 'eager' : 'lazy'"
            :fetchpriority="i === 0 ? 'high' : 'auto'"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          >
          <div v-else class="flex h-full w-full items-center justify-center">
            <UIcon name="i-heroicons-sparkles" class="size-10 text-muted" />
          </div>
        </div>

        <div class="flex grow items-end justify-between gap-4 p-5">
          <div class="min-w-0">
            <p class="saya-display saya-italic text-lg leading-snug text-default line-clamp-2">{{ item.name }}</p>
            <p v-if="item.price" class="mt-1 tabular-nums text-xs text-muted">{{ item.price }}</p>
          </div>
          <span class="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-default">→</span>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { getVerticalCopy } from '~/utils/vertical-copy'

interface FeaturedItem {
  name: string
  image?: string
  imageKind?: string
  alt?: string
  price?: string
  href?: string
}

interface Props {
  data?: {
    items?: FeaturedItem[]
    hasMenu?: boolean
    vertical?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const items = computed(() => props.data?.items ?? [])
const hasMenu = computed(() => props.data?.hasMenu ?? false)
const vertical = computed(() => props.data?.vertical ?? 'restaurant')

const clientReady = ref(false)
onMounted(() => { clientReady.value = true })

const copy = computed(() => getVerticalCopy(vertical.value))
const linkTarget = computed(() => hasMenu.value ? '/menu' : '/experiences')
</script>
