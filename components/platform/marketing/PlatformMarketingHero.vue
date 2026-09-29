<template>
  <!--
    The platform homepage keeps the original vKirirom hero's authored scene:
    five independently moving artwork planes, one static foreground plane, the
    same breakpoint-specific crops, and the same 1600px composition ratios.
    KrabiClaw's page-document copy remains live CMS content over that artwork.
  -->
  <section
    v-if="variant === 'home'"
    ref="homeHero"
    class="kc-parallax-hero"
    data-parity-section="hero"
  >
    <div class="kc-parallax-hero__art" aria-hidden="true">
      <picture
        v-for="(layer, index) in parallaxLayers"
        :key="layer.name"
        class="kc-parallax-hero__layer"
        :class="'kc-parallax-hero__layer--' + (index + 1)"
        :style="{
          '--kc-layer-compensation': String(layer.compensation),
          '--kc-layer-top': layer.top + 'px',
        }"
      >
        <source media="(min-width: 1264px)" :srcset="layer.sources.lg">
        <source media="(min-width: 960px)" :srcset="layer.sources.md">
        <source media="(min-width: 600px)" :srcset="layer.sources.sm">
        <source media="(min-width: 376px)" :srcset="layer.sources.xs">
        <img
          :src="layer.sources.xxs"
          alt=""
          loading="eager"
          :fetchpriority="index === 0 ? 'high' : 'auto'"
          decoding="async"
        >
      </picture>

      <picture class="kc-parallax-hero__foreground">
        <source media="(min-width: 1264px)" :srcset="parallaxForeground.lg">
        <source media="(min-width: 960px)" :srcset="parallaxForeground.md">
        <source media="(min-width: 600px)" :srcset="parallaxForeground.sm">
        <source media="(min-width: 376px)" :srcset="parallaxForeground.xs">
        <img :src="parallaxForeground.xxs" alt="" loading="eager" decoding="async">
      </picture>
    </div>

    <div class="kc-parallax-hero__copy">
      <span v-if="eyebrow" class="kc-parallax-hero__eyebrow">
        <span class="size-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-pulse" />
        {{ eyebrow }}
      </span>

      <h1 class="kc-parallax-hero__title">
        <template v-for="(line, index) in titleLines" :key="index">
          <br v-if="index > 0">
          <span v-if="line.highlighted" class="kc-parallax-hero__highlight">{{ line.text }}</span>
          <span v-else>{{ line.text }}</span>
        </template>
      </h1>

      <p v-if="subtitle" class="kc-parallax-hero__subtitle">{{ subtitle }}</p>

      <div v-if="ctaLabel || secondaryLabel" class="kc-parallax-hero__actions">
        <PlatformAccountCta v-if="ctaLabel" :label="ctaLabel" :to="ctaUrl || '/signup'" variant="gradient" size="xl" />
        <PlatformButton
          v-if="secondaryLabel && secondaryUrl"
          :to="secondaryUrl"
          variant="outline"
          size="xl"
          class="kc-parallax-hero__secondary"
        >
          <PlatformIcon name="puzzle" class="size-4" />
          {{ secondaryLabel }}
        </PlatformButton>
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
      <img src="/platform/apple-touch-icon.png" alt="Krabiclaw app icon" class="size-24 rounded-[28px] border border-default shadow-lg">
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
 * The hero of one of Krabiclaw's own marketing pages.
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
 * Which of Krabiclaw's marketing shapes this hero takes.
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

type ParallaxImageSet = {
  xxs: string
  xs: string
  sm: string
  md: string
  lg: string
}

type ParallaxLayer = {
  name: string
  top: number
  compensation: number
  sources: ParallaxImageSet
}

/**
 * These are the original authored vKirirom layer crops. The legacy component
 * inserted Cloudinary's f_auto transform at runtime; the URLs below encode the
 * same transform directly so the browser still receives an appropriate format.
 *
 * Compensation is the inverse of the legacy fixed-layer movement. Because the
 * layers now live inside the normal-flow hero, compensating 1, .8, .6, .4 and
 * .2 reproduces screen-space movement of 0, .2, .4, .6 and .8 times scroll.
 */
