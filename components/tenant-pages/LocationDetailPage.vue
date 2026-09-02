<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Loading skeleton -->
    <template v-if="pending">
      <div class="relative min-h-160 bg-muted">
        <div class="absolute inset-0 animate-pulse bg-muted" style="animation: sayaPulse 1.6s ease-in-out infinite" />
      </div>
    </template>

    <template v-else-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav
        :location-slug="slug"
        active="overview"
      />

      <!-- Full-bleed location hero -->
      <section class="relative min-h-160 overflow-hidden">
        <video
          v-if="heroMedia.isVideo"
          :src="heroMedia.url ?? undefined"
          autoplay
          muted
          loop
          playsinline
          class="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div
          v-else-if="heroMedia.url"
          class="absolute inset-0 bg-cover bg-center opacity-50"
          :style="heroBackgroundStyle"
        />
        <!-- No real photo yet: same brand-color + icon treatment as the homepage
             hero (SayaHomeHero.vue) — not a stock photo that isn't actually theirs. -->
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center"
          :style="{ background: `linear-gradient(135deg, ${locationHeroBrandColor} 0%, color-mix(in srgb, ${locationHeroBrandColor} 60%, black) 100%)` }"
          aria-hidden="true"
        >
          <SayaIcon :name="locationHeroIcon" class="size-24 text-white/25" />
        </div>
        <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.3) 100%)" />
        <div class="relative flex min-h-160 items-end">
          <div class="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <NuxtLink to="/locations" class="saya-kicker mb-8 inline-block text-white/60 no-underline hover:text-white">
              ← All locations
            </NuxtLink>
            <p class="saya-eyebrow mb-5 text-white/80">{{ location.neighborhood || location.city }}</p>
            <h1 class="saya-display-lg text-white">
              <em class="saya-italic">{{ heroTitle || location.title }}</em>
            </h1>
            <p v-if="heroSubtitle" class="saya-display mt-5 text-2xl text-white/70">
              <em class="saya-italic">{{ heroSubtitle }}</em>
            </p>
            <p v-else-if="!heroTitle" class="saya-display mt-5 text-2xl text-white/70">
              <em class="saya-italic">{{ siteName }}</em>
            </p>
            <div v-if="activeClosureMessage" class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full bg-red-400" />
              {{ activeClosureMessage }}
            </div>
            <div v-else-if="isOpenNow === true" class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full bg-green-400" />
              Open now · {{ todayHours }}
            </div>
            <div v-else-if="isOpenNow === false" class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full bg-zinc-400" />
              Closed · {{ todayHours }}
            </div>
            <div v-else-if="todayHours" class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full bg-amber-400" />
              {{ todayHours }}
            </div>
            <div v-else class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full bg-zinc-300" />
              <a v-if="displayPhone" :href="`tel:${dialablePhone}`" class="text-white/80 no-underline hover:text-white">Call for hours · {{ displayPhone }}</a>
              <span v-else>Contact us for hours</span>
            </div>
            <div class="mt-10 flex flex-wrap gap-3">
              <SayaButton
                v-if="primaryCtaPath"
                :to="primaryCtaPath"
                size="lg"
                class="bg-white! text-black! hover:bg-zinc-100!"
              >
                {{ primaryCtaLabel }}
              </SayaButton>
              <NuxtLink
                v-if="secondaryCtaPath"
                :to="secondaryCtaPath"
                class="inline-flex items-center rounded-full border border-white/50 px-6 py-2.5 text-sm font-medium uppercase tracking-widest text-white transition hover:bg-white/10"
              >
                {{ secondaryCtaLabel }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Quick info strip -->
      <section class="border-b border-default">
        <div class="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:grid-cols-2 lg:grid-cols-3 lg:px-8">
          <div>
            <p class="saya-eyebrow mb-4 text-muted">Address</p>
            <p class="text-sm leading-relaxed text-default">{{ formattedAddress }}</p>
            <a
              v-if="location.maps_url"
              :href="location.maps_url"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-block text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
            >
              Get directions →
            </a>
          </div>
          <div>
            <p class="saya-eyebrow mb-4 text-muted">Hours</p>
            <div class="space-y-1">
              <div
                v-for="day in weekHours"
                :key="day.day"
                class="flex justify-between gap-4 text-sm"
                :class="day.today ? 'font-semibold text-default' : 'text-muted'"
              >
                <span>{{ day.day }}</span>
                <span>{{ day.hours }}</span>
              </div>
              <div v-if="!weekHours.length" class="text-sm text-muted">Contact us for hours</div>
            </div>
          </div>
          <div>
            <p class="saya-eyebrow mb-4 text-muted">Contact</p>
            <a v-if="displayPhone" :href="`tel:${dialablePhone}`" class="block text-sm text-default no-underline hover:underline">
              {{ displayPhone }}
            </a>
            <a v-if="displayEmail" :href="`mailto:${displayEmail}`" class="mt-2 block text-sm text-muted no-underline hover:underline break-all">
              {{ displayEmail }}
            </a>
          </div>
        </div>
      </section>

      <!-- Parking & additional notes -->
      <section v-if="sanitizedParkingInfo || sanitizedExtraNotes" class="border-b border-default">
        <div class="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <!-- eslint-disable vue/no-v-html -->
          <div v-if="sanitizedParkingInfo">
            <p class="saya-eyebrow mb-4 text-muted">Parking</p>
            <div class="prose prose-sm max-w-none text-default" v-html="sanitizedParkingInfo" />
          </div>
          <div v-if="sanitizedExtraNotes">
            <p class="saya-eyebrow mb-4 text-muted">Additional Notes</p>
            <div class="prose prose-sm max-w-none text-default" v-html="sanitizedExtraNotes" />
          </div>
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </section>

      <LazySayaFeaturedContent
        v-if="isExperienceTenant && featuredExperienceItems.length"
        :data="{
          items: featuredExperienceItems,
          kicker: 'Experiences',
          heading: `Experiences at ${location.title}.`,
          linkTarget: locationExperienceHref
        }"
      />
      <LazySayaFeaturedContent
        v-if="productPresentation && featuredProductItems.length"
        :data="{
          items: featuredProductItems,
          kicker: productPresentation.collectionLabel,
          heading: productPresentation.locationCollectionSegment === 'menu' ? `The menu at ${location.title}.` : `Products at ${location.title}.`,
          linkTarget: productCollectionPath
        }"
      />

      <!-- Location posts preview -->
      <LazySayaPosts
        v-if="postsList.length"
        :posts="postsList"
        :limit="3"
        :show-view-more="true"
        :show-empty-state="false"
        :view-more-to="`/locations/${slug}/posts`"
      />

      <!-- Reviews preview -->
      <section v-if="reviewsPreview.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">From our guests</p>
            <h2 class="saya-display-md flex items-center gap-3 text-default">
              <SayaIcon name="star" solid class="size-8 text-primary" aria-hidden="true" />
              {{ location.rating ? Number(location.rating).toFixed(1) : '—' }}
              <span v-if="location.review_count" class="text-muted">· {{ location.review_count }} reviews</span>
            </h2>
          </div>
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="review in reviewsPreview" :key="review.id" class="border border-default bg-default p-8">
              <div class="mb-3 flex gap-1" :aria-label="`${review.rating} out of 5 stars`">
                <SayaIcon
                  v-for="s in 5"
                  :key="s"
                  name="star"
                  solid
                  aria-hidden="true"
                  class="size-3.5"
                  :class="s <= review.rating ? 'text-primary' : 'text-muted'"
                />
                <span class="sr-only">{{ review.rating }} out of 5 stars</span>
              </div>
              <p class="text-sm leading-relaxed text-default">"{{ review.content }}"</p>
              <div class="mt-6 border-t border-default pt-4">
                <div class="text-sm font-medium text-default">{{ review.author_name }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Other locations rail (multi-location brands only) -->
      <section v-if="otherLocations.length" class="bg-inverted text-inverted">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-12 flex flex-wrap items-end justify-between gap-8">
            <div>
              <p class="saya-kicker mb-6">{{ locationIndexCopy.otherLocationsHeading }}</p>
              <h2 class="saya-display-md text-inverted">
                Also part of <em class="saya-italic">{{ siteName }}</em>.
              </h2>
            </div>
            <NuxtLink
              to="/locations"
              class="border-b border-inverted/40 pb-1 text-xs uppercase tracking-widest text-inverted no-underline transition hover:opacity-70"
            >
              All locations →
            </NuxtLink>
          </div>
          <div :class="['grid gap-6', otherLocations.length === 1 ? 'max-w-xl' : 'sm:grid-cols-2 lg:grid-cols-3']">
            <NuxtLink
              v-for="loc in otherLocations"
              :key="loc.id"
              :to="`/locations/${loc.slug}`"
              class="block overflow-hidden border border-inverted/10 bg-inverted/5 no-underline transition hover:border-inverted/20"
            >
              <div class="aspect-video overflow-hidden bg-inverted/10">
                <video
                  v-if="locationMedia(loc)?.public_url && locationMedia(loc)?.kind === 'video'"
                  :src="locationMedia(loc)?.public_url"
                  class="h-full w-full object-contain"
                  autoplay muted loop playsinline
                />
                <img
                  v-else-if="locationMedia(loc)?.public_url"
                  :src="locationMedia(loc)?.public_url"
                  :alt="loc.title"
                  class="h-full w-full object-contain transition-transform duration-500 hover:scale-105"
                >
              </div>
              <div class="p-7">
                <p class="saya-eyebrow mb-3 text-inverted/50">{{ loc.neighborhood || loc.city }}</p>
                <div class="saya-display saya-italic text-3xl text-inverted leading-none">{{ loc.title }}</div>
                <p class="mt-4 text-xs uppercase tracking-widest text-inverted/50">Visit this room →</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Plan a visit CTA — map lives on /contact -->
      <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="flex flex-wrap items-center justify-between gap-8">
          <h2 class="saya-display-md saya-italic text-default">See you soon.</h2>
          <div class="flex flex-wrap gap-3">
            <SayaButton v-if="primaryCtaPath" :to="primaryCtaPath" size="lg">
              {{ primaryCtaLabel }}
            </SayaButton>
            <NuxtLink
              :to="`/locations/${slug}/contact`"
              class="inline-flex items-center rounded-full border border-default px-6 py-2.5 text-xs font-medium uppercase tracking-widest text-default transition hover:bg-muted"
            >
              Plan a visit →
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- ── Dynamic content blocks ───────────────────────────── -->
      <template v-if="contentBlocks.length > 0">
        <component
          v-for="block in contentBlocks.filter(b => b.component)"
          :key="block._uid || block.field"
          :is="resolveComponent(block.component)"
          :data="block"
          class="content-block"
        />
      </template>
    </template>

    <!-- Not found -->
    <div v-else class="mx-auto max-w-xl px-4 py-24 text-center">
      <SayaIcon name="map-pin" class="mx-auto mb-4 size-12 text-muted" />
      <h1 class="saya-display-sm text-default">Location Not Found</h1>
      <SayaButton to="/locations" class="mt-8">View all locations</SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
// Shared by pages/locations/[slug]/index.vue (English, matched directly by
// Nuxt's file router) and the locale-prefixed catch-all
// (pages/[...tenantPath].vue, representation.kind === 'resource' with
// resource_type 'business_location'). See
// components/tenant-pages/LocationQaPage.vue for why this can't be a route
// alias instead.
import { formatGoogleHours, getTodayGoogleHours, getIsOpenNow, getActiveSpecialClosure, formatClosureMessage, nowInTimezone } from '~/utils/formatters'
import { formatProductMoney } from '~/utils/product-money'
import { productLocationCollectionPath, resolveProductPresentation } from '~/utils/product-presentation'
import { useDynamicComponent } from '~/composables/useDynamicComponent'
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'
import type { Experience } from '~/server/utils/experiences'

const DOMPurify = useHtmlSanitizer()

const { resolveMedia } = useMedia()
const { resolveComponent } = useDynamicComponent()

const route = useRoute()
const { siteId, site } = useTenantSite()
const { locale } = useI18n()
const locationIndexCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
if (!siteId) throw createError({ statusCode: 404 })

const {
  location,
  locations,
  getField: getContentField,
  getHero: getContentHero,
  products,
  locationReviews,
  pending,
  config: pageConfig,
  site: publicSite,
  experiencesList,
  contentBlocks,
  postsList,
} = await usePublicPageData()

const slug = computed(() => location.value?.slug ?? String(route.params.slug ?? ''))
const siteName = computed(() => String((site as ApiValue)?.brand_name ?? '').trim())

const isExperienceTenant = computed(() => (site as ApiValue)?.vertical === 'experience')
const productPresentation = computed(() => resolveProductPresentation((site as ApiValue)?.vertical as string | null | undefined))
const locationProducts = computed(() => products.value.filter(product => product.location_id === location.value?.id))
const productCollectionPath = computed(() => {
  if (!productPresentation.value || !location.value) return null
  return productLocationCollectionPath((site as ApiValue)?.vertical as string, location.value.slug)
})
const locationMedia = (location: ApiRecord) => Array.isArray(location.media)
  ? (location.media as ApiRecord[]).find(item => item.slot === 'hero') ?? null
  : null
const locationExperienceHref = computed(() =>
  resolveLocationExperienceHref(slug.value, experiencesList.value)
)

const primaryCtaPath = computed(() => {
  if (isExperienceTenant.value) return locationExperienceHref.value
  return locationIndexCopy.value.ctaRoute
})
const primaryCtaLabel = computed(() => locationIndexCopy.value.reserveCta)

const secondaryCtaPath = computed(() => {
  if (locationProducts.value.length > 0) return productCollectionPath.value
  if (locationExperienceHref.value) return locationExperienceHref.value
  return null
})

const secondaryCtaLabel = computed(() => {
  if (locationProducts.value.length > 0) return productPresentation.value?.locationCollectionSegment === 'menu' ? 'View menu' : 'View products'
  if (!isExperienceTenant.value && locationExperienceHref.value) return 'View experiences'
  return null
})


// Contact details are location-owned; missing or placeholder values stay absent.
const displayPhone = computed(() => {
  const p = location.value?.phone
  return p && !p.includes('example.com') ? p : null
})
const dialablePhone = computed(() => displayPhone.value?.replace(/[^\d+]/g, '') ?? '')
const displayEmail = computed(() => {
  const e = location.value?.email
  if (e && !e.includes('example.com') && !e.includes('krabiclaw.com')) return e
  return null
})

// Other locations for the "Sister rooms" rail
const otherLocations = computed(() => locations.value.filter((l: ApiRecord) => l.slug !== slug.value))

// Reviews preview from bootstrap
const reviewsPreview = computed(() => locationReviews.value.slice(0, 3))

// Neutral default until the owner picks a brand color in onboarding.
const locationHeroBrandColor = computed(() => pageConfig.value?.brand_color || '#3F3F46')
const locationHeroIcon = computed(() => (site as ApiValue)?.vertical === 'experience' ? 'sparkles' : 'map-pin')

// Sanitize hero background URL to prevent CSS injection
const heroBackgroundStyle = computed(() => {
  const raw = String(heroMedia.value?.url || '').trim()
  if (!raw) return {}

  let safeHref = ''
  try {
    if (raw.startsWith('/')) {
      safeHref = encodeURI(raw)
    } else {
      const parsed = new URL(raw)
      if (!['http:', 'https:'].includes(parsed.protocol)) return {}
      safeHref = encodeURI(parsed.href)
    }
  } catch {
    return {}
  }

  if (/["'\\);]/.test(safeHref) || safeHref.includes('/*') || safeHref.includes('*/')) {
    return {}
  }

  return { backgroundImage: `url("${safeHref}")` }
})

const featuredProductItems = computed(() => {
  const presentation = productPresentation.value
  if (!presentation) return []
  return locationProducts.value
    .filter(product => product.featured)
    .sort((a, b) => a.featured_sort_order - b.featured_sort_order || a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .slice(0, 4)
    .map(product => ({
      name: product.name,
      price: formatProductMoney(product.price),
      compareAtPrice: product.price?.compare_at_amount_minor
        ? formatProductMoney({ ...product.price, amount_minor: product.price.compare_at_amount_minor, compare_at_amount_minor: null })
        : '',
      image: product.image?.public_url || null,
      imageKind: 'image',
      alt: product.image?.alt_text || product.name,
      href: presentation.productPath(slug.value, product.slug),
      unavailable: !product.available,
    }))
})

const featuredExperienceItems = computed(() => {
  const featured = experiencesList.value
    .filter(experience => experience.status === 'active' && experience.featured && experience.location_id === location.value?.id)
    .sort((a, b) => Number(a.featured_sort_order) - Number(b.featured_sort_order) || Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)))
  return featured.slice(0, 4).map(experience => ({
    name: experience.title,
    price: formatProductMoney(experience.price),
    compareAtPrice: experience.price?.compare_at_amount_minor
      ? formatProductMoney({ ...experience.price, amount_minor: experience.price.compare_at_amount_minor, compare_at_amount_minor: null })
      : '',
    image: experienceCoverImage(experience),
    imageKind: 'image',
    alt: experience.title ? `${experience.title} experience` : 'Featured experience image',
    href: experience.slug ? `/experiences/${experience.slug}` : locationExperienceHref.value || undefined,
    unavailable: Boolean(activeClosureMessage.value),
  }))
})

function experienceCoverImage(exp: Experience): string | null {
  const cover = exp.media?.[0]
  if (cover?.kind === 'image') return cover.public_url || null
  if (cover?.kind === 'video') return cover.thumbnail_url || null
  return null
}

// Content hero fields take precedence; fall back to the imported primary photo
const contentHero = computed(() => getContentHero({ title: '', subtitle: '', image: '', video: '' }))
const heroMedia = computed(() => {
  if (contentHero.value.video) return resolveMedia({ public_url: contentHero.value.video, thumbnail_url: contentHero.value.thumbnail_url, kind: contentHero.value.videoKind || 'video' })
  if (contentHero.value.image) return resolveMedia({ public_url: contentHero.value.image, kind: contentHero.value.imageKind || 'image' })
  return resolveMedia(location.value ? locationMedia(location.value as ApiRecord) : null)
})
const heroTitle = computed(() => contentHero.value.title || null)
const heroSubtitle = computed(() => contentHero.value.subtitle || null)

const parkingInfo = computed(() => getContentField('parking.info', '') ?? '')
const extraNotes = computed(() => getContentField('extra.notes', '') ?? '')
const sanitizedParkingInfo = computed(() => DOMPurify.sanitize(parkingInfo.value))
const sanitizedExtraNotes = computed(() => DOMPurify.sanitize(extraNotes.value))

// Derived location data. `address_translated`/`opening_hours_translated` are
// the CMS translation overlay (see PROJECTED_FIELD_NAMES.business_location) —
// plain display text, kept under a different key than the canonical
// structured fields so the visible surface can show localized text while
// maps/JSON-LD/open-now logic keep reading the untouched canonical object.
const canonicalFormattedAddress = computed(() => {
  const loc = location.value
  if (!loc) return ''
  if (loc.address && typeof loc.address === 'object') {
    const a = loc.address
    return [a.addressLines?.[0], a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(', ')
  }
  return loc.address || loc.city || ''
})
const formattedAddress = computed(() => {
  const translated = String(location.value?.address_translated || '').trim()
  return translated || canonicalFormattedAddress.value
})

const translatedWeekdayHours = computed(() => {
  const translated = location.value?.opening_hours_translated
  return Array.isArray(translated) && translated.length ? translated : null
})
const weekHours = computed(() => {
  const hours = translatedWeekdayHours.value ? { weekdayDescriptions: translatedWeekdayHours.value } : location.value?.opening_hours
  if (!hours) return []
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  const today = nowInTimezone(location.value?.timezone).weekday
  return formatGoogleHours(hours).map((h: ApiValue, i: number) => ({
    ...h,
    today: days[i] === today
  }))
})

const todayHours = computed(() => {
  if (translatedWeekdayHours.value) {
    const today = nowInTimezone(location.value?.timezone).weekday
    const line = translatedWeekdayHours.value.find((l: string) => l.trim().toUpperCase().startsWith(`${today}:`))
    if (line) return line.replace(/^[^:]+:\s*/, '').trim()
  }
  return getTodayGoogleHours(location.value?.opening_hours, nowInTimezone(location.value?.timezone).weekday)
})
// Open/closed is a machine determination — always computed off the
// canonical structured hours object, never the translated display text.
const isOpenNow = computed(() => getIsOpenNow(location.value?.opening_hours, location.value?.timezone))

const activeClosure = computed(() => getActiveSpecialClosure(location.value?.special_hours, location.value?.timezone))
const activeClosureMessage = computed(() => formatClosureMessage(activeClosure.value))



const runtimeConfig = useRuntimeConfig()
const siteUrl = runtimeConfig.public.siteUrl
await useReciprocalHreflang(() => `/locations/${slug.value}`)
useSocialMetadata(() => ({
  path: location.value?.canonical_url || `/locations/${slug.value}`,
  title: location.value?.seo_title || (location.value ? `${location.value.title} | Locations` : 'Location'),
  description: location.value?.seo_description || (location.value ? `Visit ${location.value.title}. ${formattedAddress.value}` : ''),
  location: location.value?.title || null,
  robots: location.value?.robots || null,
  brand: {
    siteName: siteName.value,
    logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: publicSite.value?.media.find(item => item.slot === 'favicon')?.public_url || null,
    primaryColor: pageConfig.value?.brand_color || null,
  },
  heroImage: heroMedia.value.url
    ? {
        url: heroMedia.value.url,
        kind: heroMedia.value.kind === 'video' ? 'video' : 'image',
        thumbnailUrl: heroMedia.value.thumb,
      }
    : null,
}))

useSchemaOrg([
  computed(() => {
    const loc = location.value
    // nuxt-schema-org's own UnheadSchemaOrg plugin explicitly filters out non-object and null
    // nodes before building the graph, so undefined is the correct, filtered "no schema" value
    // here — the vendored UseSchemaOrgInput type just doesn't include it in its union.
    if (!loc) return undefined as unknown as Record<string, unknown>
    return {
      '@type': getBusinessSchemaTypes((site as ApiValue)?.vertical),
      name: `${siteName.value} — ${loc.title}`,
      description: canonicalFormattedAddress.value,
      address: { '@type': 'PostalAddress', streetAddress: canonicalFormattedAddress.value },
      telephone: loc.phone,
      url: `${siteUrl}/locations/${loc.slug}`,
      ...(loc.latitude && loc.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude } } : {}),
      ...(loc.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: loc.rating, reviewCount: loc.review_count ?? 0 } } : {})
    }
  }),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` }
    ]
  }))
])
</script>
