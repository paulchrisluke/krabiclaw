<template>
  <component
    :is="componentTag"
    :href="isExternal ? to : undefined"
    :to="!isButton && !isExternal ? to : undefined"
    :type="isButton ? type : undefined"
    :disabled="isButton ? disabled : undefined"
    :target="isExternal ? '_blank' : undefined"
    :rel="isExternal ? 'noopener noreferrer' : undefined"
    class="group inline-flex items-center justify-center rounded-lg px-3 py-3 text-sm font-semibold uppercase no-underline disabled:cursor-not-allowed disabled:opacity-60"
    :class="variant === 'outline'
      ? 'bg-[var(--blawby-accent-100)] text-[var(--blawby-primary)] hover:bg-[var(--blawby-accent-200)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-accent)] focus-visible:ring-offset-2'
      : 'bg-[var(--blawby-accent)] text-white hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-accent)] focus-visible:ring-offset-2'"
    @click="$emit('click', $event)"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'

const props = withDefaults(defineProps<{
  to?: string
  as?: 'button' | 'link'
  type?: 'button' | 'submit' | 'reset'
  variant?: 'solid' | 'outline'
  disabled?: boolean
}>(), {
  to: '',
  as: 'link',
  type: 'button',
  variant: 'solid',
  disabled: false,
})

defineEmits<{
  click: [event: MouseEvent]
}>()

const isButton = computed(() => props.as === 'button')
const isExternal = computed(() => !isButton.value && (/^https?:\/\//i.test(props.to) || props.to.startsWith('mailto:') || props.to.startsWith('tel:')))
const componentTag = computed(() => {
  if (isButton.value) return 'button'
  return isExternal.value ? 'a' : NuxtLink
})
</script>
