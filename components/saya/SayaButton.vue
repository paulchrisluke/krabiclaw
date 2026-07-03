<template>
  <NuxtLink v-if="to" :to="to" :class="[classes, { 'pointer-events-none opacity-60': disabled || loading }]" :aria-disabled="disabled || loading || undefined" :tabindex="disabled || loading ? -1 : undefined" @click="handleClick">
    <SayaIcon v-if="loading" name="arrow-path" class="size-4 animate-spin" />
    <slot v-else name="leading" />
    <slot />
  </NuxtLink>
  <a v-else-if="href" :href="href" :class="[classes, { 'pointer-events-none opacity-60': disabled || loading }]" :aria-disabled="disabled || loading || undefined" :tabindex="disabled || loading ? -1 : undefined" @click="handleClick">
    <SayaIcon v-if="loading" name="arrow-path" class="size-4 animate-spin" />
    <slot v-else name="leading" />
    <slot />
  </a>
  <button v-else :type="type" :disabled="disabled || loading" :class="classes" @click="handleClick">
    <SayaIcon v-if="loading" name="arrow-path" class="size-4 animate-spin" />
    <slot v-else name="leading" />
    <slot />
  </button>
</template>

<script setup lang="ts">
// Shared button look for Saya's public tenant pages — replaces the near-
// identical UButton markup that was hand-copied across contact.vue,
// reservations.vue, experiences/[slug].vue. Kept separate from
// PlatformButton.vue (different design tokens: brand-color vs. --ui-primary,
// pill vs. rounded-lg) to match the existing SayaHeader/PlatformHeader split
// rather than force one component to serve both surfaces.
const props = withDefaults(defineProps<{
  variant?: 'solid' | 'soft' | 'outline' | 'ghost'
  color?: 'primary' | 'error'
  size?: 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  block?: boolean
  type?: 'button' | 'submit'
  to?: string
  href?: string
}>(), {
  variant: 'solid',
  color: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  block: false,
  type: 'button',
})

const sizeClasses = {
  md: 'px-6 py-3 text-sm',
  lg: 'px-6 py-3.5 text-base',
}

// primary uses the tenant's --brand-color; error is a fixed red for
// destructive actions (e.g. cancelling a reservation) — brand color has no
// meaningful "destructive" variant of its own.
const variantClasses = {
  primary: {
    solid: 'bg-(--brand-color) text-(--brand-color-foreground) hover:opacity-90',
    soft: 'bg-(--brand-color)/10 text-(--brand-color) hover:bg-(--brand-color)/15',
    outline: 'border border-(--brand-color) bg-transparent text-(--brand-color) hover:bg-(--brand-color)/10',
    ghost: 'bg-transparent text-(--brand-color) hover:bg-(--brand-color)/10',
  },
  error: {
    solid: 'bg-red-600 text-white hover:opacity-90',
    soft: 'bg-red-600/10 text-red-600 hover:bg-red-600/15',
    outline: 'border border-red-600 bg-transparent text-red-600 hover:bg-red-600/10',
    ghost: 'bg-transparent text-red-600 hover:bg-red-600/10',
  },
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-full font-medium no-underline transition disabled:opacity-60 disabled:pointer-events-none',
  sizeClasses[props.size],
  variantClasses[props.color][props.variant],
  props.block && 'w-full',
])

const emit = defineEmits<{
  click: [event: Event]
}>()

const handleClick = (e: Event) => {
  if (props.disabled || props.loading) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  emit('click', e)
}
</script>
