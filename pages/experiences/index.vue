<template>
  <NuxtLayout name="saya">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">

      <!-- Header -->
      <div class="mb-16 max-w-2xl">
        <p class="saya-kicker mb-4">{{ heroKicker }}</p>
        <h1 class="saya-display-md text-default">{{ heroTitle }}</h1>
        <p v-if="heroSubtitle" class="mt-5 text-base leading-relaxed text-muted">
          {{ heroSubtitle }}
        </p>
      </div>

      <SayaExperienceGrid
        :experiences="experiences"
        :pending="pending"
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
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { Experience } from '~/server/utils/experiences'

const { isPlatform, site } = useTenantSite()
if (isPlatform) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const siteName = computed(() => String((site as ApiValue)?.brand_name ?? '').trim())
const { locale } = useI18n()
const expCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))

const { experiencesList, pending: pagePending, getField } = await usePublicPageData()

const pending = computed(() => pagePending.value)
const experiences = computed<Experience[]>(() => experiencesList.value)

const heroKicker = computed(() => getField('hero.kicker', 'Experiences') || 'Experiences')
const heroTitle = computed(() => getField('hero.title', expCopy.value.experiencesPageTitle) || expCopy.value.experiencesPageTitle)
const heroSubtitle = computed(() => getField('hero.subtitle', expCopy.value.experiencesPageSubtitle) || expCopy.value.experiencesPageSubtitle)

useBreadcrumbSchema([
  { name: 'Home', url: '/' },
  { name: 'Experiences', url: '/experiences' },
])

useSocialMetadata(() => ({
  path: '/experiences',
  title: `Experiences | ${siteName.value}`,
  description: expCopy.value.seoExperiencesDescription(siteName.value),
  brand: {
    siteName: siteName.value,
  },
}))

</script>
