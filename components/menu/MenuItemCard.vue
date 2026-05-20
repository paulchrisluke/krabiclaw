<template>
  <NuxtLink :to="`/menu/${item.slug}`" class="group block">
    <div class="aspect-square w-full overflow-hidden rounded-2xl bg-elevated relative">

      <!-- Video support -->

      <video
        v-if="isVideo"
        :src="mediaUrl"
        :poster="item.poster"
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover"
        @error="handleVideoError"
        controls
      />

      <!-- Image -->
      <img
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
      <div class="absolute top-3 right-3">
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
import { formatMoneyAmount } from '~/shared/money'

interface MenuItem {
  slug: string
  name: string
  image_asset_id?: string | null
  public_url?: string
  poster?: string
  price_amount?: string | number | null
  currency?: string
  available?: boolean
  description?: string
}

const props = defineProps<{
  item: MenuItem
  resolveAssetUrl?: (_assetId: string) => string
}>()

const mediaUrl = computed(() => {
  if (props.item.public_url) return props.item.public_url
  if (props.item.image_asset_id && props.resolveAssetUrl) {
    return props.resolveAssetUrl(props.item.image_asset_id)
  }
  return ''
})

const isVideo = computed(() => {
  const url = mediaUrl.value
  return /\.(mp4|webm|mov)$/i.test(url)
})

const handleVideoError = () => {
  console.warn('[MenuItemCard] Video failed to load:', mediaUrl.value)
}
</script>
