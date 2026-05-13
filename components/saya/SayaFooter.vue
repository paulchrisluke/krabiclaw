<template>
  <footer class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 pt-20 pb-8 sm:px-6 lg:px-8">

      <!-- Top section: brand + locations grid -->
      <div class="grid gap-16 border-b border-inverted/10 pb-14 lg:grid-cols-[1fr_1.4fr]">
        <!-- Brand column -->
        <div>
          <NuxtLink to="/" class="saya-display block text-5xl text-inverted no-underline leading-none">
            {{ restaurantName }}
          </NuxtLink>
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-inverted/60">
            {{ tagline }}
          </p>

          <!-- Social icons -->
          <div class="mt-6 flex gap-3">
            <a
              v-for="social in activeSocials"
              :key="social.name"
              :href="social.url"
              :aria-label="social.name"
              target="_blank"
              rel="noopener noreferrer"
              class="flex size-9 items-center justify-center rounded-full border border-inverted/15 text-inverted transition hover:border-inverted/50"
            >
              <UIcon :name="`i-simple-icons-${social.name.toLowerCase()}`" class="size-4" />
            </a>
            <span
              v-for="social in inactiveSocials"
              :key="social.name"
              aria-hidden="true"
              class="flex size-9 cursor-default items-center justify-center rounded-full border border-inverted/8 text-inverted/30"
            >
              <UIcon :name="`i-simple-icons-${social.name.toLowerCase()}`" class="size-4" />
            </span>
          </div>
        </div>

        <!-- Locations grid -->
        <div
          v-if="locationsError"
          class="rounded-xl border border-inverted/10 bg-inverted/5 p-6 text-sm text-inverted/60"
          role="status"
          aria-live="polite"
        >
          We could not load locations right now. Please try again in a moment.
        </div>
        <div
          v-else
          :class="[
            'grid gap-8',
            locations.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          ]"
        >
          <div v-for="loc in locations" :key="loc.id">
            <div class="saya-display text-xl text-inverted leading-none">{{ loc.title }}</div>
            <div class="mt-2 text-sm leading-relaxed text-inverted/60">{{ formatLocAddress(loc) }}</div>
            <div v-if="loc.phone" class="mt-1 text-sm text-inverted/60">{{ loc.phone }}</div>
            <div v-if="loc.hoursToday" class="mt-2 text-xs text-inverted/40">{{ loc.hoursToday }}</div>
            <NuxtLink
              :to="`/locations/${loc.slug}`"
              class="mt-3 inline-block border-b border-inverted pb-0.5 text-xs uppercase tracking-widest text-inverted transition hover:opacity-70"
            >
              Visit page →
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Navigation links -->
      <div class="grid gap-8 border-b border-inverted/10 py-12 sm:grid-cols-3">
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">Experience</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/menu" class="text-inverted/60 no-underline transition hover:text-inverted">Menu</NuxtLink></li>
            <li><NuxtLink to="/reservations" class="text-inverted/60 no-underline transition hover:text-inverted">Reservations</NuxtLink></li>
            <li><NuxtLink to="/photos" class="text-inverted/60 no-underline transition hover:text-inverted">Gallery</NuxtLink></li>
            <li><NuxtLink to="/about" class="text-inverted/60 no-underline transition hover:text-inverted">Our Story</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">Discover</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/reviews" class="text-inverted/60 no-underline transition hover:text-inverted">Reviews</NuxtLink></li>
            <li><NuxtLink to="/posts" class="text-inverted/60 no-underline transition hover:text-inverted">Latest Updates</NuxtLink></li>
            <li><NuxtLink to="/qa" class="text-inverted/60 no-underline transition hover:text-inverted">Q&amp;A</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">Connect</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/locations" class="text-inverted/60 no-underline transition hover:text-inverted">All Locations</NuxtLink></li>
            <li><NuxtLink to="/contact" class="text-inverted/60 no-underline transition hover:text-inverted">Contact Us</NuxtLink></li>
          </ul>
        </div>
      </div>

      <!-- Delivery partners row -->
      <div class="flex flex-wrap items-center gap-8 border-b border-inverted/10 py-10">
        <span class="saya-eyebrow text-inverted/50">Order online</span>
        <span
          v-for="partner in deliveryPartners"
          :key="partner"
          class="saya-display text-lg saya-italic text-inverted/40"
        >
          {{ partner }}
        </span>
      </div>

      <!-- Legal bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-6 text-xs text-inverted/40">
        <div>© {{ year }} {{ restaurantName }}</div>
        <div class="flex gap-6">
          <NuxtLink to="/privacy" class="transition hover:text-inverted/70">Privacy</NuxtLink>
          <NuxtLink to="/terms" class="transition hover:text-inverted/70">Terms</NuxtLink>
          <a href="https://krabiclaw.com" target="_blank" rel="noopener noreferrer" class="transition hover:text-inverted/70">
            Powered by krabiclaw.com
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { DEFAULT_RESTAURANT_NAME } from '~/config/constants'
import { getTodayGoogleHours } from '~/utils/formatters'

const { isPlatform, siteId, site } = useTenantSite()
const { getField } = usePageContent('contact')

const year = new Date().getFullYear()
const restaurantName = computed(() => {
  if (site && typeof site === 'object' && 'name' in site && typeof site.name === 'string' && site.name.trim()) {
    return site.name
  }
  return DEFAULT_RESTAURANT_NAME
})
const tagline = computed(() => getField('footer.tagline', 'Authentic dining, crafted with passion.'))

const deliveryPartners = ['Uber Eats', 'GrabFood', 'FoodPanda']

const facebookUrl = computed(() => getField('social.facebook', ''))
const instagramUrl = computed(() => getField('social.instagram', ''))
const tiktokUrl = computed(() => getField('social.tiktok', ''))

interface SocialLink {
  name: string
  url: string | null
}

interface PublicLocation {
  id: string
  slug: string
  title: string
  address?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
  } | string | null
  city?: string | null
  phone?: string | null
  googleBusinessHours?: unknown
}

interface PublicLocationsResponse {
  locations: PublicLocation[]
}

const allSocials = computed<SocialLink[]>(() => [
  { name: 'Facebook', url: facebookUrl.value },
  { name: 'Instagram', url: instagramUrl.value },
  { name: 'Tiktok', url: tiktokUrl.value }
])
const activeSocials = computed(() =>
  allSocials.value.filter((s: SocialLink): s is { name: string; url: string } => typeof s.url === 'string' && s.url.length > 0)
)
const inactiveSocials = computed(() => allSocials.value.filter((s: SocialLink) => !s.url))

const { data: locationsData, error: locationsError } = useFetch<PublicLocationsResponse>(
  () => `/api/public/sites/${siteId}/locations`,
  {
    key: () => `footer-locs-${siteId}`,
    default: () => ({ locations: [] }),
    immediate: !isPlatform && !!siteId
  }
)

const rawLocations = computed(() => locationsData.value?.locations ?? [])
const locations = computed(() =>
  rawLocations.value.map((loc: PublicLocation) => ({
    ...loc,
    hoursToday: loc.googleBusinessHours ? getTodayGoogleHours(loc.googleBusinessHours) : null
  }))
)

function formatLocAddress(loc: PublicLocation) {
  if (!loc.address) return ''
  if (typeof loc.address === 'string') return loc.address
  const addr = typeof loc.address === 'object' && loc.address !== null ? loc.address : null
  const line1 = Array.isArray(addr?.addressLines) ? addr?.addressLines?.[0] : ''
  return [line1, addr?.locality, addr?.administrativeArea].filter(Boolean).join(', ')
}
</script>
