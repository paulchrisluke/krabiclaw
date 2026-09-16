<template>
  <!--
    The homepage hero: two columns, the mascot card on the right, three ambient
    orbs behind. Markup as PlatformHomePage.vue rendered it.
  -->
  <section v-if="variant === 'home'" class="relative overflow-hidden" data-parity-section="hero">
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div class="absolute -top-40 -right-32 w-[700px] h-[700px] rounded-full opacity-25 blur-3xl" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%)"></div>
      <div class="absolute -bottom-20 -left-32 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%)"></div>
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full opacity-10 blur-3xl" style="background: radial-gradient(ellipse, var(--kc-navy-300) 0%, transparent 70%)"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
      <div class="flex flex-col gap-6">
        <span v-if="eyebrow" class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/20">
          <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-pulse" />
          {{ eyebrow }}
        </span>

        <h1 class="text-[clamp(40px,5vw,66px)] font-extrabold leading-[1.02] tracking-tight text-balance m-0">
          <template v-for="(line, index) in titleLines" :key="index">
            <br v-if="index > 0">
            <span
              v-if="line.highlighted"
              style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 40%, var(--kc-coral-400) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
            >{{ line.text }}</span>
            <span v-else class="text-default">{{ line.text }}</span>
          </template>
        </h1>

        <p v-if="subtitle" class="text-lg leading-relaxed text-muted m-0 max-w-lg">{{ subtitle }}</p>

        <div v-if="ctaLabel || secondaryLabel" class="flex flex-wrap gap-3">
          <PlatformAccountCta v-if="ctaLabel" :label="ctaLabel" :to="ctaUrl || '/signup'" variant="gradient" size="xl" />
          <PlatformButton v-if="secondaryLabel && secondaryUrl" :to="secondaryUrl" variant="outline" size="xl">
            <PlatformIcon name="puzzle" class="size-4" />
            {{ secondaryLabel }}
          </PlatformButton>
        </div>
      </div>

      <div class="hidden lg:flex justify-center">
        <div class="relative max-w-lg w-full">
          <div class="absolute inset-0 rounded-3xl blur-2xl opacity-30" style="background: linear-gradient(135deg, var(--kc-coral-200), var(--kc-teal-100));"></div>
          <div class="relative rounded-3xl p-7 shadow-2xl border border-default/50" style="background: linear-gradient(145deg, var(--kc-coral-50) 0%, #fff8f6 100%);">
            <picture>
              <source media="(min-width: 992px)" srcset="/krabiclaw-login-mascot.webp">
              <img
                src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
                alt="KrabiClaw mascot"
                width="1200"
                height="1200"
                loading="eager"
                fetchpriority="high"
                decoding="async"
                class="w-full block rounded-[20px] shadow-lg"
              >
            </picture>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- The About header: a pill, a headline, a lede. Nothing else. -->
  <div v-else-if="variant === 'about'" class="text-center space-y-4" data-parity-section="hero">
    <span v-if="eyebrow" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
      {{ eyebrow }}
    </span>
    <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">{{ title }}</h1>
    <p v-if="subtitle" class="text-lg sm:text-xl text-muted leading-relaxed max-w-2xl mx-auto m-0">{{ subtitle }}</p>
  </div>

  <!-- The Pricing header: the pinging pill and one gradient word. -->
  <div v-else-if="variant === 'pricing'" class="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center gap-4" data-parity-section="hero">
    <span v-if="eyebrow" class="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/25">
      <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-ping" />
      {{ eyebrow }}
    </span>
    <h1 class="text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.05] tracking-tight text-default text-balance m-0 mt-2">
      <template v-for="(part, index) in inlineParts" :key="index">
        <span v-if="part.highlighted" class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">{{ part.text }}</span>
        <template v-else>{{ part.text }}</template>
      </template>
    </h1>
    <p v-if="subtitle" class="text-lg leading-relaxed text-muted m-0 max-w-2xl mt-2">{{ subtitle }}</p>
  </div>

  <!-- The plugin header: the app icon beside the title, the account CTA at the end of the row. -->
  <div v-else-if="variant === 'plugin'" class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between" data-parity-section="hero">
    <div class="flex items-center gap-6">
      <img src="/platform/apple-touch-icon.png" alt="KrabiClaw app icon" class="size-24 rounded-[28px] border border-default shadow-lg">
      <div>
        <h1 class="m-0 text-3xl font-extrabold tracking-tight text-default md:text-4xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-2 text-lg text-muted">{{ subtitle }}</p>
      </div>
    </div>
    <PlatformAccountCta v-if="ctaLabel" :label="ctaLabel" :to="ctaUrl || '/signup'" size="xl" />
  </div>

  <!--
    The vertical pages and Features: centered, an icon pill, a two-line headline
    whose second line is the gradient, and two CTAs. The gradient's stops are the
    vertical's own accent.
  -->
  <div v-else class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-6" data-parity-section="hero">
    <span v-if="eyebrow" :class="pillClass">
      <PlatformIcon v-if="eyebrowIcon" :name="eyebrowIcon" :class="pillIconClass" />
      {{ eyebrow }}
    </span>
    <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">
      <template v-for="(line, index) in titleLines" :key="index">
        <br v-if="index > 0" class="hidden sm:inline">
        <span v-if="line.highlighted" :class="gradientClass">{{ line.text }}</span>
        <template v-else>{{ line.text }} </template>
      </template>
    </h1>
    <p v-if="subtitle" class="text-lg sm:text-xl text-muted leading-relaxed m-0 text-balance">{{ subtitle }}</p>
    <div v-if="ctaLabel || secondaryLabel" class="flex flex-wrap items-center justify-center gap-4 mt-2">
      <PlatformAccountCta v-if="ctaLabel" :label="ctaLabel" :to="ctaUrl || '/signup'" size="lg" class="shadow-sm transition-transform hover:-translate-y-0.5" />
      <PlatformButton v-if="secondaryLabel && secondaryUrl" :to="secondaryUrl" variant="outline" size="lg" class="transition-transform hover:-translate-y-0.5">
        {{ secondaryLabel }}
      </PlatformButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull } from '~/utils/tenant-page-block-data'

