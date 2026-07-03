<template>
  <div
    class="rounded-2xl border border-default bg-default p-6"
    :class="hover ? 'transition hover:border-muted hover:shadow-sm' : ''"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  hover?: boolean
}>(), {
  hover: false,
})
</script>
