<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-4 text-sm">
      <div class="flex min-w-0 items-center gap-2">
        <span v-if="prefix" class="shrink-0 text-base leading-none">{{ prefix }}</span>
        <span class="truncate font-medium text-highlighted">{{ label }}</span>
      </div>
      <span class="shrink-0 text-muted">{{ value }}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-muted">
      <div class="h-full rounded-full bg-primary transition-[width] duration-300" :style="{ width: `${boundedPercent}%` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  percent: number
  prefix?: string
}>()

const boundedPercent = computed(() => Math.max(0, Math.min(100, props.percent)))
</script>
