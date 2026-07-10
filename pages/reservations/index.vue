<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto flex max-w-7xl flex-col items-center px-4 pt-16 pb-14 text-center sm:px-6 lg:px-8 lg:pt-20 lg:pb-18">
      <p class="saya-kicker mb-6 inline-flex items-center justify-center rounded-full border border-default/10 bg-default/3 px-5 py-2 text-center">
        {{ resCopy.reservationPageKicker }}
      </p>
      <h1 class="saya-display-md max-w-5xl text-default">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="formatTitleItalics(getField('hero.title', 'Save yourself *a seat.*'))" />
      </h1>
      <p v-if="heroSubtitle" class="mt-5 max-w-3xl text-balance text-sm leading-relaxed text-muted sm:text-base">
        {{ heroSubtitle }}
      </p>
      
    </header>

    <!-- Location cards -->
    <section v-if="locations.length > 0" class="mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
      <div class="grid gap-8 grid-cols-1 sm:grid-cols-2">
        <article
          v-for="loc in locations"
          :key="loc.id"
          class="overflow-hidden border border-default bg-default"
        >
          <div class="relative aspect-video bg-muted">
            <video
              v-if="getLocationMediaUrl(loc) && getLocationMediaKind(loc) === 'video'"
              :src="getLocationMediaUrl(loc) ?? undefined"
              :poster="getLocationPoster(loc) ?? undefined"
              autoplay
              muted
              loop
              playsinline
              preload="metadata"
              class="h-full w-full object-cover"
            />
            <img
              v-else-if="getLocationMediaUrl(loc)"
              :src="getLocationMediaUrl(loc) ?? undefined"
              :alt="loc.title"
              loading="lazy"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full w-full items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="size-10 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g><path d="M15 10.5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0"/></g></svg>
            </div>
            <ClientOnly>
              <div
                v-if="getTodayHoursLabel(loc.opening_hours, resCopy.closedLabel, loc.timezone)"
                class="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-default/95 px-4 py-2 text-xs font-medium uppercase tracking-wide text-default"
              >
                <span class="size-1.5 rounded-full" :class="isOpenNow(loc.opening_hours, loc.timezone) ? 'bg-green-500' : 'bg-zinc-400'" />
                {{ isOpenNow(loc.opening_hours, loc.timezone) ? resCopy.openNowLabel : resCopy.closedLabel }} · {{ getTodayHoursLabel(loc.opening_hours, resCopy.closedLabel, loc.timezone) }}
              </div>
            </ClientOnly>
          </div>

          <div class="flex flex-col items-start p-6 text-left sm:p-8">
            <p v-if="getLocationLabel(loc)" class="saya-eyebrow mb-3 text-muted">{{ getLocationLabel(loc) }}</p>
            <h3 class="saya-display saya-italic text-3xl text-default leading-none sm:text-4xl">{{ loc.title }}</h3>
            <p v-if="loc.short_description" class="mt-3 max-w-md text-sm leading-relaxed text-muted">{{ loc.short_description }}</p>

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <SayaButton @click="openBookingModal(loc)">{{ resCopy.reservationRequestButton }}</SayaButton>
              <SayaButton v-if="loc.phone" :href="`tel:${loc.phone.replace(/\s/g, '')}`" variant="outline">
                {{ loc.phone }}
              </SayaButton>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="activeReservationPolicySummary" class="bg-muted">
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div class="mb-10 max-w-xl">
            <p class="saya-kicker mb-4">{{ resCopy.goodToKnowKicker }}</p>
            <h2 class="saya-display-sm text-default">{{ activeReservationPolicySummary.heading }}</h2>
          </div>
          <div v-if="activeReservationPolicySummary.items.length > 0" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div v-for="item in activeReservationPolicySummary.items" :key="item.id" class="border-t border-default pt-5">
              <p class="text-sm leading-relaxed text-muted">{{ item.text }}</p>
            </div>
          </div>
          <div
            v-if="activeReservationPolicySummary.additional_notes_html"
            class="mt-8 max-w-2xl text-sm leading-relaxed text-muted"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="activeReservationPolicySummary.additional_notes_html" />
          </div>
        </div>
      </section>

    <!-- Booking Modal Flow -->
    <BookingModal
      v-model="isBookingModalOpen"
      :title="modalTitle"
      :can-go-back="bookingStep > startStep && !submitting"
      @back="prevStep"
    >
      <!-- STEP: LOCATION (only if multiple locations and not pre-selected from a card) -->
      <div v-if="bookingStep === 1" class="flex-1 overflow-y-auto">
        <BookingLocationStep
          v-model="reservationForm.location_id"
          :locations="locations"
          @next="nextStep"
        />

        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>

      <!-- STEP: TIME (party size + day-grouped availability, single scrollable surface) -->
      <div v-if="bookingStep === 2" class="flex flex-1 flex-col min-h-0">
        <BookingTimeStep
          v-model="timeSelection"
          :dates="availabilityDates"
          :loading="availabilityLoading"
          :guests="guests"
          :guests-label="resCopy.guestsLabel"
          :guest-singular="resCopy.guestLabel"
          :guest-plural="resCopy.guestsLabelPlural"
          @update:guests="guests = $event"
          @next="nextStep"
        />
        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>

      <!-- STEP: CONTACT -->
      <div v-if="bookingStep === 3" class="flex-1 overflow-y-auto">
        <BookingRecap
          v-if="timeSelection"
          :main-line="`${timeSelection.label.split(',')[0]} · ${fmt12Hour(timeSelection.time)}`"
          :meta-line="`${guests >= 8 ? '8+' : guests} ${guests === 1 ? resCopy.guestLabel : resCopy.guestsLabelPlural}`"
          @edit="bookingStep = 2"
        />
        <BookingContactForm
          :initial-state="{ name: reservationForm.name, email: reservationForm.email, phone: reservationForm.phone, notes: reservationForm.requests }"
          :loading="submitting"
          :submit-text="resCopy.reservationRequestButton"
          phone-required
          @submit="handleContactSubmit"
        />
        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>
    </BookingModal>
  </div>
