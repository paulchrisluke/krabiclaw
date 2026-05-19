<template>
  <UAvatar
    :src="src || undefined"
    :alt="avatarAlt"
    :size="size"
    :ui="{ fallback: fallbackClass }"
  >
    <template v-if="!src" #fallback>
      {{ initials }}
    </template>
  </UAvatar>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  src?: string | null
  name?: string | null
  alt?: string | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  fallbackClass?: string
}>(), {
  src: null,
  name: null,
  alt: null,
  size: 'md',
  fallbackClass: 'bg-primary text-white text-sm font-semibold'
})

const avatarAlt = computed(() => props.alt || props.name || 'Avatar')

const initials = computed(() => {
  const value = props.name?.trim()
  if (!value) return ''
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})
</script>
