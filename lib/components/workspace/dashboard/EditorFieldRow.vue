<template>
  <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 border-t border-default pt-2 text-left first:border-0 first:pt-0" @click="$emit('click')">
    <span class="text-[13px] font-medium text-highlighted">{{ label }}</span>
    <span class="flex items-center gap-1.5 text-[13px]" :class="filled ? 'text-muted' : 'text-dimmed'">
      {{ filled ? 'Added' : 'Not set' }}
      <UIcon name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
    </span>
  </button>
</template>

<script setup lang="ts">
// A registry row: label, filled state, chevron. Never the value — a row states whether a
// field is filled, the value itself only ever appears inside SingleFieldEditor.
defineProps<{ label: string, filled: boolean }>()
defineEmits<{ click: [] }>()
</script>
