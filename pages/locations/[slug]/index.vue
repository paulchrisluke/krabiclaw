<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Breadcrumb -->
    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <!-- Loading skeleton -->
    <template v-if="pending">
      <div class="relative mt-6 min-h-160 bg-muted">
        <div class="absolute inset-0 animate-pulse bg-muted" style="animation: sayaPulse 1.6s ease-in-out infinite" />
      </div>
    </template>

    <template v-else-if="location">
      <!-- Full-bleed location hero -->
      <section class="relative mt-6 min-h-160 overflow-hidden">
        <div
          class="absolute inset-0 bg-cover bg-center"
          :style="location.image_url ? `background-image: url(${location.image_url})` : ''"
          :class="!location.image_url ? 'bg-zinc-900' : ''"
        />
        <div class="absolute inset-0" style="background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.3) 100%)" />
        <div class="relative flex min-h-160 items-end">
          <div class="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <p class="saya-eyebrow mb-5 text-white/80">{{ location.city || location.neighborhood }}</p>
            <h1 class="saya-display-lg text-white">
              <em class="saya-italic">{{ siteName }}</em>
              <span class="mt-6 block text-[0.45em] font-normal not-italic tracking-[0.3em] uppercase">
                {{ location.title }}
              </span>
            </h1>
            <div class="mt-8 flex items-center gap-2.5 text-sm uppercase tracking-widest text-white">
              <span class="size-1.5 rounded-full" :class="isOpenNow ? 'bg-green-400' : 'bg-zinc-400'" />
              {{ isOpenNow ? 'Open now' : 'Closed' }} · {{ todayHours }}
            </div>
            <div class="mt-10 flex flex-wrap gap-3">
              <UButton
                to="/reservations"
                size="lg"
                color="neutral"
                class="rounded-full bg-white! text-black! hover:bg-zinc-100!"
              >
                Reserve a table
              </UButton>
              <NuxtLink
                :to="`/locations/${slug}/menu`"
                class="inline-flex items-center rounded-full border border-white/50 px-6 py-2.5 text-sm font-medium uppercase tracking-widest text-white transition hover:bg-white/10"
              >
                View menu
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Quick info strip -->
      <section class="border-b border-default">
        <div class="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <p class="saya-eyebrow mb-4 text-muted">Address</p>
            <p class="text-sm leading-relaxed text-default">{{ formattedAddress }}</p>
            <a
              v-if="location.maps_url"
              :href="location.maps_url"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-block text-xs uppercase tracking-widest text-primary no-underline transition hover:opacity-70"
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
            <a v-if="location.phone" :href="`tel:${location.phone}`" class="block text-sm text-default no-underline hover:underline">
              {{ location.phone }}
            </a>
            <a v-if="location.email" :href="`mailto:${location.email}`" class="mt-2 block text-sm text-muted no-underline hover:underline">
              {{ location.email }}
            </a>
          </div>
          <div>
            <p class="saya-eyebrow mb-4 text-muted">This location</p>
            <div class="flex flex-col gap-2">
              <NuxtLink :to="`/locations/${slug}/menu`" class="text-sm text-default no-underline hover:underline">Menu</NuxtLink>
              <NuxtLink :to="`/locations/${slug}/reviews`" class="text-sm text-default no-underline hover:underline">
                Reviews{{ location.review_count ? ` (${location.review_count})` : '' }}
              </NuxtLink>
              <NuxtLink :to="`/locations/${slug}/photos`" class="text-sm text-default no-underline hover:underline">Photos</NuxtLink>
              <NuxtLink :to="`/locations/${slug}/contact`" class="text-sm text-default no-underline hover:underline">Parking & access</NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Sub-nav -->
      <SayaSubNav
        :location-slug="slug"
        active="menu"
        :review-count="location.review_count"
        :photo-count="location.photo_count"
        :qa-count="location.qa_count"
      />

      <!-- Menu preview -->
      <section v-if="featuredItems.length" class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-6">The menu</p>
          <h2 class="saya-display-md text-default">What we're cooking at {{ location.title }}.</h2>
        </div>
        <div class="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="item in featuredItems" :key="item.id">
            <div
              v-if="item.image_url"
              class="mb-5 aspect-4/3 overflow-hidden bg-muted"
            >
              <img :src="item.image_url" :alt="item.name" class="h-full w-full object-cover transition-transform duration-500 hover:scale-105" >
            </div>
            <div v-else class="mb-5 aspect-4/3 bg-muted" />
            <div class="saya-display saya-italic text-2xl text-default">{{ item.name }}</div>
            <div v-if="item.description" class="mt-2 text-sm leading-relaxed text-muted">{{ item.description }}</div>
            <div v-if="item.price" class="mt-3 text-sm tabular-nums text-default">{{ item.price }}</div>
          </article>
        </div>
        <div class="mt-12 text-center">
          <NuxtLink
            :to="`/locations/${slug}/menu`"
            class="border-b border-default pb-1 text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
          >
            View the full menu →
          </NuxtLink>
        </div>
      </section>

      <!-- Reviews preview -->
      <section v-if="reviewsPreview.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">From our guests</p>
            <h2 class="saya-display-md flex items-center gap-3 text-default">
              <UIcon name="i-heroicons-star-solid" class="size-8 text-primary" />
              {{ location.rating ? Number(location.rating).toFixed(1) : '—' }}
              <span v-if="location.review_count" class="text-muted">· {{ location.review_count }} reviews</span>
            </h2>
          </div>
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="review in reviewsPreview" :key="review.id" class="border border-default bg-default p-8">
              <div class="mb-3 flex gap-1">
                <UIcon
                  v-for="s in 5"
                  :key="s"
                  name="i-heroicons-star-solid"
                  class="size-3.5"
                  :class="s <= review.rating ? 'text-primary' : 'text-muted'"
                />
              </div>
              <p class="text-sm leading-relaxed text-default">"{{ review.content }}"</p>
              <div class="mt-6 border-t border-default pt-4">
                <div class="text-sm font-medium text-default">{{ review.author_name }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Map -->
      <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-6">Find us</p>
          <h2 class="saya-display-md text-default">{{ formattedAddress || location.title }}</h2>
        </div>
        <div class="aspect-21/9 overflow-hidden border border-default">
          <iframe
            v-if="mapEmbedSrc"
            :src="mapEmbedSrc"
            width="100%"
            height="100%"
            style="border:0"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          />
          <div v-else class="flex h-full w-full flex-col items-center justify-center bg-muted gap-3">
            <UIcon name="i-simple-icons-googlemaps" class="size-8 text-muted" />
            <span class="text-sm text-muted">Google Maps will appear once synced</span>
          </div>
        </div>
      </section>
    </template>

    <!-- Not found -->
    <div v-else class="mx-auto max-w-xl px-4 py-24 text-center">
      <UIcon name="i-heroicons-map-pin" class="mx-auto mb-4 size-12 text-muted" />
      <h1 class="saya-display-sm text-default">Location Not Found</h1>
      <UButton to="/locations" color="neutral" variant="solid" class="mt-8 rounded-full">View all locations</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatGoogleHours, getTodayGoogleHours } from '~/utils/formatters'

definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

// Fetch location
const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `public-location-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (data as any).value?.location ?? null)

// Fetch reviews preview (first 3)
const { data: reviewsData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}/reviews`,
  { key: () => `public-reviews-preview-${siteId}-${slug.value}`, default: () => ({ reviews: [] }) }
)
const reviewsPreview = computed(() => ((reviewsData as any).value?.reviews ?? []).slice(0, 3))

// Fetch menu for featured items
const { data: menuData } = await useFetch(
  () => `/api/public/sites/${siteId}/menus?locationId=${location.value?.id ?? ''}`,
  {
    key: () => `public-menu-preview-${siteId}-${slug.value}`,
    default: () => ({ menu: null }),
    watch: [() => location.value?.id]
  }
)
const featuredItems = computed(() => {
  const items = (menuData as any).value?.menu?.items ?? []
  return items.filter((i: any) => i.featured || i.available !== false).slice(0, 3)
})

// Derived location data
const formattedAddress = computed(() => {
  const loc = location.value
  if (!loc) return ''
  if (loc.address && typeof loc.address === 'object') {
    const a = loc.address
    return [a.addressLines?.[0], a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(', ')
  }
  return loc.address || loc.city || ''
})

const weekHours = computed(() => {
  const hours = location.value?.opening_hours
  if (!hours) return []
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  const today = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()]
  return formatGoogleHours(hours).map((h: any, i: number) => ({
    ...h,
    today: days[i] === today
  }))
})

const todayHours = computed(() => getTodayGoogleHours(location.value?.opening_hours))
const isOpenNow = computed(() => {
  // Simple heuristic: if todayHours mentions "Open today" it's open (real open-now needs GMB)
  const h = todayHours.value
  return h?.startsWith('Open today')
})

const mapEmbedSrc = computed(() => {
  const loc = location.value
  if (!loc) return null
  if (loc.latitude && loc.longitude) {
    return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d500!2d${loc.longitude}!3d${loc.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sth`
  }
  return null
})

const breadcrumb = computed(() => [
  { label: siteName.value, to: '/' },
  { label: 'Locations', to: '/locations' },
  { label: location.value?.title || slug.value }
])

useSeoMeta({
  title: () => location.value ? `${location.value.title} | Locations` : 'Location',
  description: () => location.value ? `Visit ${location.value.title}. ${formattedAddress.value}` : '',
  ogUrl: () => `/locations/${slug.value}`
})

useSchemaOrg([
  computed(() => {
    const loc = location.value
    if (!loc) return {}
    return {
      '@type': ['Restaurant', 'LocalBusiness'],
      name: `${siteName.value} — ${loc.title}`,
      description: formattedAddress.value,
      address: { '@type': 'PostalAddress', streetAddress: formattedAddress.value },
      telephone: loc.phone,
      url: `/locations/${loc.slug}`,
      ...(loc.latitude && loc.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude } } : {}),
      ...(loc.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: loc.rating, reviewCount: loc.review_count ?? 0 } } : {})
    }
  }),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: '/locations' },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `/locations/${slug.value}` }
    ]
  }))
])
</script>