</template>

<script setup lang="ts">
import BookingContactForm from '@/components/booking/BookingContactForm.vue'
import BookingLocationStep from '@/components/booking/BookingLocationStep.vue'
import BookingModal from '@/components/booking/BookingModal.vue'
import BookingRecap from '@/components/booking/BookingRecap.vue'
import BookingTimeStep, { type RawDateAvailability, type TimeSlotSelection } from '@/components/booking/BookingTimeStep.vue'
import { usePageContent } from '~/composables/usePageContent'
import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'
import { fmt12Hour, getTodayHoursLabel, isOpenNow } from '~/shared/reservation-hours'
import { setBookingConfirmation } from '~/composables/useBookingHandoff'

function formatTitleItalics(text: string | null | undefined): string {
  if (!text) return ''
  // If there are no asterisks, fallback to italicizing the whole thing
  if (!text.includes('*')) return `<em class="saya-italic">${text}</em>`
  return text.replace(/\*(.*?)\*/g, '<em class="saya-italic">$1</em>')
}

definePageMeta({ layout: 'saya' })

const { getField } = usePageContent('reservations')
const { site, siteId } = useTenantSite()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
const { locations, config, reservationPolicySiteDefault, reservationPolicyByLocation } = useBootstrap()
const isExperienceSite = computed(() => (site as { vertical?: string | null } | null)?.vertical === 'experience')

// Pure experience-vertical sites book per-experience on /experiences/[slug].
// The /reservations page has no meaning for them. Redirect as soon as the
// site vertical is known — do NOT gate on hasExperiences, because a freshly
// seeded site with vertical='experience' and no experiences yet should still
// not show this page.
watch(isExperienceSite, (isExp) => {
  if (isExp) {
    navigateTo('/experiences', { replace: true, redirectCode: 302 })
  }
}, { immediate: true })

// Belt-and-suspenders: prevent this page from being indexed on experience sites
// while the async bootstrap resolves on the client (server redirect above already
// handles SSR, but client-side navigation hydration can briefly render the page).
useSeoMeta({
  robots: computed(() => isExperienceSite.value ? 'noindex,follow' : 'index,follow')
})

const activeReservationPolicySummary = computed(() => {
  const locationId = selectedLocation.value?.id ? String(selectedLocation.value.id) : null
  if (locationId && reservationPolicyByLocation.value[locationId]) {
    return reservationPolicyByLocation.value[locationId]
  }
  return reservationPolicySiteDefault.value
})

// ── Form state ────────────────────────────────────────────────────────────
const reservationForm = ref({ name: '', email: '', phone: '', location_id: '', date: '', time: '', guests: '', requests: '' })

