<template>
  <div
    :class="[
      'rounded-xl overflow-hidden transition-all duration-200',
      variantClasses[variant],
      borderClasses[border],
      {
        'cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-1': hoverable,
        'cursor-default': !hoverable
      }
    ]"
    @click="handleClick"
  >
    <slot />
  </div>
</template>

<script setup>
const props = defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'elevated', 'outlined'].includes(value)
  },
  border: {
    type: String,
    default: 'none',
    validator: (value) => ['none', 'light', 'medium', 'dark'].includes(value)
  },
  hoverable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])

const variantClasses = {
  default: 'bg-white border border-stone-200',
  elevated: 'bg-white shadow-md border border-stone-200',
  outlined: 'bg-white border-2 border-stone-300'
}

const borderClasses = {
  none: '',
  light: 'border border-stone-200',
  medium: 'border-2 border-stone-300',
  dark: 'border-2 border-stone-900'
}

const handleClick = (event) => {
  if (props.hoverable) {
    emit('click', event)
  }
}
</script>
