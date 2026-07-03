<template>
  <div class="min-h-screen bg-default text-default">

    <template v-if="pending">
      <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div class="h-64 animate-pulse rounded-2xl bg-elevated" />
      </div>
    </template>

    <template v-else-if="location">
      <SayaSubNav :location-slug="slug" active="contact" />

      <!-- Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← {{ t('saya.location.back_to', { title: location.title }) }}
        </NuxtLink>
        <h1 class="saya-display-md text-default mt-6">
          <em class="saya-italic">{{ t('saya.location.plan_a_visit') }}</em>
        </h1>
        <p v-if="location.short_description" class="mt-4 text-sm text-muted">{{ location.short_description }}</p>
      </header>

      <!-- Two-column cards: Hours | Address + Map -->
      <div class="mx-auto grid max-w-7xl gap-6 px-4 pb-6 sm:px-6 lg:grid-cols-2 lg:px-8">

        <!-- HOURS CARD -->
        <section class="border border-default bg-default p-9">
          <p class="saya-eyebrow mb-4 text-muted">{{ t('saya.location.hours') }}</p>
          <h2 class="saya-display saya-italic flex flex-wrap items-center gap-3 text-3xl text-default leading-none">
            <span :class="isOpenNow === true ? 'size-2.5 rounded-full bg-green-400' : 'size-2.5 rounded-full bg-zinc-400'" />
            {{ isOpenNow === true ? t('saya.location.open_now') : isOpenNow === false ? t('saya.location.closed') : t('saya.location.hours') }}
            <span v-if="todayHours" class="text-base font-normal not-italic tracking-normal text-muted">· {{ todayHours }}</span>
          </h2>

          <table class="mt-8 w-full border-collapse">
            <tbody>
              <tr
                v-for="day in weekHours"
                :key="day.day"
                :class="day.today ? 'font-semibold' : ''"
              >
                <td class="border-b border-default py-3 text-sm" :class="day.today ? 'text-default' : 'text-muted'">
                  <span class="flex items-center gap-2">
                    {{ day.day }}
                    <span v-if="day.today" class="rounded-full bg-inverted px-2 py-0.5 text-[9px] uppercase tracking-widest text-inverted">{{ t('saya.location.today') }}</span>
                  </span>
                </td>
                <td class="border-b border-default py-3 text-right text-sm tabular-nums" :class="day.today ? 'text-default' : 'text-muted'">{{ day.hours }}</td>
              </tr>
              <tr v-if="!weekHours.length">
                <td colspan="2" class="py-4 text-sm text-muted">
                  {{ t('saya.location.contact_us_for_hours') }}
                  <a v-if="location.phone" :href="`tel:${location.phone}`" class="ml-2 text-default underline-offset-2 hover:underline">{{ location.phone }}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ADDRESS + MAP CARD -->
        <section class="border border-default bg-default p-9">
          <p class="saya-eyebrow mb-4 text-muted">{{ t('saya.location.find_us') }}</p>
          <h2 class="saya-display saya-italic text-3xl text-default leading-none">{{ location.neighborhood || location.city || location.title }}</h2>

          <!-- Map embed (16/10) -->
          <div class="mt-7 aspect-[16/10] overflow-hidden border border-default bg-muted">
            <iframe
              v-if="mapEmbedSrc"
              :src="mapEmbedSrc"
              :title="location.title ? t('saya.location.map_for', { title: location.title }) : t('saya.location.location_map')"
              width="100%"
              height="100%"
              style="border:0;filter:grayscale(0.12)"
              allowfullscreen
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            />
            <div v-else class="flex h-full w-full flex-col items-center justify-center gap-3">
              <SayaIcon name="map-pin" class="size-8 text-muted" />
              <span class="text-sm text-muted">{{ t('saya.location.map_synced') }}</span>
            </div>
          </div>

          <!-- Address -->
          <p class="mt-6 text-sm leading-relaxed text-default">{{ formattedAddress }}</p>

          <!-- Directions buttons -->
          <div class="mt-4 flex flex-wrap gap-2">
            <a
              v-if="location.maps_url"
              :href="location.maps_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-full bg-inverted px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-inverted no-underline transition hover:opacity-80"
            >
              <SayaIcon name="map-pin" class="size-3.5" />
              {{ t('saya.location.get_directions') }}
            </a>
            <a
              v-if="location.maps_url"
              :href="`https://maps.apple.com/?q=${encodeURIComponent(formattedAddress)}`"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center rounded-full border border-default px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
            >
              {{ t('saya.location.apple_maps') }}
            </a>
          </div>

          <!-- Phone + email -->
          <div v-if="location.phone || location.email" class="mt-7 grid grid-cols-2 gap-6 border-t border-default pt-7">
            <div v-if="location.phone">
              <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.location.phone') }}</p>
              <a :href="`tel:${location.phone}`" class="border-b border-default pb-0.5 text-sm text-default no-underline hover:opacity-70">{{ location.phone }}</a>
            </div>
            <div v-if="location.email">
              <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.location.email') }}</p>
              <a :href="`mailto:${location.email}`" class="border-b border-default pb-0.5 text-sm text-default no-underline hover:opacity-70 break-all">{{ location.email }}</a>
            </div>
          </div>
        </section>
      </div>

      <!-- Good to know (parking.info + extra.notes from CMS) -->
      <section v-if="sanitizedParkingInfo || sanitizedExtraNotes" class="mt-16 bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div class="mb-12 max-w-2xl">
            <p class="saya-kicker mb-6">{{ t('saya.location.good_to_know') }}</p>
            <h2 class="saya-display-md text-default">{{ t('saya.location.before_you_come') }}</h2>
          </div>
          <div class="grid gap-6 sm:grid-cols-2">
            <!-- eslint-disable vue/no-v-html -->
            <div v-if="sanitizedParkingInfo" class="border border-default bg-default p-8">
              <p class="saya-eyebrow mb-4 text-muted">{{ t('saya.location.parking') }}</p>
              <div class="prose prose-sm max-w-none text-default" v-html="sanitizedParkingInfo" />
            </div>
            <div v-if="sanitizedExtraNotes" class="border border-default bg-default p-8">
              <p class="saya-eyebrow mb-4 text-muted">{{ t('saya.location.additional_notes') }}</p>
              <div class="prose prose-sm max-w-none text-default" v-html="sanitizedExtraNotes" />
            </div>
            <!-- eslint-enable vue/no-v-html -->
          </div>
        </div>
      </section>

      <!-- CTA strip -->
      <section class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-24 sm:px-6 lg:px-8">
        <h3 class="saya-display-md saya-italic text-default">{{ t('saya.location.see_you_soon') }}</h3>
        <div class="flex flex-wrap gap-3">
          <SayaButton :to="locationCopy.ctaRoute" size="lg">{{ locationCopy.reserveCta }}</SayaButton>
          <a
            v-if="location.phone"
            :href="`tel:${location.phone}`"
            class="inline-flex items-center rounded-full border border-default px-6 py-2.5 text-xs font-medium uppercase tracking-widest text-default no-underline transition hover:bg-muted"
          >
            {{ t('saya.location.call_us') }}
          </a>
        </div>
      </section>
    </template>

    <div v-else class="mx-auto max-w-xl px-4 py-24 text-center">
      <SayaIcon name="map-pin" class="mx-auto mb-4 size-12 text-muted" />
      <h1 class="saya-display-sm text-default">{{ t('saya.location.not_found') }}</h1>
      <SayaButton to="/locations" class="mt-8">{{ t('saya.location.view_all_locations') }}</SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatGoogleHours, getTodayGoogleHours } from '~/utils/formatters'
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s: string) => s }

