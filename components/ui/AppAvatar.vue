<template>
  <img
    v-if="src && !imageError"
    :src="src"
    :alt="avatarAlt"
    class="shrink-0 rounded-full object-cover"
    :class="sizeClass"
    @error="imageError = true"
  >
  <div
    v-else
    class="flex shrink-0 items-center justify-center rounded-full"
    :class="[sizeClass, fallbackClass]"
    :aria-label="avatarAlt"
  >
    {{ initials }}
  </div>
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
  fallbackClass: 'bg-primary text-on-primary text-sm font-semibold'
})

const sizeClasses = {
  '3xs': 'size-4',
  '2xs': 'size-5',
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-9',
  xl: 'size-10',
  '2xl': 'size-11',
  '3xl': 'size-12',
}
const sizeClass = computed(() => sizeClasses[props.size])

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

const imageError = ref(false)
watch(() => props.src, () => {
  imageError.value = false
})
</script>
