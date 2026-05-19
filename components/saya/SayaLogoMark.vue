<template>
  <span :class="['inline-flex shrink-0 items-center justify-center overflow-hidden', containerClass]">
    <img
      v-if="!logoFailed"
      src="/saya-logo.png"
      alt=""
      :class="['h-full w-full object-contain', imageClass]"
      @error="logoFailed = true"
    >
    <span v-else :class="fallbackClass">S</span>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  containerClass?: string
  imageClass?: string
  fallbackClass?: string
}>(), {
  containerClass: 'size-9 rounded-lg text-zinc-950',
  imageClass: '',
  fallbackClass: 'flex h-full w-full items-center justify-center rounded-lg bg-white text-sm font-bold'
})

const logoFailed = ref(false)
</script>
