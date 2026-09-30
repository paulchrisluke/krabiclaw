<template>
  <!--
    The artwork is the visual hero; the same CMS hero block supplies the
    semantic intro immediately below it. Keeping the H1 and descriptive copy
    out of the illustration restores the original scene's visual hierarchy
    without giving up server-rendered homepage content.
  -->
  <template v-if="variant === 'home'">
    <section
      ref="homeHero"
      class="kc-parallax-hero"
      data-parity-section="hero"
      aria-label="Krabiclaw"
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

      <div class="kc-parallax-hero__mark" aria-hidden="true">
        <span class="kc-parallax-hero__mark-line">Ready when</span>
        <span class="kc-parallax-hero__mark-line kc-parallax-hero__mark-line--strong">You are.</span>
      </div>
    </section>

    <section class="kc-parallax-intro">
      <div class="kc-parallax-intro__inner">
        <span v-if="eyebrow" class="kc-parallax-intro__eyebrow">
          <span class="size-1.5 rounded-full bg-(--kc-teal) shrink-0" />
          {{ eyebrow }}
        </span>

        <h1 class="kc-parallax-intro__title">
          <template v-for="(line, index) in titleLines" :key="index">
            <br v-if="index > 0">
            <span v-if="line.highlighted" class="kc-parallax-intro__highlight">{{ line.text }}</span>
            <span v-else>{{ line.text }}</span>
          </template>
          <template v-if="rotatingAccents.length">
            <br>
            <!-- Read once, whole; the turning phrase is for the eye. -->
            <span class="sr-only">{{ rotatingAccents.join(', ') }}</span>
            <span class="kc-parallax-intro__rotator" aria-hidden="true">
              <Transition name="kc-rotate" mode="out-in">
                <span
                  :key="rotatingIndex"
                  class="kc-parallax-intro__rotating"
                  :class="'kc-parallax-intro__rotating--' + (rotatingIndex % 3)"
                >{{ rotatingAccents[rotatingIndex] }}</span>
              </Transition>
            </span>
          </template>
        </h1>

        <p v-if="subtitle" class="kc-parallax-intro__subtitle">{{ subtitle }}</p>

        <!-- One action: sign up when signed out, the dashboard when signed in. -->
        <div v-if="ctaLabel && ctaUrl" class="kc-parallax-intro__actions">
          <PlatformAccountCta :label="ctaLabel" :to="ctaUrl" variant="gradient" size="xl" />
        </div>
      </div>
    </section>
  </template>

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
import { blockStrings, blockText, blockTextOrNull } from '~/utils/tenant-page-block-data'

/**
 * The hero of one of Krabiclaw's own marketing pages.
 *
 * Six pages, five shapes: the homepage's parallax artwork and intro, the
 * About header, the Pricing header with its pinging pill, the plugin header
 * with the app icon, and the centered hero the vertical pages and Features
 * share. Each shape is the markup the page rendered before it was a document,
 * chosen by `variant` the way BlawbyPageHero chooses its own.
 *
 * `title` may carry "\n" where the original forced a line break, and
 * `accent` names the part of it rendered in the gradient. The vertical
 * accent decides which gradient that is. On the home shape,
 * `rotating_accents` closes the headline with one phrase at a time.
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

type ParallaxBreakpoint = 'xxs' | 'xs' | 'sm' | 'md' | 'lg'

type ParallaxImageSet = Record<ParallaxBreakpoint, string>

type ParallaxLayer = {
  name: string
  slot: string
  top: number
  compensation: number
  sources: ParallaxImageSet
}

/**
 * The six artwork planes are CMS media placements on the homepage hero block.
 *
 * Each plane requires its exact breakpoint slots (parallax_sky_xxs, _xs,
 * _sm, _md, _lg). These placements keep the
 * original art-directed mobile/tablet/desktop compositions editable through
 * Krabiclaw's normal media tools instead of baking image URLs into the frontend.
 */
const PARALLAX_BREAKPOINTS: ParallaxBreakpoint[] = ['xxs', 'xs', 'sm', 'md', 'lg']

