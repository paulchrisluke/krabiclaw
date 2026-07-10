<template>
  <svg v-if="normalized === 'linkedin'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.94 8.5H3.56V19h3.38V8.5ZM5.25 3A1.96 1.96 0 1 0 5.25 6.92 1.96 1.96 0 0 0 5.25 3ZM20.44 12.98c0-3.17-1.69-4.64-3.95-4.64a3.42 3.42 0 0 0-3.1 1.7V8.5H10V19h3.39v-5.2c0-1.37.26-2.7 1.96-2.7 1.68 0 1.7 1.57 1.7 2.8V19h3.39v-6.02Z" />
  </svg>
  <svg v-else-if="normalized === 'facebook'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M14 8.5V7c0-.83.67-1.5 1.5-1.5H17V2h-3a4 4 0 0 0-4 4v2.5H7V12h3v10h4V12h3l.5-3.5H14Z" />
  </svg>
  <svg v-else-if="normalized === 'instagram'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
  <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22 12s0-4.1-.52-6.08a2.7 2.7 0 0 0-1.9-1.9C17.6 3.5 12 3.5 12 3.5s-5.6 0-7.58.52a2.7 2.7 0 0 0-1.9 1.9C2 7.9 2 12 2 12s0 4.1.52 6.08a2.7 2.7 0 0 0 1.9 1.9c1.98.52 7.58.52 7.58.52s5.6 0 7.58-.52a2.7 2.7 0 0 0 1.9-1.9C22 16.1 22 12 22 12Zm-12 3.5v-7l6 3.5-6 3.5Z" />
  </svg>
</template>

<script setup lang="ts">
const props = defineProps<{ platform: string }>()
const normalized = computed(() => props.platform.trim().toLowerCase().replace(/[^a-z]/g, ''))
</script>
