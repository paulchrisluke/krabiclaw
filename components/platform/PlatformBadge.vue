<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
    :class="colorClass"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  color?: 'primary' | 'neutral'
}>(), {
  color: 'primary',
})

const colorClass = computed(() => ({
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-muted text-muted',
}[props.color]))
</script>
