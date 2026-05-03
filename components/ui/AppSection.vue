<template>
  <section :class="['w-full', backgrounds[bg], paddings[padding]]">
    <div class="max-w-6xl mx-auto px-4">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  bg: {
    type: String,
    default: 'white',
    validator: v => ['white', 'black', 'gray'].includes(v)
  },
  padding: {
    type: String,
    default: 'default',
    validator: v => ['none', 'sm', 'default', 'lg', 'xl'].includes(v)
  }
})

const backgrounds = {
  white: 'bg-white text-black',
  black: 'bg-black text-white',
  gray: 'bg-gray-50 text-black'
}

const paddings = {
  none: 'py-0',
  sm: 'py-8',
  default: 'py-16',
  lg: 'py-20',
  xl: 'py-24'
}
</script>
