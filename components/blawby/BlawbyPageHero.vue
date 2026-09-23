<template>
  <!--
    The homepage opens full-bleed, its own picture behind, the heading split so
    an accent phrase can carry colour. It comes first because the home is the
    home whatever media its document also carries.
  -->
  <section
    v-if="isHome"
    data-blawby-critical-hero
    :data-has-background="backgroundSrc ? 'true' : undefined"
    class="relative overflow-hidden"
    data-parity-section="hero"
  >
    <!-- A hero declares that it takes an image or a video, so it draws both. -->
    <video
      v-if="background?.kind === 'video'"
      :src="background.public_url!"
      :poster="background.thumbnail_url ?? undefined"
      autoplay muted loop playsinline
      aria-hidden="true"
      class="absolute inset-0 size-full object-cover object-center"
    />
    <img
      v-else-if="backgroundSrc"
      :src="backgroundSrc"
      alt=""
      width="1920"
      height="1080"
      fetchpriority="high"
      loading="eager"
      decoding="async"
      class="absolute inset-0 size-full object-cover object-center"
    >
    <div data-blawby-critical-hero-content class="blawby-container relative pb-36 pt-16 text-left min-[1920px]:pb-48 min-[1920px]:pt-24 min-[2560px]:pb-64 min-[2560px]:pt-32">
      <div data-blawby-critical-hero-columns class="flex flex-wrap gap-x-6 min-[1920px]:gap-x-12 min-[2560px]:gap-x-16">
        <div data-blawby-critical-hero-copy class="w-full lg:w-3/5">
          <h1 v-if="splitTitle.before || splitTitle.accent" class="max-w-4xl whitespace-pre-line blawby-display text-5xl font-medium text-white sm:text-7xl min-[1920px]:max-w-6xl min-[1920px]:text-8xl min-[2560px]:max-w-7xl min-[2560px]:text-9xl">
            {{ splitTitle.before }}<span v-if="splitTitle.accent" class="relative whitespace-nowrap text-[var(--blawby-accent)]">{{ splitTitle.accent }}</span>{{ splitTitle.after }}
          </h1>
          <p v-if="description" class="mt-6 max-w-2xl text-lg text-white min-[1920px]:max-w-3xl min-[1920px]:text-xl min-[2560px]:max-w-4xl min-[2560px]:text-2xl">{{ description }}</p>
        </div>
        <div data-blawby-critical-hero-actions class="w-full lg:w-2/5">
          <div class="mt-10 flex justify-start gap-x-6 min-[1920px]:mt-16 min-[2560px]:mt-20">
            <BlawbyButton v-if="ctaUrl && ctaLabel" :to="ctaUrl" class="gap-2">
              <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
              {{ ctaLabel }}
            </BlawbyButton>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!--
    Any other page that carries its own picture opens with it, beside the title.
    `cover` and `gallery` are the document's own media slots — the same ones the
    social card is drawn from — so the picture is a property of the page, like
    its title, and the template renders it rather than the document holding a
    block that repeats it.
  -->
  <section
    v-else-if="gallery.length"
    class="mx-auto mb-8 max-w-7xl border-b border-slate-200 pt-8 sm:px-6 md:flex lg:px-8"
    data-parity-section="service-overview"
  >
    <BlawbyMediaGallery v-model="activeMedia" :media="gallery" :fallback-alt="page.title" />
    <div class="flex-1">
      <div class="blawby-container pb-8 pt-8">
        <h1 v-if="title" class="mx-auto max-w-4xl blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl md:mt-2">{{ title }}</h1>
        <p v-if="description" class="mx-auto mt-6 max-w-2xl text-left text-lg text-[var(--blawby-primary)]">{{ description }}</p>
      </div>
    </div>
  </section>

  <section v-else :class="backgroundClass" class="relative overflow-hidden" data-parity-section="page-hero">
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
import { blockText, blockTextOrNull, blockMedia } from '~/utils/tenant-page-block-data'
import { blawbyShieldVariant, blawbySplitAccent, type BlawbyShieldVariant } from '~/types/blawby'

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()

const title = computed(() => blockText(props.block.data.title))
const description = computed(() => blockTextOrNull(props.block.data.subtitle))
const eyebrow = computed(() => blockTextOrNull(props.block.data.eyebrow))

const variant = computed<BlawbyShieldVariant>(() => blawbyShieldVariant(props.page.path))

/** The page's own pictures, in the order the page carries them. */
const gallery = computed(() => props.page.media
  .filter(item => item.kind === 'image' && (item.slot === 'cover' || item.slot === 'gallery'))
  .map(item => ({
    asset_id: item.asset_id,
    public_url: item.public_url,
    alt_text: item.alt_text,
    width: item.width,
    height: item.height,
  })))
const activeMedia = ref(0)

const isHome = computed(() => props.page.path === '/')
const background = computed(() => blockMedia(props.block, 'media')[0] ?? null)
const backgroundSrc = computed(() => background.value?.public_url ?? null)
const ctaLabel = computed(() => blockTextOrNull(props.block.data.cta_label) ?? blockTextOrNull(props.block.data.label))
// An internal route is localized, so a Thai page's button stays on the Thai
// site; an absolute URL belongs to someone else and is left exactly as written.
const ctaUrl = computed(() => {
  const url = blockTextOrNull(props.block.data.cta_url) ?? blockTextOrNull(props.block.data.url)
  return url && url.startsWith('/') ? localePath(url) : url
})

/** The heading with the phrase the firm chose to emphasise cut out of it. */
const splitTitle = computed(() => blawbySplitAccent(title.value, blockText(props.block.data.accent)))

const backgroundClass = computed(() => {
  if (variant.value === 'schedule') return 'bg-[var(--blawby-primary-800)] [&_h1]:text-white [&_p]:text-gray-200'
  if (variant.value === 'about' || variant.value === 'contact') return 'bg-[var(--blawby-accent-200)]'
  return 'bg-[var(--blawby-primary-100)]'
})
const titleWords = computed(() => title.value.trim().split(/\s+/).filter(Boolean))
const descriptionParts = computed(() => (description.value ?? '')
  .split(/\n\s*\n/)
  .map(part => part.trim())
  .filter(Boolean))
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
