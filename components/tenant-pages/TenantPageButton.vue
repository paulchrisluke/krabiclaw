<template>
  <a v-if="isExternal" :href="url" class="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{{ label }}</a>
  <NuxtLink v-else :to="url" class="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">{{ label }}</NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; url: string }>()
const isExternal = computed(() => /^https?:\/\//i.test(props.url))
</script>
