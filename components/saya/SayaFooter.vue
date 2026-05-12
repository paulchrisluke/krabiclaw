<template>
  <footer class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 pt-20 pb-8 sm:px-6 lg:px-8">

      <!-- Top section: brand + locations grid -->
      <div class="grid gap-16 border-b border-white/8 pb-14 lg:grid-cols-[1fr_1.4fr]">
        <!-- Brand column -->
        <div>
          <NuxtLink to="/" class="saya-display block text-5xl text-white no-underline leading-none">
            {{ restaurantName }}
          </NuxtLink>
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
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
              class="flex size-9 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-white/50"
            >
              <UIcon :name="`i-simple-icons-${social.name.toLowerCase()}`" class="size-4" />
            </a>
            <a
              v-for="social in inactiveSocials"
              :key="social.name"
              aria-hidden="true"
              class="flex size-9 cursor-default items-center justify-center rounded-full border border-white/8 text-white/30"
            >
              <UIcon :name="`i-simple-icons-${social.name.toLowerCase()}`" class="size-4" />
            </a>
          </div>
        </div>

        <!-- Locations grid -->
        <div
          :class="[
            'grid gap-8',
            locations.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          ]"
        >
          <div v-for="loc in locations" :key="loc.id">
            <div class="saya-display text-xl text-white leading-none">{{ loc.title }}</div>
            <div class="mt-2 text-sm leading-relaxed text-zinc-400">{{ formatLocAddress(loc) }}</div>
            <div v-if="loc.phone" class="mt-1 text-sm text-zinc-400">{{ loc.phone }}</div>
            <div v-if="loc.hoursToday" class="mt-2 text-xs text-zinc-500">{{ loc.hoursToday }}</div>
            <NuxtLink
              :to="`/locations/${loc.slug}`"
              class="mt-3 inline-block border-b border-white pb-0.5 text-xs uppercase tracking-widest text-white transition hover:opacity-70"
            >
              Visit page →
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Navigation links -->
      <div class="grid gap-8 border-b border-white/8 py-12 sm:grid-cols-3">
        <div>
          <h4 class="saya-eyebrow mb-5 text-zinc-500">Experience</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/menu" class="text-zinc-400 no-underline transition hover:text-white">Menu</NuxtLink></li>
            <li><NuxtLink to="/reservations" class="text-zinc-400 no-underline transition hover:text-white">Reservations</NuxtLink></li>
            <li><NuxtLink to="/photos" class="text-zinc-400 no-underline transition hover:text-white">Gallery</NuxtLink></li>
            <li><NuxtLink to="/about" class="text-zinc-400 no-underline transition hover:text-white">Our Story</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-zinc-500">Discover</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/reviews" class="text-zinc-400 no-underline transition hover:text-white">Reviews</NuxtLink></li>
            <li><NuxtLink to="/posts" class="text-zinc-400 no-underline transition hover:text-white">Latest Updates</NuxtLink></li>
            <li><NuxtLink to="/qa" class="text-zinc-400 no-underline transition hover:text-white">Q&amp;A</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-zinc-500">Connect</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/locations" class="text-zinc-400 no-underline transition hover:text-white">All Locations</NuxtLink></li>
            <li><NuxtLink to="/contact" class="text-zinc-400 no-underline transition hover:text-white">Contact Us</NuxtLink></li>
          </ul>
        </div>
      </div>

      <!-- Delivery partners row -->
      <div class="flex flex-wrap items-center gap-8 border-b border-white/8 py-10">
        <span class="saya-eyebrow text-zinc-500">Order online</span>
        <span
          v-for="partner in deliveryPartners"
          :key="partner"
          class="saya-display text-lg saya-italic text-zinc-500"
        >
          {{ partner }}
        </span>
      </div>

      <!-- Legal bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-6 text-xs text-zinc-600">
        <div>© {{ year }} {{ restaurantName }}</div>
        <div class="flex gap-6">
          <NuxtLink to="/privacy-policy" class="transition hover:text-zinc-400">Privacy</NuxtLink>
          <NuxtLink to="/terms-and-conditions" class="transition hover:text-zinc-400">Terms</NuxtLink>
          <a href="https://krabiclaw.com" target="_blank" rel="noopener noreferrer" class="transition hover:text-zinc-400">
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
const { getField } = usePageContent('contact') // auto-imported

const year = new Date().getFullYear()
const restaurantName = computed(() => (site as any)?.value?.name || (site as any)?.name || DEFAULT_RESTAURANT_NAME)
const tagline = computed(() => getField('footer.tagline', 'Authentic dining, crafted with passion.'))

const deliveryPartners = ['Uber Eats', 'GrabFood', 'FoodPanda']

// Social links
const facebookUrl = computed(() => getField('social.facebook', ''))
const instagramUrl = computed(() => getField('social.instagram', ''))
const tiktokUrl = computed(() => getField('social.tiktok', ''))

const allSocials = computed(() => [
  { name: 'Facebook', url: facebookUrl.value },
  { name: 'Instagram', url: instagramUrl.value },
  { name: 'Tiktok', url: tiktokUrl.value }
])
const activeSocials = computed(() => allSocials.value.filter(s => s.url))
const inactiveSocials = computed(() => allSocials.value.filter(s => !s.url))

// No await — layout component, data arrives reactively
const { data: locationsData } = useFetch(
  () => `/api/public/sites/${siteId}/locations`,
  {
    key: () => `footer-locs-${siteId}`,
    default: () => ({ locations: [] }),
    enabled: () => !isPlatform && !!siteId
  }
)

const { data: googleBusiness } = useFetch(
  () => `/api/public/sites/${siteId}/google-business`,
  {
    key: () => `footer-google-business-${siteId}`,
    default: () => ({ business: null }),
    enabled: () => !isPlatform && !!siteId
  }
)

const rawLocations = computed(() => (locationsData as any).value?.locations ?? [])

const locations = computed(() =>
  rawLocations.value.map((loc: any) => ({
    ...loc,
    hoursToday: getTodayGoogleHours(googleBusiness.value?.business?.regularHours)
  }))
)

function formatLocAddress(loc: any) {
  if (!loc.address) return ''
  if (typeof loc.address === 'string') return loc.address
  const addr = loc.address
  return [addr.addressLines?.[0], addr.locality, addr.administrativeArea].filter(Boolean).join(', ')
}
</script>
