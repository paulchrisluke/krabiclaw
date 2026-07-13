<template>
  <button
    v-if="isButton"
    v-bind="$attrs"
    :type="type"
    :disabled="disabled"
    :class="buttonClasses"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
  <component
    :is="linkTag"
    v-else
    :href="isExternal ? to : undefined"
    :to="isExternal ? undefined : to"
    :target="isExternal ? '_blank' : undefined"
    :rel="isExternal ? 'noopener noreferrer' : undefined"
    class="inline-block no-underline"
    @click="$emit('click', $event)"
  >
    <span v-bind="$attrs" :class="buttonClasses">
      <slot />
    </span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'

defineOptions({ inheritAttrs: false })

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
const linkTag = computed(() => isExternal.value ? 'a' : NuxtLink)
const buttonClasses = computed(() => [
  'group inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold uppercase no-underline disabled:cursor-not-allowed disabled:opacity-60 min-[1920px]:px-4 min-[1920px]:py-4 min-[1920px]:text-base min-[2560px]:px-5 min-[2560px]:py-5 min-[2560px]:text-lg',
  props.variant === 'outline'
    ? 'bg-[var(--blawby-accent-100)] text-[var(--blawby-primary)] hover:bg-[var(--blawby-accent-200)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-accent)] focus-visible:ring-offset-2'
    : 'bg-[var(--blawby-accent-button)] text-white hover:bg-[var(--blawby-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-accent)] focus-visible:ring-offset-2',
])
</script>
