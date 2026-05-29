<template>
  <footer class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 pt-20 pb-8 sm:px-6 lg:px-8">

      <!-- Top section: brand + locations grid -->
      <div class="grid gap-16 border-b border-inverted/10 pb-14 lg:grid-cols-[1fr_1.4fr]">
        <!-- Brand column -->
        <div>
          <NuxtLink to="/" class="block no-underline leading-none">
            <img
              v-if="logoUrl"
              :src="logoUrl"
              :alt="restaurantName"
              class="h-12 w-auto max-w-48 object-contain"
            />
            <span v-else class="saya-display text-5xl text-inverted">{{ restaurantName }}</span>
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
          {{ $t('saya.footer.locations_error') }}
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
              {{ $t('saya.footer.visit_page') }}
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Navigation links -->
      <div class="grid gap-8 border-b border-inverted/10 py-12 sm:grid-cols-3">
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ $t('saya.footer.heading_experience') }}</h4>
          <ul class="space-y-3 text-sm">
            <li v-if="hasMenu"><NuxtLink to="/menu" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.menu') }}</NuxtLink></li>
            <li v-if="hasExperiences"><NuxtLink to="/experiences" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.experiences') }}</NuxtLink></li>
            <li><NuxtLink to="/reservations" class="text-inverted/60 no-underline transition hover:text-inverted">{{ copy.reservationPageKicker }}</NuxtLink></li>
            <li v-if="!hasExperiences"><NuxtLink to="/photos" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.gallery') }}</NuxtLink></li>
            <li><NuxtLink to="/about" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.our_story') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ $t('saya.footer.heading_discover') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/reviews" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.reviews') }}</NuxtLink></li>
            <li><NuxtLink to="/posts" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.latest_updates') }}</NuxtLink></li>
            <li><NuxtLink to="/qa" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.qa') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ $t('saya.footer.heading_connect') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/locations" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.all_locations') }}</NuxtLink></li>
            <li><NuxtLink to="/contact" class="text-inverted/60 no-underline transition hover:text-inverted">{{ $t('saya.footer.contact_us') }}</NuxtLink></li>
          </ul>
        </div>
      </div>

      <!-- Delivery partners row — only rendered when at least one link is configured AND not an experiences site -->
      <div v-if="orderLinks.length && !hasExperiences" class="flex flex-wrap items-center gap-8 border-b border-inverted/10 py-10">
        <span class="saya-eyebrow text-inverted/50">{{ $t('saya.footer.order_online') }}</span>
        <a
          v-for="link in orderLinks"
          :key="link.label"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="saya-display text-lg saya-italic text-inverted/60 transition hover:text-inverted"
        >
          {{ link.label }}
        </a>
      </div>

      <!-- Legal bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-6 text-xs text-inverted/40">
        <div>© {{ year }} {{ restaurantName }}</div>
        <div class="flex gap-6">
          <NuxtLink to="/privacy" class="transition hover:text-inverted/70">{{ $t('legal.privacy') }}</NuxtLink>
          <NuxtLink to="/terms" class="transition hover:text-inverted/70">{{ $t('legal.terms') }}</NuxtLink>
          <a
            v-if="showBrandingCredit"
            href="https://krabiclaw.com"
            target="_blank"
            rel="noopener noreferrer"
            class="transition hover:text-inverted/70"
          >
            {{ $t('saya.footer.powered_by') }}, {{ copy.poweredByTagline }}
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { DEFAULT_RESTAURANT_NAME } from '~/config/constants'
import { getTodayGoogleHours } from '~/utils/formatters'
import { getVerticalCopy } from '~/utils/vertical-copy'

const { isPlatform, site } = useTenantSite()
const copy = computed(() => getVerticalCopy((site as { vertical?: string } | null)?.vertical))

// Shared bootstrap — same key as the page → zero extra SSR requests
const { locations: bootstrapLocations, error: bootstrapError, config: siteConfig, menu, hasExperiences } = useBootstrap()
const locationsError = computed(() => bootstrapError.value)

const hasMenu = computed(() => {
  const m = menu.value as { items?: unknown[] } | null
  return !!(m && m.items && m.items.length > 0)
})
const year = new Date().getFullYear()
const logoUrl = computed(() => (site as { logo_url?: string | null } | null)?.logo_url || null)
const restaurantName = computed(() => {
  if (site && typeof site === 'object' && 'brand_name' in site && typeof site.brand_name === 'string' && site.brand_name.trim()) {
    return site.brand_name
  }
  return DEFAULT_RESTAURANT_NAME
})
const tagline = computed(() => siteConfig.value?.footer_tagline || '')
const sitePlan = computed(() => (site as { plan?: string | null } | null)?.plan)
const showBrandingCredit = computed(() => !isPlatform && sitePlan.value === 'free')

const primaryLocation = computed<PublicLocation | null>(() =>
  bootstrapLocations.value.find((l: PublicLocation) => l.is_primary) ?? bootstrapLocations.value[0] ?? null
)

interface OrderLink { label: string; url: string }
const orderLinks = computed<OrderLink[]>(() => {
  const loc = primaryLocation.value
  if (!loc) return []
  return [
    { label: 'Grab', url: loc.grab_url ?? '' },
    { label: 'Uber Eats', url: loc.uber_eats_url ?? '' },
    { label: 'FoodPanda', url: loc.foodpanda_url ?? '' },
  ].filter(o => o.url)
})

function safeHttpUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null

  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

const facebookUrl = computed(() => safeHttpUrl(siteConfig.value?.social_facebook) || '')
const instagramUrl = computed(() => safeHttpUrl(siteConfig.value?.social_instagram) || '')
const tiktokUrl = computed(() => safeHttpUrl(siteConfig.value?.social_tiktok) || '')

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
  googleBusinessHours?: ApiValue
  is_primary?: boolean
  grab_url?: string | null
  uber_eats_url?: string | null
  foodpanda_url?: string | null
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
const rawLocations = computed(() => bootstrapLocations.value)
const locations = computed(() =>
  rawLocations.value.map((loc: PublicLocation) => {
    let phone = loc.phone
    // Fallback if placeholder-like
    if (!phone || phone.includes('example.com')) {
      phone = site?.config?.phone || null
    }
    return {
      ...loc,
      phone,
      hoursToday: loc.googleBusinessHours ? getTodayGoogleHours(loc.googleBusinessHours) : null
    }
  })
)

function formatLocAddress(loc: PublicLocation) {
  if (!loc.address) return ''
  if (typeof loc.address === 'string') return loc.address
  const addr = typeof loc.address === 'object' && loc.address !== null ? loc.address : null
  const line1 = Array.isArray(addr?.addressLines) ? addr?.addressLines?.[0] : ''
  return [line1, addr?.locality, addr?.administrativeArea].filter(Boolean).join(', ')
}
</script>