definePageMeta({ layout: 'saya' })

const { t } = useI18n()

const route = useRoute()
const { siteId, site } = useTenantSite()
const { locale } = useI18n()
const locationCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))

// Bootstrap: location data + page content (parking/notes) — 1 SSR call
const { location, getField: getContentField, pending } = useBootstrap()

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
  const timezone = location.value?.time_zone || location.value?.timezone || null
  let today = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()]
  if (timezone) {
    try {
      today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(new Date()).toUpperCase()
    } catch { /* fallback to local */ }
  }
  return formatGoogleHours(hours).map((h: ApiValue, i: number) => ({ ...h, today: days[i] === today }))
})

const todayHours = computed(() => {
  const timezone = location.value?.time_zone || location.value?.timezone || null
  let today = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()]
  if (timezone) {
    try {
      today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(new Date()).toUpperCase()
    } catch { /* fallback to local */ }
  }
  return getTodayGoogleHours(location.value?.opening_hours, today)
})
const isOpenNow = computed(() => {
  const h = todayHours.value
  if (!h) return undefined
  const lower = h.toLowerCase()
  if (lower.includes('open today') && !lower.includes('closed today')) return true
  if (lower.includes('closed today')) return false
  return undefined
})

const mapEmbedSrc = computed(() => (location.value as ApiValue)?.map_embed_url || null)

const parkingInfo = computed(() => getContentField('parking.info', '') ?? '')
const extraNotes = computed(() => getContentField('extra.notes', '') ?? '')
const sanitizedParkingInfo = computed(() => DOMPurify.sanitize(parkingInfo.value))
const sanitizedExtraNotes = computed(() => DOMPurify.sanitize(extraNotes.value))

const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')

const seoTitle = () => `Plan a visit · ${location.value?.title || slug.value}`
const seoDescription = () => `Hours, address and directions for ${location.value?.title || slug.value}.`

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogImage: useSharedOgImage(),
  ogUrl: useSeoUrl(() => `/locations/${slug.value}/contact`)
})

useSchemaOrg([
  computed(() => {
    const loc = location.value
    if (!loc) return {}
    const schemaHours = weekHours.value.map((h: ApiValue) => {
      if (!h.hours || typeof h.hours !== 'string' || !h.hours.includes('–')) return null
      if (h.hours.toLowerCase() === 'closed') return null
      const parts = h.hours.split('–')
      if (parts.length !== 2) return null
      const opens = parts[0]?.trim()
      const closes = parts[1]?.trim()
      if (!opens || !closes) return null
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${h.day}`, opens, closes }
    }).filter((h: ApiValue) => h && h.opens)
    return {
      '@type': getBusinessSchemaTypes((site as ApiValue)?.vertical),
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
