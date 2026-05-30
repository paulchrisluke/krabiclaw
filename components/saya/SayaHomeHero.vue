<template>
  <section class="relative min-h-160 overflow-hidden flex items-center">
    <!-- Background media layer -->
    <div class="absolute inset-0">
      <!-- Poster image: always in SSR HTML, fetchpriority high — this is the LCP element.
           Video fades in on top after window.load + idle; poster remains painted. -->
      <img
        v-if="hero.videoThumbnail && hero.video"
        :src="hero.videoThumbnail"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <!-- Image-only hero (no video) -->
      <img
        v-else-if="hero.image && hero.imageKind === 'image'"
        :src="hero.image"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <img
        v-else-if="businessPrimaryPhoto"
        :src="businessPrimaryPhoto.googleUrl"
        alt="" aria-hidden="true" fetchpriority="high" decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      />

      <!-- Deferred video: opacity-0 in DOM, fades to opacity-100 after canplay.
           Never in SSR HTML (ClientOnly), never an LCP candidate until it's visible. -->
      <ClientOnly v-if="hero.video && hero.videoKind === 'video'">
        <video
          v-if="showVideo"
          ref="videoEl"
          muted loop playsinline preload="none"
          aria-hidden="true" role="presentation"
          class="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700"
        />
      </ClientOnly>
    </div>

    <!-- Content -->
    <div class="relative z-10 mx-auto w-full max-w-7xl px-4 py-36 sm:px-6 lg:px-8">
      <p v-if="hero.eyebrow || businessCity" class="saya-eyebrow mb-8 text-white/70">
        {{ hero.eyebrow || businessCity }}
      </p>
      <h1 class="saya-display-lg text-white max-w-4xl">
        {{ hero.title || businessTitle }}<br>
        <em v-if="hero.subtitle" class="saya-italic">{{ hero.subtitle }}</em>
        <em v-else-if="businessSubtitle" class="saya-italic">{{ businessSubtitle }}</em>
      </h1>

      <!-- Location pills -->
      <div v-if="hasLocations" class="mt-12 flex flex-wrap gap-3">
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="`/locations/${loc.slug}`"
          class="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/5 px-5 py-2.5 text-sm text-white backdrop-blur-sm no-underline transition hover:bg-white/10"
        >
          <UIcon name="i-heroicons-map-pin" class="size-3.5 opacity-70" />
          {{ loc.title }}
        </NuxtLink>
      </div>
      <div v-else class="mt-12 flex flex-wrap gap-4">
        <UButton v-if="hasOrderLinks" to="/order" color="neutral" variant="solid" size="xl" class="rounded-full bg-white! text-black! hover:bg-zinc-100!">Order Now</UButton>
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
          to="/menu"
          color="neutral"
          variant="outline"
          size="xl"
          class="rounded-full border-white/50 text-white hover:bg-white/10"
        >
          View Menu
        </UButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface HeroData {
  title?: string
  subtitle?: string
  eyebrow?: string
  image?: string
  imageKind?: string
  video?: string
  videoKind?: string
  videoThumbnail?: string | null
}

interface Props {
  data?: {
    hero?: HeroData
    locations?: Array<{ id: string; slug: string; title: string }>
    businessTitle?: string
    businessSubtitle?: string
    businessCity?: string
    businessPrimaryPhoto?: { googleUrl?: string }
    hasOrderLinks?: boolean
    ctaRoute?: string
    reserveCta?: string
  }
}

const props = withDefaults(defineProps<Props>(), { data: () => ({}) })

const hero = computed(() => props.data?.hero || {})
const locations = computed(() => props.data?.locations || [])
const hasLocations = computed(() => locations.value.length > 0)
const businessTitle = computed(() => props.data?.businessTitle || '')
const businessSubtitle = computed(() => props.data?.businessSubtitle || '')
const businessCity = computed(() => props.data?.businessCity || '')
const businessPrimaryPhoto = computed(() => props.data?.businessPrimaryPhoto)
const hasOrderLinks = computed(() => props.data?.hasOrderLinks || false)
const ctaRoute = computed(() => props.data?.ctaRoute || '')
const reserveCta = computed(() => props.data?.reserveCta || '')

const { videoEl, showVideo } = useHeroVideo(() => hero.value?.video)
</script>
