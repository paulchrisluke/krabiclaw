<template>
  <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" style="transform: rotate(-90deg)">
      <circle
        :cx="size / 2" :cy="size / 2" :r="r"
        fill="none" stroke="currentColor" stroke-width="4"
        class="text-default-200 dark:text-default-700"
      />
      <circle
        :cx="size / 2" :cy="size / 2" :r="r"
        fill="none" :stroke="ringColor" stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="`${dash} ${circumference}`"
        style="transition: stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1), stroke 0.4s"
      />
    </svg>
    <span
      class="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums"
      :style="{ color: ringColor }"
    >
      {{ Math.round(pct) }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  score: number
  size?: number
}>()

const size = computed(() => props.size ?? 42)
const r = computed(() => (size.value - 6) / 2)
const circumference = computed(() => 2 * Math.PI * r.value)
const pct = computed(() => Math.max(0, Math.min(100, props.score)))
const dash = computed(() => (pct.value / 100) * circumference.value)

const ringColor = computed(() => {
  if (pct.value >= 90) return 'var(--color-success-500)'
  if (pct.value >= 50) return 'var(--ui-primary)'
  return 'var(--color-warning-500)'
})
</script>