function mediaUrl(slot: string): string | null {
  const media = props.block.media.find(item => item.slot === slot && item.public_url)
  return media?.public_url ?? null
}

function parallaxImageSet(slot: string): ParallaxImageSet {
  return Object.fromEntries(PARALLAX_BREAKPOINTS.map((breakpoint) => {
    const exactSlot = slot + '_' + breakpoint
    const url = mediaUrl(exactSlot)
    if (!url) throw new Error('Homepage hero is missing required media placement ' + exactSlot)
    return [breakpoint, url]
  })) as ParallaxImageSet
}

const parallaxLayers = computed<ParallaxLayer[]>(() => [
  {
    name: 'sky',
    slot: 'parallax_sky',
    top: 0,
    compensation: 1,
    sources: parallaxImageSet('parallax_sky'),
  },
  {
    name: 'clouds',
    slot: 'parallax_clouds',
    top: 0,
    compensation: 0.8,
    sources: parallaxImageSet('parallax_clouds'),
  },
  {
    name: 'mountains',
    slot: 'parallax_mountains',
    top: 120,
    compensation: 0.6,
    sources: parallaxImageSet('parallax_mountains'),
  },
  {
    name: 'far-trees',
    slot: 'parallax_far_trees',
    top: 440,
    compensation: 0.4,
    sources: parallaxImageSet('parallax_far_trees'),
  },
  {
    name: 'building-and-dark-trees',
    slot: 'parallax_building_trees',
    top: 580,
    compensation: 0.2,
    sources: parallaxImageSet('parallax_building_trees'),
  },
])

const parallaxForeground = computed<ParallaxImageSet>(() => parallaxImageSet('parallax_foreground'))

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

const ROTATION_INTERVAL_MS = 2600
const rotatingIndex = ref(0)
let rotationTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (rotatingAccents.value.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  rotationTimer = setInterval(() => {
    rotatingIndex.value = (rotatingIndex.value + 1) % rotatingAccents.value.length
  }, ROTATION_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (rotationTimer !== null) clearInterval(rotationTimer)
  if (homeHeroScrollListener) window.removeEventListener('scroll', homeHeroScrollListener)
  if (homeHeroFrame !== null) window.cancelAnimationFrame(homeHeroFrame)
})

const eyebrow = computed(() => blockTextOrNull(props.block.data.eyebrow))
const eyebrowIcon = computed(() => blockTextOrNull(props.block.data.eyebrow_icon) as PlatformIconName | null)
const title = computed(() => blockText(props.block.data.title))
const accent = computed(() => blockTextOrNull(props.block.data.accent))
const rotatingAccents = computed(() => blockStrings(props.block.data.rotating_accents))
const subtitle = computed(() => blockTextOrNull(props.block.data.subtitle))
const ctaLabel = computed(() => blockTextOrNull(props.block.data.cta_label))
const ctaUrl = computed(() => blockTextOrNull(props.block.data.cta_url))
const secondaryLabel = computed(() => blockTextOrNull(props.block.data.secondary_label))
const secondaryUrl = computed(() => blockTextOrNull(props.block.data.secondary_url))

interface TitlePart { text: string; highlighted: boolean }

/** One entry per forced line; a line is highlighted when it is the accent. */
const titleLines = computed<TitlePart[]>(() => title.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => ({
  text: line,
  highlighted: Boolean(accent.value) && line === accent.value!.trim(),
})))

