<template>
  <span :class="['inline-flex shrink-0 items-center justify-center overflow-hidden', containerClass]">
    <img
      src="/saya-logo.png"
      alt=""
      :class="['h-full w-full object-contain', imageClass]"
    >
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  containerClass?: string
  imageClass?: string
}>(), {
  containerClass: 'size-9 rounded-lg text-zinc-950',
  imageClass: '',
})
</script>
