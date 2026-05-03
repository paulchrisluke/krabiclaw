<template>
  <div class="relative w-full bg-black text-white overflow-hidden" :style="minHeight">
    <!-- Background image slot -->
    <div v-if="image" class="absolute inset-0">
      <img :src="image" :alt="title" class="w-full h-full object-cover opacity-50" />
    </div>

    <!-- Background video slot -->
    <div v-if="video" class="absolute inset-0">
      <video
        :src="video"
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover opacity-50"
      />
    </div>

    <!-- Content -->
    <div class="relative z-10 max-w-6xl mx-auto px-4 flex flex-col items-center justify-center text-center h-full" :style="minHeight">
      <h1 class="text-4xl md:text-6xl font-bold mb-4 leading-tight">{{ props.title }}</h1>
      <p v-if="props.subtitle" class="text-lg md:text-xl opacity-90 max-w-2xl">{{ props.subtitle }}</p>
      <div v-if="$slots.cta" class="mt-8">
        <slot name="cta" />
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: null },
  image: { type: String, default: null },
  video: { type: String, default: null },
  height: { type: String, default: '60vh' }
})

const minHeight = computed(() => ({ minHeight: props.height }))
</script>
