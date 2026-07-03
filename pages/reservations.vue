<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ resCopy.reservationPageKicker }}</p>
      <h1 class="saya-display-md text-default">
        <em class="saya-italic">{{ getField('hero.title', resCopy.reserveCta) }}</em>
      </h1>
      <p v-if="getField('hero.subtitle')" class="mt-5 max-w-xl text-sm leading-relaxed text-muted">{{ getField('hero.subtitle') }}</p>
      
      <!-- Desktop Make a Reservation Button -->
      <div class="mt-8 hidden lg:block">
        <SayaButton size="lg" @click="openBookingModal">
          {{ resCopy.reservationRequestButton }}
        </SayaButton>
      </div>
    </header>

    <!-- Mobile Make a Reservation sticky bottom bar -->
    <div class="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-between gap-4 border-t border-default bg-default/95 backdrop-blur-sm px-5 py-4 shadow-lg">
      <div class="min-w-0">
        <p class="font-semibold text-default leading-tight">{{ resCopy.reservationFormTitle }}</p>
      </div>
      <SayaButton class="shrink-0" @click="openBookingModal">
        {{ resCopy.reservationRequestButton }}
      </SayaButton>
    </div>

    <div class="mx-auto max-w-6xl px-4 pb-28 lg:pb-24">
      <div class="grid gap-12 md:grid-cols-2">

        <!-- Sidebar / Info -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">{{ resCopy.reservationFormTitle }} Details</h2>

          <div class="mb-6 rounded-2xl bg-muted p-6">
            <h3 class="mb-4 text-lg font-semibold text-default">{{ resCopy.contactInfoHeading }}</h3>
            <p v-if="selectedLocation" class="mb-3 text-sm text-muted">{{ selectedLocation.title }}</p>
            <div class="space-y-2">
              <p v-if="contactPhone" class="text-muted"><strong class="text-default">{{ resCopy.phoneLabelShort }}:</strong> {{ contactPhone }}</p>
              <p v-if="contactEmail" class="text-muted"><strong class="text-default">{{ resCopy.emailLabelShort }}:</strong> {{ contactEmail }}</p>
            </div>
          </div>

          <div class="mb-6 rounded-2xl bg-muted p-6">
            <h3 class="mb-4 text-lg font-semibold text-default">{{ resCopy.reservationPoliciesHeading }}</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="policiesBody" class="text-muted" />
          </div>

          <div class="space-y-4">
            <SayaButton v-if="contactPhone" :href="`tel:${contactPhone?.replace(/\s/g, '') ?? ''}`" variant="outline" block>
              {{ resCopy.callButtonLabel }} {{ contactPhone }}
            </SayaButton>
            <SayaButton to="/contact" variant="outline" block>
              {{ resCopy.contactFormButtonLabel }}
            </SayaButton>
          </div>
        </div>

      </div>
    </div>

    <!-- Booking Modal Flow -->
    <BookingModal
      v-model="isBookingModalOpen"
      :title="resCopy.reservationFormTitle"
      :can-go-back="bookingStep > startStep && !submitting"
      @back="prevStep"
    >
      <!-- STEP 1: LOCATION (Only if multiple locations) -->
      <div v-if="bookingStep === 1">
        <BookingLocationStep
          v-model="reservationForm.location_id"
          :locations="locations"
          @next="nextStep"
        />
        
        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>

      <!-- STEP 2: DATE -->
      <div v-if="bookingStep === 2">
        <BookingDateSelector
          v-model="bookingDateObj"
        />
        <div class="mt-6">
          <SayaButton block size="lg" :disabled="!reservationForm.date" @click="nextStep">
            Continue
          </SayaButton>
        </div>
        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>

      <!-- STEP 3: TIME & GUESTS -->
      <div v-if="bookingStep === 3">
        <div class="space-y-8">
          <div>
            <h3 class="text-sm font-semibold text-default mb-4">{{ resCopy.guestsLabel }}</h3>
            <BookingGuestCounter v-model="formGuestsNumber" />
          </div>

          <div>
            <h3 class="text-sm font-semibold text-default mb-4">{{ resCopy.timeLabel }}</h3>
            <BookingTimeList
              v-model="reservationForm.time"
              :slots="timeSlots"
            />
          </div>
        </div>
        <div class="mt-6">
          <SayaButton block size="lg" :disabled="!reservationForm.time || !reservationForm.guests" @click="nextStep">
            Continue
          </SayaButton>
        </div>
        <div v-if="submitError" role="alert" class="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {{ submitError }}
        </div>
      </div>

      <!-- STEP 4: CONTACT -->
      <div v-if="bookingStep === 4">
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
import { getFieldDef } from '~/config/content-registry'
import { usePageContent } from '~/composables/usePageContent'
import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'
import { generateReservationTimes, isStructuredOpeningHours } from '~/shared/reservation-hours'
import { setBookingConfirmation } from '~/composables/useBookingHandoff'

