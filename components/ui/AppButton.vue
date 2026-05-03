<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    :class="[
      'inline-flex items-center justify-center font-semibold transition-colors rounded-full',
      sizes[size],
      variants[variant],
      { 'opacity-50 cursor-not-allowed': disabled }
    ]"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>

<script setup>
import { NuxtLink } from '#components'

defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: v => ['primary', 'secondary', 'ghost', 'white', 'black'].includes(v)
  },
  size: {
    type: String,
    default: 'md',
    validator: v => ['sm', 'md', 'lg'].includes(v)
  },
  to: { type: String, default: null },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false }
})

const variants = {
  primary: 'bg-black text-white hover:bg-gray-800 border-2 border-black',
  secondary: 'bg-white text-black hover:bg-gray-100 border-2 border-black',
  ghost: 'bg-transparent text-black hover:bg-black/10 underline-offset-4 hover:underline',
  white: 'bg-white text-black hover:bg-gray-100 border-2 border-white',
  black: 'bg-black text-white hover:bg-gray-800 border-2 border-black'
}

const sizes = {
  sm: 'text-xs px-4 h-8',
  md: 'text-sm px-6 h-10',
  lg: 'text-base px-8 h-12'
}
</script>
