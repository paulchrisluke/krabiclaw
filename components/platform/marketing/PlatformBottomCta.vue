<template>
  <div
    class="rounded-3xl border border-default bg-elevated text-center shadow-sm"
    :class="size === 'lg' ? 'p-10 sm:p-16 max-w-4xl mx-auto flex flex-col items-center gap-6' : 'p-8 sm:p-12 space-y-6'"
    data-parity-section="cta"
  >
    <h2 class="font-extrabold text-default m-0" :class="size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-3xl'">{{ title }}</h2>
    <p v-if="description" class="text-muted m-0" :class="size === 'lg' ? 'text-base sm:text-lg max-w-xl leading-relaxed' : 'text-base max-w-lg mx-auto'">{{ description }}</p>
    <div class="flex gap-4" :class="size === 'lg' ? 'flex-wrap' : 'justify-center'">
      <PlatformAccountCta v-if="label" :label="label" :to="url || '/signup'" size="lg" :class="size === 'lg' ? 'shadow-sm' : ''" />
      <PlatformButton v-if="secondaryLabel && secondaryUrl" :to="secondaryUrl" variant="outline" size="lg">{{ secondaryLabel }}</PlatformButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The closing call to action: a title, a line, the account button and an
 * outline button. The vertical pages draw it large; About draws it at the
 * size of its other cards.
 */
withDefaults(defineProps<{
  size?: 'md' | 'lg'
  title: string
  description?: string | null
  label?: string | null
  url?: string | null
  secondaryLabel?: string | null
  secondaryUrl?: string | null
}>(), {
  size: 'lg',
  description: null,
  label: null,
  url: null,
  secondaryLabel: null,
  secondaryUrl: null,
})
</script>
