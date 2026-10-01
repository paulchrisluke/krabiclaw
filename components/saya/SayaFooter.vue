<template>
  <footer class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-8">

      <!-- Top section: brand + locations grid -->
      <div class="grid gap-16 border-b border-inverted/10 pb-14 lg:grid-cols-[1fr_1.4fr]">
        <!-- Brand column -->
        <div>
          <NuxtLink :to="localePath('/')" class="block no-underline leading-none">
            <div v-if="logoUrl" class="size-14 rounded-full overflow-hidden">
              <img :src="logoUrl" :alt="restaurantName" loading="lazy" decoding="async" class="h-full w-full object-cover" />
            </div>
            <div v-else class="flex size-14 items-center justify-center rounded-full bg-inverted/10 text-inverted font-bold text-2xl">
              {{ restaurantName.charAt(0).toUpperCase() }}
            </div>
          </NuxtLink>
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-inverted/60">
            {{ tagline }}
          </p>

        </div>

        <!-- Locations grid -->
        <div
          v-if="locationsError"
          class="rounded-xl border border-inverted/10 bg-inverted/5 p-6 text-sm text-inverted/60"
          role="status"
          aria-live="polite"
        >
          {{ t('saya.footer.locations_error') }}
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
              :to="localePath(`/locations/${loc.slug}`)"
              class="mt-3 inline-block border-b border-inverted pb-0.5 text-xs uppercase tracking-widest text-inverted transition hover:opacity-70"
            >
              {{ t('saya.footer.visit_page') }}
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Navigation links -->
      <div class="grid gap-8 border-b border-inverted/10 py-12 sm:grid-cols-3">
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_experience') }}</h4>
          <ul class="space-y-3 text-sm">
            <li v-if="showProducts"><NuxtLink :to="localePath(productPresentation!.collectionPath)" class="text-inverted/60 no-underline transition hover:text-inverted">{{ productCollectionLabel }}</NuxtLink></li>
            <li v-if="showExperiences"><NuxtLink :to="localePath(EXPERIENCE_PRESENTATION.collectionPath)" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.experiences') }}</NuxtLink></li>
            <li v-if="!isExperienceOrganization"><NuxtLink :to="localePath('/reservations')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ copy.reservationPageKicker }}</NuxtLink></li>
            <li v-if="!isExperienceOrganization"><NuxtLink :to="localePath('/photos')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.gallery') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/about')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.our_story') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_discover') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink :to="localePath('/blog')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.blog') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/reviews')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.reviews') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/posts')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.latest_updates') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/qa')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.qa') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_connect') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink :to="localePath('/locations')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.all_locations') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/contact')" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.contact_us') }}</NuxtLink></li>
          </ul>
        </div>
      </div>

      <SiteFooterBar :name="restaurantName" color-mode class="pt-6 text-inverted/70">
        <a
          v-if="showBrandingCredit"
          href="https://krabiclaw.com"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:opacity-70"
        >
          {{ t('saya.footer.powered_by') }}, {{ copy.poweredByTagline }}
        </a>
      </SiteFooterBar>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { getActiveSpecialClosure } from '~/utils/formatters'
import { getTodayHoursLabel, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import { getVerticalCopy } from '~/utils/vertical-copy'
import { EXPERIENCE_PRESENTATION, resolveProductPresentation } from '~/utils/product-presentation'
import { formatPostalAddress, type PostalAddress } from '~/utils/postal-address'

interface Organization {
  name?: string | null
  brand_description?: string | null
  media?: Array<{ slot?: string; public_url?: string | null }>
  plan?: string | null
  vertical?: string | null
  config?: { phone?: string | null } | null
}

interface PublicLocation {
  id: string
  slug: string
  title: string
  address?: PostalAddress | null
  phone?: string | null
  email?: string | null
  googleMapsHours?: ApiValue
  opening_hours?: OpeningHours
  special_hours?: SpecialHours
  timezone?: string | null
}

// Data comes from layouts/saya.vue, which already owns the single shared
// bootstrap/tenant-site fetch — footer is presentation-only, not a fetcher.
const props = defineProps<{
  organization: Organization | null
  isPlatform: boolean
  locations: PublicLocation[]
  error: unknown
  hasProducts: boolean
  hasBookableProducts: boolean
}>()

const { t, locale, localePath } = useI18n()
const copy = computed(() => getVerticalCopy(props.organization?.vertical, locale.value))
const isExperienceOrganization = computed(() => props.organization?.vertical === 'experience')
const locationsError = computed(() => props.error)

const productPresentation = computed(() => resolveProductPresentation(props.organization?.vertical))
const showProducts = computed(() => props.hasProducts && productPresentation.value !== null)
// Offered only when the site has something a guest can book.
const showExperiences = computed(() => props.hasBookableProducts)
const productCollectionLabel = computed(() => productPresentation.value?.locationCollectionSegment === 'menu'
  ? t('saya.footer.menu')
  : t('saya.footer.products'))
const logoUrl = computed(() => Array.isArray(props.organization?.media)
  ? (props.organization.media as ApiRecord[]).find(item => item.slot === 'logo')?.public_url || null
  : null)
const restaurantName = computed(() => props.organization?.name?.trim() || '')
const tagline = computed(() => props.organization?.brand_description?.trim() || '')
const organizationPlan = computed(() => props.organization?.plan)
const showBrandingCredit = computed(() => !props.isPlatform && organizationPlan.value === 'free')

const locations = computed(() =>
  props.locations.map((loc: PublicLocation) => {
    const closure = getActiveSpecialClosure(loc.special_hours ?? null, loc.timezone)
    return {
      ...loc,
      hoursToday: closure
        ? t('saya.footer.temporarily_closed')
        : getTodayHoursLabel(loc.opening_hours ?? null, t('saya.location.closed'), loc.timezone, new Date(), loc.special_hours ?? null, locale.value),
    }
  })
)

function formatLocAddress(loc: PublicLocation) {
  return formatPostalAddress(loc.address ?? null)
}


</script>
