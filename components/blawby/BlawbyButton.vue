<template>
  <component
    :is="componentTag"
    :href="isExternal ? to : undefined"
    :to="!isButton && !isExternal ? to : undefined"
    :type="isButton ? type : undefined"
    :target="isExternal ? '_blank' : undefined"
    :rel="isExternal ? 'noopener noreferrer' : undefined"
    class="inline-flex min-h-11 items-center justify-center border px-5 py-3 text-sm font-semibold no-underline transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)] focus-visible:ring-offset-2"
    :class="variant === 'outline'
      ? 'border-[var(--blawby-primary)] text-[var(--blawby-primary)] hover:bg-[var(--blawby-primary)] hover:text-white'
      : 'border-[var(--blawby-accent)] bg-[var(--blawby-accent)] text-[var(--blawby-primary)] hover:brightness-95'"
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
}>(), {
  to: '',
  as: 'link',
  type: 'button',
  variant: 'solid',
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
