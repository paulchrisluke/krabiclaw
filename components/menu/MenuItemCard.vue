<template>
  <NuxtLink :to="`/menu/${item.slug}`" class="group block">
    <div class="aspect-square w-full overflow-hidden rounded-2xl bg-(--ui-bg-elevated) relative">

      <!-- Video support -->
      <video
        v-if="isVideo"
        :src="item.image_url"
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover"
      />

      <!-- Image -->
      <img
        v-else-if="item.image_url"
        :src="item.image_url"
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
          {{ item.price ? `฿${item.price}` : 'TBD' }}
        </span>
      </div>

      <!-- Unavailable overlay -->
      <div v-if="!item.available" class="absolute inset-0 bg-black/50 flex items-center justify-center">
        <span class="text-white text-sm font-medium">Currently unavailable</span>
      </div>
    </div>

    <!-- Content below image -->
    <div class="mt-3 px-1">
      <h3 class="font-semibold text-(--ui-text) text-base leading-tight">{{ item.name }}</h3>
      <p v-if="item.description" class="mt-1 text-sm text-(--ui-text-muted) line-clamp-2">
        {{ item.description }}
      </p>
    </div>
  </NuxtLink>
</template>

<script setup>
const props = defineProps({ item: Object })

const isVideo = computed(() => {
  const url = props.item?.image_url || ''
  return url.match(/\.(mp4|webm|mov)$/i) || url.includes('video')
})
</script>