// ── Contact & Locations ───────────────────────────────────────────────────
const hasMultipleLocations = computed(() => locations.value.length > 1)
const selectedLocation = computed(() =>
  locations.value.find(location => String(location.id ?? '') === reservationForm.value.location_id)
  ?? locations.value.find(location => Boolean(location.is_primary))
  ?? locations.value[0]
  ?? null,
)

function formatLocationAddress(address: unknown): string | null {
  if (!address) return null
  if (typeof address === 'string') return address
  const addr = address as { addressLines?: string[]; locality?: string; administrativeArea?: string }
  const parts = [...(addr.addressLines ?? []), addr.locality, addr.administrativeArea].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function getLocationLabel(location: ApiRecord): string | null {
  return String(
    location.neighborhood
    ?? location.city
    ?? '',
  ) || null
}

function getLocationMediaKind(location: ApiRecord): 'image' | 'video' | null {
  if (location.kind === 'video' || location.hero_video_public_url) return 'video'
  if (location.kind === 'image' || location.hero_image_public_url || location.public_url || location.thumbnail_url) return 'image'
  return null
}

function getLocationMediaUrl(location: ApiRecord): string | null {
  const kind = getLocationMediaKind(location)
  if (kind === 'video') return String(location.hero_video_public_url ?? location.public_url ?? '') || null
  return String(location.hero_image_public_url ?? location.public_url ?? location.thumbnail_url ?? '') || null
}

function getLocationPoster(location: ApiRecord): string | null {
  return String(location.thumbnail_url ?? location.hero_image_public_url ?? '') || null
}

const heroSubtitle = computed(() => {
  const customSubtitle = String(getField('hero.subtitle', '') ?? '').trim()
  if (customSubtitle) return customSubtitle

  const count = locations.value.length
  const brand = brandName.value

  if (count <= 0) return `Plan your visit with ${brand}.`
  if (count === 1) return `${brand} has one location ready for you.`
  if (count === 2) return `${brand} has 2 locations. Pick yours below.`
  return `${brand} has ${count} locations. Pick yours below.`
})

watch(
  locations,
  (nextLocations) => {
    if (reservationForm.value.location_id || nextLocations.length === 0) return
    const primary = nextLocations.find(location => Boolean(location.is_primary)) ?? nextLocations[0]
    reservationForm.value.location_id = String(primary?.id ?? '')
  },
  { immediate: true },
)

const contactPhone = computed(() =>
  String(
    selectedLocation.value?.phone
    ?? getField('contact.phone', config.value.contact_phone || '')
    ?? '',
  ),
)
const contactEmail = computed(() =>
  String(
    selectedLocation.value?.email
    ?? getField('contact.email', config.value.contact_email || '')
    ?? '',
  ),
)

// ── Modal State ───────────────────────────────────────────────────────────
const isBookingModalOpen = ref(false)
// Skipped when opened from a location card (location is already pre-selected)
// or when the site only has one location to begin with.
const skipLocationStep = ref(false)
const startStep = computed(() => (hasMultipleLocations.value && !skipLocationStep.value) ? 1 : 2)
const bookingStep = ref(startStep.value)
const modalTitle = computed(() => {
  if (bookingStep.value === 1) return resCopy.value.selectLocationLabel
  if (bookingStep.value === 2) return resCopy.value.selectTimeLabel
  return 'Your details'
})

function openBookingModal(loc?: ApiRecord) {
  skipLocationStep.value = Boolean(loc)
  if (loc) reservationForm.value.location_id = String(loc.id ?? '')
  bookingStep.value = startStep.value
  isBookingModalOpen.value = true
}

function nextStep() {
  submitError.value = null
  bookingStep.value++
}

function prevStep() {
  submitError.value = null
  if (bookingStep.value > startStep.value) {
    bookingStep.value--
  } else {
    isBookingModalOpen.value = false
  }
}

// ── Guests & time slot ────────────────────────────────────────────────────
const guests = ref(2)
const timeSelection = ref<TimeSlotSelection | null>(null)

// ── Availability (day-grouped, capacity-aware — server/utils/reservations.ts) ──
const availabilityDates = ref<RawDateAvailability[]>([])
const availabilityLoading = ref(false)

let availabilityRequestId = 0

async function loadAvailability() {
  if (!siteId || !reservationForm.value.location_id) {
    availabilityDates.value = []
    return
  }
  const requestId = ++availabilityRequestId
  const locationId = reservationForm.value.location_id
  availabilityLoading.value = true
  try {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const res = await $fetch<{ dates: RawDateAvailability[] }>(`/api/public/sites/${siteId}/reservations/availability`, {
      query: { location_id: locationId, date: dateStr, days: 14 },
    })
    // Ignore stale responses from a location that was changed away from before this resolved
    if (requestId !== availabilityRequestId || locationId !== reservationForm.value.location_id) return
    availabilityDates.value = res.dates ?? []
  } catch {
    if (requestId !== availabilityRequestId || locationId !== reservationForm.value.location_id) return
    availabilityDates.value = []
  } finally {
    if (requestId === availabilityRequestId) availabilityLoading.value = false
  }
}

watch(() => reservationForm.value.location_id, (id) => {
  if (id) {
    timeSelection.value = null
    loadAvailability()
  }
}, { immediate: true })

// ── Submission ────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref<string | null>(null)

async function handleContactSubmit(contactState: { name: string, email: string, phone?: string, notes?: string }) {
  reservationForm.value.name = contactState.name
  reservationForm.value.email = contactState.email
  reservationForm.value.phone = contactState.phone ?? ''
  reservationForm.value.requests = contactState.notes ?? ''

  await handleReservation()
}

async function handleReservation() {
  if (submitting.value || !siteId || !timeSelection.value) return
  reservationForm.value.date = timeSelection.value.day
  reservationForm.value.time = timeSelection.value.time
  reservationForm.value.guests = guests.value >= 8 ? '8+' : String(guests.value)

  submitting.value = true
  submitError.value = null
  try {
    const res = await $fetch<{ id: string; cancellationToken: string; policy_summary?: ApiRecord | null }>(`/api/public/sites/${siteId}/reservations`, {
      method: 'POST',
      body: reservationForm.value,
    })
    setBookingConfirmation({
      type: 'reservation',
      siteId,
      siteName: brandName.value,
      guestName: reservationForm.value.name,
      date: reservationForm.value.date,
      time: reservationForm.value.time,
      guests: reservationForm.value.guests,
      requests: reservationForm.value.requests || null,
      cancelUrl: res?.id && res?.cancellationToken ? `/reservations/cancel?id=${res.id}#${res.cancellationToken}` : null,
      contactPhone: contactPhone.value || null,
      contactEmail: contactEmail.value || null,
      sitePolicySummary: res.policy_summary ?? null,
      locationId: selectedLocation.value?.id ? String(selectedLocation.value.id) : null,
      locationName: selectedLocation.value?.title ?? null,
      locationAddress: formatLocationAddress(selectedLocation.value?.address),
      locationSlug: typeof selectedLocation.value?.slug === 'string' ? selectedLocation.value.slug : null,
    })
    await navigateTo('/reservations/confirmed')
  } catch (err) {
    const error = err as { data?: { error?: string }; status?: number }
    if (error.status === 409) {
      // Conflict (slot filled or capacity exceeded) — revert to time selection and reload availability
      bookingStep.value = 2
      timeSelection.value = null
      submitError.value = error.data?.error || 'This time is no longer available. Please select another.'
      await loadAvailability()
    } else {
      submitError.value = error.data?.error ?? 'Failed to submit. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

// ── SEO ───────────────────────────────────────────────────────────────────
const currentPageUrl = useSeoUrl('/reservations')
const requestUrl = useRequestURL()

useBreadcrumbSchema([
  { name: 'Home', url: `/` },
  { name: 'Reservations', url: `/reservations` }
])

const brandName = computed(() => (site as ApiValue)?.brand_name || (site as ApiValue)?.title || 'Our Site')
const seoTitle = computed(() => `${brandName.value} | ${resCopy.value.reserveCta}`)
const seoDescription = computed(() => resCopy.value.seoReservationDescription(brandName.value))
useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: computed(() => brandName.value),
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl,
  ogType: 'website'
})

useSchemaOrg([
  ({
    '@context': 'https://schema.org',
    '@type': getBusinessSchemaTypes((site as ApiValue)?.vertical),
    name: (site as ApiValue)?.brand_name || (site as ApiValue)?.title || 'Our Site',
    url: requestUrl.origin,
    reservationUrl: `${requestUrl.origin}/reservations`,
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${requestUrl.origin}/reservations` },
      result: { '@type': 'Reservation' }
    }
  })
])
</script>