definePageMeta({ layout: 'saya' })

const { getField } = usePageContent('reservations')
const { site, siteId } = useTenantSite()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
const { locations, config } = useBootstrap()
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

// ── Policies ──────────────────────────────────────────────────────────────
const policiesBody = ref('')
const reservationPoliciesDefault = getFieldDef('reservations', 'policies.body')?.defaultValue ?? ''
const rawPoliciesHtml = getField('policies.body', reservationPoliciesDefault) ?? reservationPoliciesDefault

onMounted(async () => {
  const DOMPurify = await import('dompurify')
  policiesBody.value = DOMPurify.default.sanitize(rawPoliciesHtml)
})
if (!process.client) policiesBody.value = rawPoliciesHtml

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
const startStep = computed(() => hasMultipleLocations.value ? 1 : 2)
const bookingStep = ref(startStep.value)

function openBookingModal() {
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

// ── Date ──────────────────────────────────────────────────────────────────
const bookingDateObj = ref<Date | null>(null)
watch(bookingDateObj, (newDate) => {
  if (newDate) {
    const y = newDate.getFullYear()
    const m = String(newDate.getMonth() + 1).padStart(2, '0')
    const d = String(newDate.getDate()).padStart(2, '0')
    reservationForm.value.date = `${y}-${m}-${d}`
  } else {
    reservationForm.value.date = ''
  }
})

// ── Guests ────────────────────────────────────────────────────────────────
const formGuestsNumber = ref<number>(
  reservationForm.value.guests === '8+' 
    ? 8 
    : (parseInt(reservationForm.value.guests) || 2)
)
watch(formGuestsNumber, (val) => {
  if (val > 7) {
    reservationForm.value.guests = '8+'
  } else {
    reservationForm.value.guests = String(val)
  }
}, { immediate: true })

// ── Time ──────────────────────────────────────────────────────────────────
const FALLBACK_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const availableTimes = computed(() => {
  const hours = selectedLocation.value?.opening_hours
  if (!reservationForm.value.date || !isStructuredOpeningHours(hours)) return FALLBACK_TIMES
  return generateReservationTimes(hours, reservationForm.value.date)
})

const timeSlots = computed(() => {
  return availableTimes.value.map(t => ({
    id: t,
    startTime: t,
    durationMinutes: null
  }))
})

watch(availableTimes, (times) => {
  if (reservationForm.value.time && !times.includes(reservationForm.value.time)) {
    reservationForm.value.time = ''
  }
})

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
  if (submitting.value || !siteId) return
  submitError.value = null
  try {
    const res = await $fetch<{ id: string; cancellationToken: string }>(`/api/public/sites/${siteId}/reservations`, {
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
    })
    await navigateTo('/reservations/confirmed')
  } catch (err) {
    submitError.value = (err as ApiValue)?.data?.error ?? 'Failed to submit. Please try again.'
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
