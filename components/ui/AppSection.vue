<template>
  <section :class="['w-full', bgClass, paddings[padding]]">
    <div class="max-w-6xl mx-auto px-4">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  bg: {
    type: String,
    default: 'white',
    validator: v => ['white', 'black', 'dark', 'alt', 'gray', 'stone'].includes(v)
  },
  padding: {
    type: String,
    default: 'default',
    validator: v => ['none', 'sm', 'default', 'lg', 'xl'].includes(v)
  }
})

const backgrounds = {
  white: 'bg-[color:var(--ui-bg)] text-[color:var(--ui-text)]',
  alt: 'bg-[color:var(--ui-bg-elevated)] text-[color:var(--ui-text)]',
  black: 'bg-[color:var(--ui-bg-inverted)] text-[color:var(--ui-text-inverted)]',
  dark: 'bg-[color:var(--ui-bg-inverted)] text-[color:var(--ui-text-inverted)]',
  gray: 'bg-[color:var(--ui-bg-elevated)] text-[color:var(--ui-text)]',
  stone: 'bg-[color:var(--ui-bg-elevated)] text-[color:var(--ui-text)]'
}

const bgClass = computed(() => backgrounds[props.bg])

const paddings = {
  none: 'py-0',
  sm: 'py-8',
  default: 'py-16',
  lg: 'py-20',
  xl: 'py-24'
}
</script>