const parallaxLayers: ParallaxLayer[] = [
  {
    name: 'sky',
    top: 0,
    compensation: 1,
    sources: {
      xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578537679/Home%20Page/1_-_376_Crop_f3kohe.png',
      xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578453084/Home%20Page/1_-_600_Crop_exoo15.png',
      sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452929/Home%20Page/1_-_960_Crop_oa7sit.png',
      md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452735/Home%20Page/1_-_1264_Crop_etah3p.png',
      lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578391761/Home%20Page/1_xblbcz.png',
    },
  },
  {
    name: 'clouds',
    top: 0,
    compensation: 0.8,
    sources: {
      xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_376,c_scale,q_auto:low/v1578537679/Home%20Page/2_-_376_Crop_jurubz.png',
      xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_600,c_scale,q_auto:low/v1578453086/Home%20Page/2_-_600_Crop_ljuk1q.png',
      sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_960,c_scale,q_auto:low/v1578452931/Home%20Page/2_-_960_Crop_nmuzwk.png',
      md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_1264,c_scale,q_auto:low/v1578452735/Home%20Page/2_-_1264_Crop_oemckj.png',
      lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_1264,c_scale,q_auto:low/v1578304830/Home%20Page/2_sswfon.png',
    },
  },
  {
    name: 'mountains',
    top: 120,
    compensation: 0.6,
    sources: {
      xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578537679/Home%20Page/3_-_376_Crop_hzx8pn.png',
      xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578453084/Home%20Page/3_-_600_Crop_oi117l.png',
      sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452928/Home%20Page/3_-_960_Crop_u8unwb.png',
      md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452735/Home%20Page/3_-_1264_Crop_rzmbf7.png',
      lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578391697/Home%20Page/3_s78ihj.png',
    },
  },
  {
    name: 'far-trees',
    top: 440,
    compensation: 0.4,
    sources: {
      xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578537679/Home%20Page/4_-_376_Crop_ojxrls.png',
      xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578453084/Home%20Page/4_-_600_Crop_lzo0qm.png',
      sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452928/Home%20Page/4_-_960_Crop_yjllbe.png',
      md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452734/Home%20Page/4_-_1264_Crop_b2si7p.png',
      lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578304829/Home%20Page/4_y2kccp.png',
    },
  },
  {
    name: 'building-and-dark-trees',
    top: 580,
    compensation: 0.2,
    sources: {
      xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_376/v1578537679/Home%20Page/5_-_376_Crop_kwd38n.png',
      xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_600/v1578453084/Home%20Page/5_-_600_Crop_hv4pgh.png',
      sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_960/v1578452928/Home%20Page/5_-_960_Crop_kxqi9o.png',
      md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_1264/v1578452735/Home%20Page/5_-_1264_Crop_j243x6.png',
      lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/w_1920/v1578304830/Home%20Page/5_hqueja.png',
    },
  },
]

const parallaxForeground: ParallaxImageSet = {
  xxs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578537678/Home%20Page/6_-_376_Crop_idycl2.png',
  xs: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578453084/Home%20Page/6_-_600_Crop_dld0qh.png',
  sm: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452928/Home%20Page/6_-_960_Crop_yweblf.png',
  md: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578452734/Home%20Page/6_-_1264_Crop_axf4bc.png',
  lg: 'https://res.cloudinary.com/die9ji2vn/image/upload/f_auto/v1578304829/Home%20Page/6-_Black_nt3cjt.png',
}

const homeHero = ref<HTMLElement | null>(null)
let homeHeroFrame: number | null = null
let homeHeroScrollListener: (() => void) | null = null

function renderHomeParallax() {
  if (!homeHero.value) return
  homeHero.value.style.setProperty('--kc-parallax-offset', String(Math.max(0, window.scrollY)) + 'px')
}

function scheduleHomeParallax() {
  if (homeHeroFrame !== null) return
  homeHeroFrame = window.requestAnimationFrame(() => {
    homeHeroFrame = null
    renderHomeParallax()
  })
}

