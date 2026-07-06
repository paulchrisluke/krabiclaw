<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="glyphClass"
    aria-hidden="true"
  >
    <template v-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </template>
    <template v-else-if="name === 'book'">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" />
    </template>
    <template v-else-if="name === 'newspaper'">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v13.5A2.5 2.5 0 0 1 17.5 20H6.5A2.5 2.5 0 0 1 4 17.5Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </template>
    <template v-else-if="name === 'circle-help'">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.2-1.7 2.2" />
      <path d="M12 17h.01" />
    </template>
    <template v-else-if="name === 'credit-card'">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </template>
    <template v-else-if="name === 'layout-dashboard'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M9 9h12" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.1a1 1 0 0 0-.9.6Z" />
    </template>
    <template v-else-if="name === 'globe'">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </template>
    <template v-else-if="name === 'users'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 4.1a3 3 0 0 1 0 5.8" />
    </template>
    <template v-else-if="name === 'chart-bar'">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-6" />
      <path d="M22 20v-12" />
    </template>
    <template v-else-if="name === 'sparkles'">
      <path d="M12 3l1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
    </template>
    <template v-else-if="name === 'star'">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.3 1.1 6.1L12 17l-5.6 3 1.1-6.1L3 9.6l6.2-.9L12 3Z" />
    </template>
    <template v-else-if="name === 'layout-template'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 5v14" />
    </template>
    <template v-else-if="name === 'log-in'">
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 11h18" />
    </template>
    <template v-else-if="name === 'inbox'">
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-8Z" />
    </template>
    <template v-else-if="name === 'camera'">
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </template>
    <template v-else-if="name === 'images'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m8 13 2-2 3 3 2-2 3 3" />
      <circle cx="8.5" cy="9" r="1" />
    </template>
    <template v-else-if="name === 'messages-square'">
      <path d="M7 18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2" />
      <path d="M8 8h8" />
      <path d="M8 12h4" />
      <path d="M13 21h6l3-3v-8a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z" />
    </template>
    <template v-else-if="name === 'file-pen'">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
      <path d="m11 15 4-4 2 2-4 4-3 1 1-3Z" />
    </template>
    <template v-else-if="name === 'file-stack'">
      <path d="M7 5h10a2 2 0 0 1 2 2v10" />
      <rect x="5" y="3" width="12" height="14" rx="2" />
      <rect x="7" y="7" width="12" height="14" rx="2" />
    </template>
    <template v-else-if="name === 'ticket'">
      <path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3Z" />
      <path d="M13 6v12" />
    </template>
    <template v-else-if="name === 'utensils-crossed'">
      <path d="m4 4 7 7" />
      <path d="m10 4-6 6" />
      <path d="m13 13 7 7" />
      <path d="m14 4 6 6" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="8" />
    </template>
  </svg>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  class?: string
}>(), {
  class: 'size-4',
})

const glyphClass = computed(() => props.class)
</script>