/** The title as one line with the accent cut out of it, for the Pricing shape. */
const inlineParts = computed<TitlePart[]>(() => {
  const marked = accent.value?.trim()
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
  /* The artwork's own black, so no strip of another shade shows at its foot. */
  background: #010000;
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
.kc-parallax-hero__layer--2 { z-index: 3; }
.kc-parallax-hero__layer--3 { z-index: 4; }
.kc-parallax-hero__layer--4 { z-index: 5; }
.kc-parallax-hero__layer--5 { z-index: 6; }

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

.kc-parallax-hero__mark {
  position: absolute;
  z-index: 2;
  top: calc(120px / var(--kc-scene-ratio));
  left: 50%;
  display: flex;
  width: min(82vw, 34rem);
  flex-direction: column;
  align-items: center;
  color: white;
  font-family: var(--font-jost);
  font-size: clamp(2.6rem, 6.5vw, 5.25rem);
  letter-spacing: -0.02em;
  line-height: 0.92;
  text-align: center;
  text-shadow: 0 2px 18px rgb(0 0 0 / 32%);
  transform: translate3d(-50%, var(--kc-parallax-offset), 0);
  will-change: transform;
}

.kc-parallax-hero__mark-line {
  display: block;
  font-weight: 400;
}

.kc-parallax-hero__mark-line--strong {
  font-weight: 600;
}

.kc-parallax-intro {
  position: relative;
  z-index: 30;
  margin-top: -1px;
  overflow: hidden;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.kc-parallax-intro::before {
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  left: 0;
  height: clamp(9rem, 20vw, 16rem);
  /* Starts on the artwork's own black so the scene has no bottom edge, then
     spills down in soft, uneven lobes like the canopy above it. */
  background: linear-gradient(to bottom, #010000 0%, #010000 22%, rgb(1 0 0 / 70%) 48%, transparent 100%);
  /* The solid layer keeps the blur off the top edge, which meets the art. */
  mask-image: linear-gradient(#000, #000), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 240' preserveAspectRatio='none'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='10'/%3E%3C/filter%3E%3Cpath filter='url(%23b)' d='M0 0H1440V132C1392 168 1338 196 1276 178C1214 160 1180 118 1112 126C1044 134 1014 198 944 204C874 210 842 150 772 144C702 138 676 186 606 196C536 206 498 142 428 136C358 130 330 184 262 190C194 196 158 150 96 146C58 144 26 158 0 170Z'/%3E%3C/svg%3E");
  mask-size: 100% 40%, 100% 100%;
  mask-position: top;
  mask-repeat: no-repeat;
  content: "";
  pointer-events: none;
}

.kc-parallax-intro__inner {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(92vw, 860px);
  margin: 0 auto;
  padding: clamp(8rem, 15vw, 11rem) 0 clamp(5rem, 9vw, 7rem);
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  text-align: center;
}

.kc-parallax-intro__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ui-text-dimmed);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  line-height: 1.25rem;
  text-transform: uppercase;
}

.kc-parallax-intro__title {
  margin: 0;
  max-width: 30ch;
  color: var(--ui-text-highlighted);
  font-size: clamp(2.4rem, 6vw, 4.75rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1.02;
  text-wrap: balance;
}

.kc-parallax-intro__highlight {
  color: var(--kc-coral-400);
}

.kc-parallax-intro__rotator {
  display: inline-block;
}

.kc-parallax-intro__rotating {
  display: inline-block;
}

.kc-parallax-intro__rotating--0 { color: var(--kc-coral-400); }
.kc-parallax-intro__rotating--1 { color: var(--kc-teal-400); }
.kc-parallax-intro__rotating--2 { color: var(--kc-navy-300); }

.kc-rotate-enter-active,
.kc-rotate-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.kc-rotate-enter-from {
  opacity: 0;
  transform: translateY(0.35em);
}

.kc-rotate-leave-to {
  opacity: 0;
  transform: translateY(-0.35em);
}

.kc-parallax-intro__subtitle {
  margin: 0;
  max-width: 52rem;
  color: var(--ui-text-muted);
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  line-height: 1.75;
  text-wrap: pretty;
}

.kc-parallax-intro__actions {
  display: flex;
  justify-content: center;
  margin-top: 0.25rem;
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
  .kc-parallax-intro__inner {
    width: min(88vw, 34rem);
    padding-top: 8rem;
  }

  .kc-parallax-intro__title {
    max-width: 12ch;
    font-size: clamp(2.15rem, 10vw, 3.15rem);
  }

  .kc-parallax-intro__subtitle {
    font-size: 0.96rem;
    line-height: 1.65;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kc-parallax-hero__layer {
    transform: none;
    will-change: auto;
  }

  .kc-parallax-hero__mark {
    transform: translateX(-50%);
    will-change: auto;
  }
}
</style>

