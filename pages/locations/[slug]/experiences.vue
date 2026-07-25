<template>
  <div class="min-h-screen bg-default text-default">
    <template v-if="pending">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <div class="h-3 w-32 animate-pulse rounded bg-muted" />
          <div class="mt-5 h-12 w-2/3 animate-pulse rounded bg-muted" />
          <div class="mt-5 h-4 w-full animate-pulse rounded bg-muted" />
        </div>
        <SayaExperienceGrid
          :experiences="[]"
          pending
          :empty-label="expCopy.noExperiencesLabel"
          :view-experience-cta="expCopy.viewExperienceCta"
          :guests-max-label="expCopy.guestsMaxLabel"
          :sold-out-label="expCopy.soldOutLabel"
          :temporarily-unavailable-label="expCopy.temporarilyUnavailableLabel"
          :fully-booked-label="expCopy.fullyBookedLabel"
          :not-scheduled-label="expCopy.notScheduledLabel"
          :duration-hour-label="expCopy.durationHourLabel"
          :duration-minute-label="expCopy.durationMinuteLabel"
        />
      </div>
    </template>

    <template v-else-if="location">
      <SayaSubNav :location-slug="slug" active="experiences" />

      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-4">{{ location.title }}</p>
          <h1 class="saya-display-md text-default">{{ expCopy.experiencesPageTitle }}</h1>
          <p v-if="heroSubtitle" class="mt-5 text-base leading-relaxed text-muted">
            {{ heroSubtitle }}
          </p>
        </div>

        <SayaExperienceGrid
          :experiences="experiences"
          :empty-label="expCopy.noExperiencesLabel"
          :view-experience-cta="expCopy.viewExperienceCta"
          :guests-max-label="expCopy.guestsMaxLabel"
          :sold-out-label="expCopy.soldOutLabel"
          :temporarily-unavailable-label="expCopy.temporarilyUnavailableLabel"
          :fully-booked-label="expCopy.fullyBookedLabel"
          :not-scheduled-label="expCopy.notScheduledLabel"
          :duration-hour-label="expCopy.durationHourLabel"
          :duration-minute-label="expCopy.durationMinuteLabel"
        />
      </div>
    </template>

    <div v-else class="mx-auto max-w-xl px-4 py-24 text-center">
      <SayaIcon name="map-pin" class="mx-auto mb-4 size-12 text-muted" />
      <h1 class="saya-display-sm text-default">{{ t('saya.location.not_found') }}</h1>
      <SayaButton to="/locations" class="mt-8">{{ t('saya.location.view_all_locations') }}</SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Experience } from '~/server/utils/experiences'

definePageMeta({ layout: 'saya' })

const route = useRoute()
const { isPlatform, site } = useTenantSite()
if (isPlatform) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const { locale, t } = useI18n()
const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')
const expCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))

const {
  location,
  experiencesList,
  pending: bootstrapPending,
  config,
} = await useBootstrap()

const pending = computed(() => bootstrapPending.value)
const experiences = computed<Experience[]>(() => experiencesList.value)
const heroSubtitle = computed(() =>
  location.value
    ? expCopy.value.seoExperiencesDescription(location.value.title || siteName.value)
    : expCopy.value.experiencesPageSubtitle,
)

const requestURL = useRequestURL()
useSchemaOrg(computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: new URL('/', requestURL.origin).toString() },
    { '@type': 'ListItem', position: 2, name: 'Locations', item: new URL('/locations', requestURL.origin).toString() },
    {
      '@type': 'ListItem',
      position: 3,
      name: location.value?.title || slug.value,
      item: new URL(`/locations/${slug.value}`, requestURL.origin).toString(),
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: 'Experiences',
      item: new URL(`/locations/${slug.value}/experiences`, requestURL.origin).toString(),
    },
  ],
})))

useTenantSocialMetadata(() => ({
  path: `/locations/${slug.value}/experiences`,
  title: location.value
    ? `${expCopy.value.experiencesPageTitle} at ${location.value.title} | ${siteName.value}`
    : `${expCopy.value.experiencesPageTitle} | ${siteName.value}`,
  description: location.value
    ? expCopy.value.seoExperiencesDescription(location.value.title || siteName.value)
    : expCopy.value.seoExperiencesDescription(siteName.value),
  label: 'Experiences',
  location: location.value?.title || null,
  brand: {
    siteName: siteName.value,
    logoUrl: config.value?.logo_url || null,
    faviconUrl: config.value?.favicon_url || null,
    primaryColor: config.value?.brand_color || null,
  },
  heroImage: experiences.value[0]?.image_url ? { url: experiences.value[0].image_url } : null,
}))
</script>