onMounted(() => {
  if (variant.value !== 'home' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  renderHomeParallax()
  homeHeroScrollListener = scheduleHomeParallax
  window.addEventListener('scroll', homeHeroScrollListener, { passive: true })
})

onBeforeUnmount(() => {
  if (homeHeroScrollListener) window.removeEventListener('scroll', homeHeroScrollListener)
  if (homeHeroFrame !== null) window.cancelAnimationFrame(homeHeroFrame)
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

<style scoped>
.kc-parallax-hero {
  --kc-scene-ratio: 1.8;
  --kc-parallax-offset: 0px;
  position: relative;
  isolation: isolate;
  height: calc(1600px / var(--kc-scene-ratio));
  overflow: hidden;
  overflow: clip;
  background: #070b13;
}

.kc-parallax-hero__art {
  position: absolute;
  inset: 0;
}

.kc-parallax-hero__layer {
  position: absolute;
  top: calc(var(--kc-layer-top) / var(--kc-scene-ratio));
  right: 0;
  left: 0;
  height: 100%;
  pointer-events: none;
  transform: translate3d(0, calc(var(--kc-parallax-offset) * var(--kc-layer-compensation)), 0);
  will-change: transform;
}

.kc-parallax-hero__layer--1 { z-index: 1; }
.kc-parallax-hero__layer--2 { z-index: 2; }
.kc-parallax-hero__layer--3 { z-index: 3; }
.kc-parallax-hero__layer--4 { z-index: 4; }
.kc-parallax-hero__layer--5 { z-index: 5; }

.kc-parallax-hero__layer img,
.kc-parallax-hero__foreground img {
  display: block;
  width: 100%;
  height: 100%;
}

.kc-parallax-hero__layer img {
  object-fit: contain;
  object-position: top center;
}

.kc-parallax-hero__foreground {
  position: absolute;
  z-index: 20;
  right: 0;
  bottom: -1px;
  left: 0;
  height: calc(582px / var(--kc-scene-ratio));
  pointer-events: none;
}

.kc-parallax-hero__foreground img {
  object-fit: cover;
  object-position: top center;
}

.kc-parallax-hero__copy {
  position: absolute;
  z-index: 15;
  top: calc(120px / var(--kc-scene-ratio));
  left: 50%;
  display: flex;
  width: min(92vw, 760px);
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  color: white;
  text-align: center;
  text-shadow: 0 2px 18px rgb(0 0 0 / 45%);
  transform: translate3d(-50%, var(--kc-parallax-offset), 0);
  will-change: transform;
}

.kc-parallax-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid rgb(255 255 255 / 32%);
  border-radius: 999px;
  padding: 0.375rem 0.875rem;
  background: rgb(7 11 19 / 38%);
  box-shadow: 0 10px 36px rgb(0 0 0 / 18%);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  line-height: 1.25rem;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
}

.kc-parallax-hero__title {
  margin: 0;
  max-width: 13ch;
  font-size: clamp(2.25rem, 6vw, 4.25rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 0.98;
  text-wrap: balance;
}

.kc-parallax-hero__highlight {
  background: linear-gradient(135deg, #ff8d80 0%, #ffd0c7 52%, #ffffff 100%);
  background-clip: text;
  color: transparent;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.kc-parallax-hero__subtitle {
  margin: 0;
  max-width: 36rem;
  color: rgb(255 255 255 / 92%);
  font-size: clamp(1rem, 2vw, 1.2rem);
  line-height: 1.65;
  text-wrap: balance;
}

.kc-parallax-hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.kc-parallax-hero__secondary {
  border-color: rgb(255 255 255 / 55%);
  background: rgb(7 11 19 / 28%);
  color: white;
  backdrop-filter: blur(8px);
}

.kc-parallax-hero__secondary:hover {
  background: rgb(7 11 19 / 48%);
}

@media (min-width: 376px) {
  .kc-parallax-hero { --kc-scene-ratio: 2.3; }
}

@media (min-width: 600px) {
  .kc-parallax-hero { --kc-scene-ratio: 2.1; }
}

@media (min-width: 960px) {
  .kc-parallax-hero { --kc-scene-ratio: 1.5; }
}

@media (min-width: 1264px) {
  .kc-parallax-hero { --kc-scene-ratio: 1.5; }
}

@media (min-width: 1904px) {
  .kc-parallax-hero { --kc-scene-ratio: 1; }
}

@media (min-width: 2544px) {
  .kc-parallax-hero { --kc-scene-ratio: 0.7; }
}

@media (max-width: 599px) {
  .kc-parallax-hero__copy {
    width: min(90vw, 34rem);
    gap: 0.875rem;
  }

  .kc-parallax-hero__title {
    max-width: 12ch;
    font-size: clamp(2rem, 10vw, 3.25rem);
  }

  .kc-parallax-hero__subtitle {
    max-width: 29rem;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .kc-parallax-hero__actions {
    gap: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kc-parallax-hero__layer,
  .kc-parallax-hero__copy {
    transform: none;
    will-change: auto;
  }

  .kc-parallax-hero__copy {
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>

