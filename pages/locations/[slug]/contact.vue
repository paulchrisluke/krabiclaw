<template>
  <div class="min-h-screen bg-default text-default">

    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <header class="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ location?.title }}</p>
      <h1 class="saya-display-lg text-default">
        <em class="saya-italic">Find</em> us
      </h1>
    </header>

    <SayaSubNav :location-slug="slug" active="contact" :review-count="location?.review_count" />

    <div v-if="pending" class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <USkeleton class="h-64 rounded-2xl" />
    </div>

    <template v-else-if="location">
      <!-- Map -->
      <div class="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
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
            <span class="text-sm text-muted">Map synced from Google Business</span>
          </div>
        </div>
      </div>

      <!-- Info grid -->
      <section class="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:grid-cols-2 lg:grid-cols-3 lg:px-8">
        <!-- Address -->
        <div>
          <p class="saya-eyebrow mb-4 text-muted">Address</p>
          <p class="text-sm leading-relaxed text-default">{{ formattedAddress || 'Contact us for address' }}</p>
          <a
            v-if="location.maps_url"
            :href="location.maps_url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-3 inline-block text-xs uppercase tracking-widest text-primary no-underline transition hover:opacity-70"
          >
            Open in Google Maps →
          </a>
        </div>

        <!-- Hours -->
        <div>
          <p class="saya-eyebrow mb-4 text-muted">Opening hours</p>
          <div v-if="weekHours.length" class="space-y-1.5">
            <div
              v-for="day in weekHours"
              :key="day.day"
              class="flex justify-between gap-4 text-sm"
              :class="day.today ? 'font-semibold text-default' : 'text-muted'"
            >
              <span>{{ day.day }}</span>
              <span>{{ day.hours }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-muted">Contact us for current hours.</p>
        </div>

        <!-- Contact -->
        <div>
          <p class="saya-eyebrow mb-4 text-muted">Contact</p>
          <div class="space-y-3 text-sm">
            <div v-if="location.phone" class="flex items-start gap-3">
              <UIcon name="i-heroicons-phone" class="mt-0.5 size-4 shrink-0 text-muted" />
              <a :href="`tel:${location.phone}`" class="text-default no-underline hover:underline">{{ location.phone }}</a>
            </div>
            <div v-if="location.email" class="flex items-start gap-3">
              <UIcon name="i-heroicons-envelope" class="mt-0.5 size-4 shrink-0 text-muted" />
              <a :href="`mailto:${location.email}`" class="text-default no-underline hover:underline">{{ location.email }}</a>
            </div>
            <div v-if="location.website_url" class="flex items-start gap-3">
              <UIcon name="i-heroicons-globe-alt" class="mt-0.5 size-4 shrink-0 text-muted" />
              <a :href="location.website_url" target="_blank" rel="noopener noreferrer" class="text-default no-underline hover:underline">Website</a>
            </div>
          </div>

          <div class="mt-8 flex flex-wrap gap-3">
            <UButton to="/reservations" color="primary" variant="solid" size="sm" class="rounded-full">Reserve a table</UButton>
            <UButton
              v-if="location.maps_url"
              :to="location.maps_url"
              target="_blank"
              color="neutral"
              variant="outline"
              size="sm"
              class="rounded-full"
            >
              Directions
            </UButton>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-contact-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (data as any).value?.location ?? null)

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
  return formatGoogleHours(hours).map((h: any, i: number) => ({ ...h, today: days[i] === today }))
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
  { label: location.value?.title || slug.value, to: `/locations/${slug.value}` },
  { label: 'Visit' }
])

useSeoMeta({
  title: () => `Visit · ${location.value?.title || slug.value}`,
  description: () => `Hours, address and directions for ${location.value?.title}.`,
  ogUrl: () => `/locations/${slug.value}/contact`
})

useSchemaOrg([
  computed(() => {
    const loc = location.value
    if (!loc) return {}
    const schemaHours = weekHours.value.map((h: any) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${h.day}`,
      opens: h.hours?.split('–')[0]?.trim() || '',
      closes: h.hours?.split('–')[1]?.trim() || ''
    })).filter((h: any) => h.opens)
    return {
      '@type': ['LocalBusiness', 'Restaurant'],
      name: `${siteName.value} — ${loc.title}`,
      address: { '@type': 'PostalAddress', streetAddress: formattedAddress.value },
      telephone: loc.phone,
      email: loc.email,
      hasMap: loc.maps_url,
      openingHoursSpecification: schemaHours,
      ...(loc.latitude && loc.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude } } : {})
    }
  }),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: '/locations' },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Visit', item: `/locations/${slug.value}/contact` }
    ]
  }))
])
</script>
