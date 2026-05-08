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
    v-bind="hoverable ? { role: 'button', tabindex: 0 } : {}"
    @keydown="hoverable ? handleKeydown : undefined"
  >
    <slot />
  </div>
</template>

/**
 * AppCard Component
 * @props variant - 'default', 'elevated' (with shadow+border), 'outlined' (with border)
 * @props border - Optional additional border weight/color
 * @props hoverable - Enables button role and hover effects
 */
<script setup lang="ts">
const props = defineProps<{
  variant: 'default' | 'elevated' | 'outlined'
  border: 'none' | 'light' | 'medium' | 'dark'
  hoverable: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const variantClasses = {
  default: 'bg-[color:var(--ui-bg)] text-[color:var(--ui-text)]',
  elevated: 'bg-[color:var(--ui-bg)] text-[color:var(--ui-text)] shadow-md border-[color:var(--ui-border)]',
  outlined: 'bg-[color:var(--ui-bg)] text-[color:var(--ui-text)] border-[color:var(--ui-border)]'
}

const borderClasses = {
  none: '',
  light: 'border-[color:var(--ui-border)]',
  medium: 'border-2 border-[color:var(--ui-border)]',
  dark: 'border-2 border-[color:var(--ui-border)]'
}

const handleClick = (event: MouseEvent) => {
  if (props.hoverable) {
    emit('click', event)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.hoverable) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    // Synthesize a MouseEvent to ensure consumers get consistent event types
    handleClick(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }
}
</script>
