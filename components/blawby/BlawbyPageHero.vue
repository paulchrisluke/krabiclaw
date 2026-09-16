<template>
  <section :class="backgroundClass" class="relative overflow-hidden" data-parity-section="page-hero">
    <div class="blawby-container relative">
      <div class="px-6 pb-4 pt-16 lg:px-8">
        <div class="mx-auto max-w-4xl text-center">
          <p v-if="eyebrow" class="mb-4 text-sm font-semibold uppercase text-[var(--blawby-accent-strong)]">
            {{ eyebrow }}
          </p>
          <h1 v-if="titleWords.length" :aria-label="title" class="blawby-display text-3xl font-bold sm:text-4xl">
            <template v-for="(word, index) in titleWords" :key="`${word}-${index}`">
              <span :class="index === 1 || index === 2 ? 'text-[var(--blawby-accent)]' : 'text-[var(--blawby-primary)]'">{{ word + (index < titleWords.length - 1 ? ' ' : '') }}</span>
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
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull } from '~/utils/tenant-page-block-data'
import type { BlawbyShieldVariant } from '~/types/blawby'

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const title = computed(() => blockText(props.block.data.title))
const description = computed(() => blockTextOrNull(props.block.data.subtitle))
const eyebrow = computed(() => blockTextOrNull(props.block.data.eyebrow))

/**
 * Which shield this page opens under. The page says, because the page is what
 * differs; it was a prop a dispatcher derived from the same path.
 */
const SHIELDS: Record<string, BlawbyShieldVariant> = {
  '/about': 'about', '/contact': 'contact', '/schedule': 'schedule', '/donate': 'donate', '/pricing': 'pricing',
  '/blog': 'blog', '/policies/privacy': 'privacy', '/policies/terms': 'terms',
  '/third-party-notices': 'third-party-notices',
}
const variant = computed<BlawbyShieldVariant>(() => SHIELDS[props.page.path] ?? 'about')

const backgroundClass = computed(() => {
  if (variant.value === 'schedule') return 'bg-[var(--blawby-primary-800)] [&_h1]:text-white [&_p]:text-gray-200'
  if (variant.value === 'about' || variant.value === 'contact') return 'bg-[var(--blawby-accent-200)]'
  return 'bg-[var(--blawby-primary-100)]'
})
const titleWords = computed(() => title.value.trim().split(/\s+/).filter(Boolean))
const descriptionParts = computed(() => Array.isArray(description.value)
  ? description.value.filter(Boolean)
  : String(description.value || '').split(/\n\s*\n/).map(part => part.trim()).filter(Boolean))
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
