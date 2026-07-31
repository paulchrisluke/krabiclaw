<template>
  <NuxtLink :to="`/menu/${item.slug}`" class="group block">
    <div class="aspect-square w-full overflow-hidden rounded-2xl bg-elevated relative">

      <!-- Video support -->

      <video
        v-if="isVideo"
        :src="mediaUrl"
        :poster="posterUrl"
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover"
        @error="handleVideoError"
        controls
      />

      <!-- Image -->
      <UImage
        v-else-if="mediaUrl"
        :src="mediaUrl"
        :alt="item.name"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <!-- No media placeholder -->
      <div v-else class="w-full h-full flex items-center justify-center">
        <span class="text-4xl">🍽</span>
      </div>

      <!-- Price badge -->
      <div class="absolute top-3 right-3 flex items-center gap-1.5">
        <span v-if="onSale" class="bg-black/60 text-white/70 text-xs line-through px-2 py-1 rounded-full">
          {{ formatMoneyAmount(item.compare_at_price_amount, item.currency || 'THB') }}
        </span>
        <span class="bg-black/80 text-white text-sm font-semibold px-3 py-1 rounded-full">
          {{ formatMoneyAmount(item.price_amount, item.currency || 'THB') }}
        </span>
      </div>

      <!-- Unavailable overlay -->
      <div v-if="!item.available" class="absolute inset-0 bg-black/50 flex items-center justify-center">
        <span class="text-white text-sm font-medium">Currently unavailable</span>
      </div>
    </div>

    <!-- Content below image -->
    <div class="mt-3 px-1">
      <h3 class="font-semibold text-default text-base leading-tight">{{ item.name }}</h3>
      <p v-if="item.description" class="mt-1 text-sm text-muted line-clamp-2">
        {{ item.description }}
      </p>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import { formatMoneyAmount, isSaleActive } from '~/shared/money'

interface MenuItem {
  slug: string
  name: string
  public_url?: string
  thumbnail_url?: string | null
  kind?: string | null
  media?: Array<{
    id: string
    kind: 'image' | 'video'
    public_url: string
    thumbnail_url: string | null
  }>
  poster?: string
  price_amount?: string | number | null
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  currency?: string
  available?: boolean
  description?: string
}

const props = defineProps<{ item: MenuItem }>()

const onSale = computed(() => isSaleActive(props.item))

const mediaUrl = computed(() => {
  const cover = props.item.media?.[0]
  if (cover?.public_url) return cover.public_url
  if (props.item.public_url) return props.item.public_url
  return ''
})

const posterUrl = computed(() => {
  const cover = props.item.media?.[0]
  return cover?.thumbnail_url || props.item.thumbnail_url || props.item.poster || undefined
})

const isVideo = computed(() => {
  const cover = props.item.media?.[0]
  if (cover?.kind) return cover.kind === 'video'
  if (props.item.kind) return props.item.kind === 'video'
  const url = mediaUrl.value
  return /\.(mp4|webm|mov)$/i.test(url)
})

const handleVideoError = () => {
  console.warn('[MenuItemCard] Video failed to load:', mediaUrl.value)
}
</script>
