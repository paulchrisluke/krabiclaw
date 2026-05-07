<template>
  <section :class="['w-full', bgClass, paddings[padding]]">
    <div class="max-w-6xl mx-auto px-4">
      <slot />
    </div>
  </section>
</template>

<script setup>
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
  white: 'bg-(--ui-bg) text-(--ui-text)',
  alt: 'bg-(--ui-bg-elevated) text-(--ui-text)',
  black: 'bg-(--ui-bg-inverted) text-(--ui-text-inverted)',
  dark: 'bg-(--ui-bg-inverted) text-(--ui-text-inverted)',
  gray: 'bg-(--ui-bg-elevated) text-(--ui-text)',
  stone: 'bg-(--ui-bg-elevated) text-(--ui-text)'
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
