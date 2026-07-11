<template>
  <section :class="backgroundClass" class="relative overflow-hidden" data-parity-section="page-hero">
    <div class="blawby-container relative">
      <div class="px-6 pb-4 pt-16 lg:px-8">
        <div class="mx-auto max-w-4xl text-center">
          <p v-if="eyebrow" class="mb-4 text-sm font-semibold uppercase text-[var(--blawby-accent-strong)]">
            {{ eyebrow }}
          </p>
          <h1 class="blawby-display text-3xl font-bold sm:text-4xl">
            <template v-for="(word, index) in titleWords" :key="`${word}-${index}`">
              <span :class="index === 1 || index === 2 ? 'text-[var(--blawby-accent)]' : 'text-[var(--blawby-primary)]'">{{ word }}</span><span v-if="index < titleWords.length - 1"> </span>
            </template>
          </h1>
          <div v-if="descriptionParts.length" class="mt-6 text-left text-lg leading-8 text-[var(--blawby-primary)]">
            <div v-for="(part, index) in descriptionParts" :key="index" class="flex items-start gap-3">
              <BlawbyRichText :content="part" unstyled class="blawby-page-hero-copy contents prose prose-lg max-w-none" />
            </div>
          </div>
          <div v-if="$slots.default" class="mt-12">
            <slot />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BlawbyShieldVariant } from '~/types/blawby'

const props = withDefaults(defineProps<{
  title: string
  description?: string | string[] | null
  eyebrow?: string | null
  variant: BlawbyShieldVariant
}>(), {
  description: null,
  eyebrow: null,
})

const backgroundClass = computed(() => {
  if (props.variant === 'schedule') return 'bg-[var(--blawby-primary-800)] [&_h1]:text-white [&_p]:text-gray-200'
  if (props.variant === 'about' || props.variant === 'contact') return 'bg-[var(--blawby-accent-200)]'
  return 'bg-[var(--blawby-primary-100)]'
})
const titleWords = computed(() => props.title.trim().split(/\s+/).filter(Boolean))
const descriptionParts = computed(() => Array.isArray(props.description)
  ? props.description.filter(Boolean)
  : String(props.description || '').split(/\n\s*\n/).map(part => part.trim()).filter(Boolean))
</script>

<style>
.blawby-page-hero-copy p {
  color: rgb(82 82 91) !important;
  font-size: 1.125rem !important;
  line-height: 2rem !important;
  margin: 0 0 1rem !important;
}

.blawby-page-hero-copy strong {
  color: var(--blawby-primary);
  font-weight: 700;
}

.blawby-page-hero-copy a {
  color: var(--blawby-accent);
}
</style>