/**
 * The hero of one of KrabiClaw's own marketing pages.
 *
 * Six pages, five shapes: the homepage's two-column hero with the mascot, the
 * About header, the Pricing header with its pinging pill, the plugin header
 * with the app icon, and the centered hero the vertical pages and Features
 * share. Each shape is the markup the page rendered before it was a document,
 * chosen by `variant` the way BlawbyPageHero chooses its own.
 *
 * `title` may carry "\n" where the original forced a line break, and
 * `highlight` names the part of it rendered in the gradient. The vertical
 * accent decides which gradient that is.
 */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

/**
 * Which of KrabiClaw's marketing shapes this hero takes.
 *
 * The page decides, because the page is what differs — a vertical landing page
 * opens differently from Pricing. It was a prop a dispatcher computed from the
 * same path, one step further from the thing it describes.
 */
const VARIANTS = ['home', 'about', 'pricing', 'plugin', 'features', 'restaurants', 'experiences', 'legal'] as const
type Variant = typeof VARIANTS[number]
const variant = computed<Variant>(() => {
  const segment = props.page.path.replace(/^\//, '') || 'home'
  return (VARIANTS as readonly string[]).includes(segment) ? segment as Variant : 'home'
})

const eyebrow = computed(() => blockTextOrNull(props.block.data.eyebrow))
const eyebrowIcon = computed(() => blockTextOrNull(props.block.data.eyebrow_icon) as PlatformIconName | null)
const title = computed(() => blockText(props.block.data.title))
const highlight = computed(() => blockTextOrNull(props.block.data.highlight))
const subtitle = computed(() => blockTextOrNull(props.block.data.subtitle))
const ctaLabel = computed(() => blockTextOrNull(props.block.data.cta_label))
const ctaUrl = computed(() => blockTextOrNull(props.block.data.cta_url))
const secondaryLabel = computed(() => blockTextOrNull(props.block.data.secondary_label))
const secondaryUrl = computed(() => blockTextOrNull(props.block.data.secondary_url))

interface TitlePart { text: string; highlighted: boolean }

/** One entry per forced line; a line is highlighted when it is the highlight. */
const titleLines = computed<TitlePart[]>(() => title.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => ({
  text: line,
  highlighted: Boolean(highlight.value) && line === highlight.value!.trim(),
})))

/** The title as one line with the highlight cut out of it, for the Pricing shape. */
const inlineParts = computed<TitlePart[]>(() => {
  const marked = highlight.value?.trim()
  const oneLine = title.value.replace(/\n/g, ' ')
  if (!marked) return [{ text: oneLine, highlighted: false }]
  const index = oneLine.indexOf(marked)
  if (index < 0) return [{ text: oneLine, highlighted: false }]
  return [
    { text: oneLine.slice(0, index), highlighted: false },
    { text: marked, highlighted: true },
    { text: oneLine.slice(index + marked.length), highlighted: false },
  ].filter(part => part.text)
})

const PILL_CLASS: Record<string, string> = {
  features: 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20',
  restaurants: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20',
  experiences: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--kc-teal)/10 text-(--kc-teal-600) border border-(--kc-teal)/20',
  legal: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-(--kc-navy)/10 text-default border border-default/30',
}
const pillClass = computed(() => PILL_CLASS[variant.value] ?? PILL_CLASS.restaurants)
const pillIconClass = computed(() => (variant.value === 'legal' ? 'size-3.5 text-primary' : 'size-3.5'))

const GRADIENT_CLASS: Record<string, string> = {
  features: 'bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent',
  restaurants: 'bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent',
  experiences: 'bg-gradient-to-r from-(--kc-teal) via-(--kc-coral) to-primary bg-clip-text text-transparent',
  legal: 'bg-gradient-to-r from-primary via-(--kc-navy-700) to-(--kc-teal) bg-clip-text text-transparent',
}
const gradientClass = computed(() => GRADIENT_CLASS[variant.value] ?? GRADIENT_CLASS.restaurants)
</script>
