<template>
  <section id="section-hero" class="relative min-h-160 overflow-hidden flex items-center bg-zinc-900">
    <!-- Background media layer — wrapper opacity-50 matches location page style -->
    <div class="absolute inset-0 opacity-50">
      <!-- Poster image: always in SSR HTML, fetchpriority high — this is the LCP element.
           Video fades in on top after window.load + idle; poster remains painted. -->
      <img
        v-if="hero.thumbnail_url && hero.video"
        :src="cfImageVariant(hero.thumbnail_url, { width: 1200 }) ?? undefined"
        :srcset="cfImageSrcset(hero.thumbnail_url) ?? undefined"
        sizes="100vw"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <!-- Image-only hero (no video) -->
      <img
        v-else-if="hero.image && hero.imageKind === 'image'"
        :src="cfImageVariant(hero.image, { width: 1200 }) ?? undefined"
        :srcset="cfImageSrcset(hero.image) ?? undefined"
        sizes="100vw"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <img
        v-else-if="businessPrimaryPhoto"
        :src="businessPrimaryPhoto.googleUrl"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <!-- No real photo yet: a brand-color + icon treatment, not a stock photo that
           isn't actually theirs and not a blank panel either. -->
      <div
        v-else
        aria-hidden="true"
        class="absolute inset-0 flex items-center justify-center"
        :style="{ background: `linear-gradient(135deg, ${brandColor} 0%, color-mix(in srgb, ${brandColor} 60%, black) 100%)` }"
      >
        <UIcon :name="verticalIcon" class="size-24 text-white/25" />
      </div>

      <!-- Deferred video: opacity-0 in DOM, fades to opacity-100 after canplay.
           Parent opacity-50 applies, so final rendered opacity is 0.5. -->
      <ClientOnly v-if="hero.video && hero.videoKind === 'video'">
        <video
          v-if="showVideo"
          ref="videoEl"
          :poster="cfImageVariant(hero.thumbnail_url, { width: 1200 }) ?? undefined"
          muted loop playsinline preload="none"
          aria-hidden="true" role="presentation"
          class="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700"
        />
      </ClientOnly>
    </div>
    <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.3) 100%)" />

    <!-- Content — plain transparent wrapper matching the proven inline hero
         (pages/index.vue, pre-consolidation): AppSection bg="black" rendered
         an opaque bg-inverted section here that painted over the hero image
         behind it. The dark look comes entirely from the image + gradient
         overlay above, not from a background on this wrapper. -->
    <div class="relative z-10 mx-auto w-full max-w-7xl px-4 py-36 sm:px-6 lg:px-8">
      <p v-if="eyebrow" data-field="hero.eyebrow" class="saya-eyebrow mb-8 text-white/70">
        {{ eyebrow }}
      </p>
      <h1 data-field="hero.title" class="saya-display-lg text-white max-w-4xl">
        {{ hero.title || businessTitle }}<br>
        <em v-if="hero.subtitle" data-field="hero.subtitle" class="saya-italic">{{ hero.subtitle }}</em>
        <em v-else-if="businessSubtitle" data-field="hero.subtitle" class="saya-italic">{{ businessSubtitle }}</em>
      </h1>

      <!-- Location pills -->
      <div v-if="hasLocations" class="mt-12 flex flex-wrap gap-3">
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="`/locations/${loc.slug}`"
          class="inline-flex items-center rounded-full border border-white/40 bg-white/5 px-5 py-2.5 text-sm text-white backdrop-blur-sm no-underline transition hover:bg-white/10"
        >
          {{ loc.title }}
        </NuxtLink>
      </div>
      <div v-else class="mt-12 flex flex-wrap gap-4">
        <UButton v-if="hasOrderLinks" to="/order" color="neutral" variant="solid" size="xl" class="rounded-full bg-white! text-black! hover:bg-zinc-100!">{{ orderNowCta }}</UButton>
        <UButton
          :to="ctaRoute"
          color="neutral"
          :variant="hasOrderLinks ? 'outline' : 'solid'"
          size="xl"
          class="rounded-full"
          :class="hasOrderLinks ? 'border-white/50 text-white hover:bg-white/10' : 'bg-white! text-black! hover:bg-zinc-100!'"
        >
          {{ reserveCta }}
        </UButton>
        <UButton
          v-if="!hasOrderLinks"
          :to="viewMenuRoute"
          color="neutral"
          variant="outline"
          size="xl"
          class="rounded-full border-white/50 text-white hover:bg-white/10"
        >
          {{ viewMenuCta }}
        </UButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { cfImageSrcset, cfImageVariant } from '~/utils/cf-image'

interface HeroData {
  title?: string
  subtitle?: string
  image?: string
  imageKind?: string
  video?: string
  videoKind?: string
  thumbnail_url?: string | null
}

interface Props {
  data?: {
    hero?: HeroData
    // Pre-resolved via useBootstrap().getField('hero.eyebrow', ...) by the
    // caller — not part of getHero()'s return shape, so it can't be read off
    // `hero` the way title/subtitle/image/video can.
    eyebrow?: string | null
    locations?: Array<{ id: string; slug: string; title: string }>
    businessTitle?: string
    businessSubtitle?: string
    businessCity?: string
    businessPrimaryPhoto?: { googleUrl?: string }
    hasOrderLinks?: boolean
    ctaRoute?: string
    reserveCta?: string
    // Vertical-aware CTA copy (e.g. "Book Now"/"View Experiences" for
    // experience-vertical tenants vs "Order Now"/"View Menu" for restaurants)
    // — must come from the caller's homeCopy, never hardcoded here. Getting
    // this wrong is the canonical Pottery House regression (restaurant copy
    // on an experience-vertical site).
    orderNowCta?: string
    viewMenuCta?: string
    viewMenuRoute?: string
    brandColor?: string
    vertical?: string
  }
}

const props = withDefaults(defineProps<Props>(), { data: () => ({}) })

const hero = computed(() => props.data?.hero || {})
const eyebrow = computed(() => props.data?.eyebrow || businessCity.value)
const locations = computed(() => props.data?.locations || [])
const hasLocations = computed(() => locations.value.length > 0)
const businessTitle = computed(() => props.data?.businessTitle || '')
const businessSubtitle = computed(() => props.data?.businessSubtitle || '')
const businessCity = computed(() => props.data?.businessCity || '')
const businessPrimaryPhoto = computed(() => props.data?.businessPrimaryPhoto)
const hasOrderLinks = computed(() => props.data?.hasOrderLinks || false)
const ctaRoute = computed(() => props.data?.ctaRoute || '')
const reserveCta = computed(() => props.data?.reserveCta || '')
const orderNowCta = computed(() => props.data?.orderNowCta || 'Action')
const viewMenuCta = computed(() => props.data?.viewMenuCta || 'Explore')
const viewMenuRoute = computed(() => props.data?.viewMenuRoute || '/')
// Neutral default until the owner picks a brand color in onboarding.
const brandColor = computed(() => props.data?.brandColor || '#3F3F46')
const verticalIcon = computed(() => props.data?.vertical === 'experience' ? 'i-heroicons-sparkles' : 'i-heroicons-building-storefront')

const { videoEl, showVideo } = useHeroVideo(() => hero.value?.video)
</script>
