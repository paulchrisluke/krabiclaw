<template>
  <UCard>
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-dimmed mb-2.5">
      {{ title }}
    </h3>
    <div class="text-sm text-default">
      <slot />
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>
