<template>
  <section :class="['w-full', backgrounds[bg], padding]">
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
    default: 'py-16'
  }
})

const backgrounds = {
  white: 'bg-white text-black',
  black: 'bg-black text-white',
  gray: 'bg-gray-50 text-black'
}
</script>
