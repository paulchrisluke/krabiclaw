<template>
  <div
    class="rounded-2xl border px-4 py-3"
    :class="toneClass"
  >
    <div class="flex items-start gap-3">
      <PlatformIcon v-if="iconName" :name="iconName" class="mt-0.5 size-5 shrink-0" />
      <div class="min-w-0">
        <p v-if="title" class="text-sm font-semibold">{{ title }}</p>
        <p class="text-sm leading-relaxed" :class="title ? 'mt-1' : ''">
          <slot />
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  tone?: 'info' | 'success' | 'warning' | 'error'
  title?: string
}>(), {
  tone: 'info',
  title: '',
})

const toneClass = computed(() => ({
  info: 'border-default bg-elevated/60 text-default',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
}[props.tone]))

const iconName = computed(() => ({
  info: 'sparkles',
  success: 'check-circle',
  warning: 'exclamation-triangle',
  error: 'exclamation-triangle',
}[props.tone]))
</script>
