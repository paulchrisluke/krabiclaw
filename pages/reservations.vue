<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ resCopy.reservationPageKicker }}</p>
      <h1 class="saya-display-md text-default">
        <em class="saya-italic">{{ getField('hero.title', resCopy.reserveCta) }}</em>
      </h1>
      <p v-if="getField('hero.subtitle')" class="mt-5 max-w-xl text-sm leading-relaxed text-muted">{{ getField('hero.subtitle') }}</p>
    </header>

    <div class="mx-auto max-w-6xl px-4 pb-24">
      <div class="grid gap-12 md:grid-cols-2">

        <!-- Reservation Form / Thank-you -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">{{ resCopy.reservationFormTitle }}</h2>

          <UCard class="rounded-2xl bg-muted">

            <!-- ── Form ────────────────────────────────────────────── -->
            <UForm :state="reservationForm" :validate="validateReservation" class="space-y-6" @submit="handleReservation">

              <!-- Name + Email -->
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField :label="resCopy.nameLabel" name="name" required>
                  <UInput v-model="reservationForm.name" size="lg" :placeholder="resCopy.namePlaceholder" />
                </UFormField>
                <UFormField :label="resCopy.emailLabel" name="email" required>
                  <UInput v-model="reservationForm.email" size="lg" type="email" :placeholder="resCopy.emailPlaceholder" />
                </UFormField>
              </div>

              <!-- Phone -->
              <UFormField :label="resCopy.phoneLabel" name="phone" required>
                <UInput v-model="reservationForm.phone" size="lg" type="tel" :placeholder="resCopy.phonePlaceholder" class="w-full" />
              </UFormField>

              <UFormField v-if="hasMultipleLocations" :label="resCopy.locationLabel" name="location_id" required>
                <USelect
                  v-model="reservationForm.location_id"
                  size="lg"
                  :items="locationSelectOptions"
                  :placeholder="resCopy.selectLocationLabel"
                  class="w-full"
                />
              </UFormField>

              <!-- Date — Calendar (client-only: skips SSR of the full date grid) -->
              <UFormField :label="resCopy.dateLabel" name="date" required>
                <div class="space-y-3">
                  <ClientOnly>
                    <UCalendar
                      v-model="selectedDate"
                      class="w-full rounded-xl"
                    />
                    <template #fallback>
                      <div class="h-64 w-full rounded-xl bg-muted/40 animate-pulse" />
                    </template>
                  </ClientOnly>
                  <p v-if="reservationForm.date" class="text-sm font-medium text-default">
                    Selected: <span class="text-primary">{{ readableDate }}</span>
                  </p>
                  <p v-else class="text-xs text-muted">{{ resCopy.pickDayLabel }}</p>
                </div>
              </UFormField>

              <!-- Time + Guests -->
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField :label="resCopy.timeLabel" name="time" required>
                  <USelect
                    v-model="reservationForm.time"
                    size="lg"
                    :items="timeSelectOptions"
                    :placeholder="resCopy.selectTimeLabel"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="resCopy.guestsLabel" name="guests" required>
                  <USelect
                    v-model="reservationForm.guests"
                    size="lg"
                    :items="guestOptions"
                    :placeholder="resCopy.selectGuestsLabel"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Special requests -->
              <UFormField
                :label="resCopy.specialRequestsLabel"
                name="requests"
                :description="resCopy.bookingNotesPlaceholder"
              >
                <UTextarea
                  v-model="reservationForm.requests"
                  size="lg"
                  :placeholder="resCopy.specialRequestsPlaceholder"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <UButton type="submit" color="primary" variant="solid" size="xl" block :loading="submitting">
                {{ resCopy.reservationRequestButton }}
              </UButton>
            </UForm>

          </UCard>
        </div>

        <!-- Sidebar -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">{{ resCopy.reservationFormTitle }} Details</h2>

          <UCard class="mb-6 rounded-2xl bg-muted">
            <h3 class="mb-4 text-lg font-semibold text-default">{{ resCopy.contactInfoHeading }}</h3>
            <p v-if="selectedLocation" class="mb-3 text-sm text-muted">{{ selectedLocation.title }}</p>
            <div class="space-y-2">
              <p v-if="contactPhone" class="text-muted"><strong class="text-default">{{ resCopy.phoneLabelShort }}:</strong> {{ contactPhone }}</p>
              <p v-if="contactEmail" class="text-muted"><strong class="text-default">{{ resCopy.emailLabelShort }}:</strong> {{ contactEmail }}</p>
            </div>
          </UCard>

          <UCard class="mb-6 rounded-2xl bg-muted">
            <h3 class="mb-4 text-lg font-semibold text-default">{{ resCopy.reservationPoliciesHeading }}</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="policiesBody" class="text-muted" />
          </UCard>

          <div class="space-y-4">
            <UButton v-if="contactPhone" :to="`tel:${contactPhone?.replace(/\s/g, '') ?? ''}`" color="primary" variant="outline" class="w-full">
              {{ resCopy.callButtonLabel }} {{ contactPhone }}
            </UButton>
            <UButton to="/contact" color="primary" variant="outline" class="w-full">{{ resCopy.contactFormButtonLabel }}</UButton>
            <UButton :to="resCopy.reservationExploreRoute" color="primary" variant="outline" class="w-full">
              {{ resCopy.reservationExploreLabel }}
            </UButton>
          </div>
        </div>

      </div>
    </div>
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
const { hasExperiences, locations, config } = useBootstrap()
const { formatDate } = useLocaleDate()
const isExperienceSite = computed(() => (site as { vertical?: string | null } | null)?.vertical === 'experience')

// Pure experience-vertical sites book per-experience on /experiences/[slug]; this
// generic table-reservation form doesn't apply there. Restaurants that also have
// experiences attached (e.g. Ember & Slice, Kikuzuki) still need this page for
// regular table bookings alongside their experience bookings.
watch([isExperienceSite, hasExperiences], ([isExp, hasExp]) => {
  if (isExp && hasExp) {
    navigateTo('/experiences', { replace: true, redirectCode: 302 })
  }
}, { immediate: true })

// ── Calendar ──────────────────────────────────────────────────────────────
// selectedDate is untyped to bridge the two moduleResolution instances of
// @internationalized/date that Nuxt UI and our component see. The server already
// rejects past dates so no min-value constraint is needed client-side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const selectedDate = ref<any>(null)

watch(selectedDate, (d: unknown) => {
  reservationForm.value.date = d ? String(d) : ''
})

const readableDate = computed(() => {
  if (!selectedDate.value) return ''
  return formatDate(`${reservationForm.value.date}T12:00:00`)
})

// ── Options ───────────────────────────────────────────────────────────────
// Fallback used when the location has no structured opening_hours (e.g. Google Places imports,
// which store hours as free-text weekday descriptions that can't be parsed into slots).
const FALLBACK_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const availableTimes = computed(() => {
  const hours = selectedLocation.value?.opening_hours
  if (!reservationForm.value.date || !isStructuredOpeningHours(hours)) return FALLBACK_TIMES
  const times = generateReservationTimes(hours, reservationForm.value.date)
  return times.length > 0 ? times : FALLBACK_TIMES
})
const timeSelectOptions = computed(() => availableTimes.value.map(t => ({ label: t, value: t })))

watch(availableTimes, (times) => {
  if (reservationForm.value.time && !times.includes(reservationForm.value.time)) {
    reservationForm.value.time = ''
  }
})

const guestOptions = computed(() => [
  { value: '1', label: resCopy.value.oneGuestLabel },
  { value: '2', label: `2 ${resCopy.value.guestsLabelPlural}` },
  { value: '3', label: `3 ${resCopy.value.guestsLabelPlural}` },
  { value: '4', label: `4 ${resCopy.value.guestsLabelPlural}` },
  { value: '5', label: `5 ${resCopy.value.guestsLabelPlural}` },
  { value: '6', label: `6 ${resCopy.value.guestsLabelPlural}` },
  { value: '7', label: `7 ${resCopy.value.guestsLabelPlural}` },
  { value: '8+', label: `8+ ${resCopy.value.guestsLabelPlural}` },
])

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
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Contact ───────────────────────────────────────────────────────────────
const hasMultipleLocations = computed(() => locations.value.length > 1)
const locationSelectOptions = computed(() =>
  locations.value.map(location => ({
    label: String(location.title ?? ''),
    value: String(location.id ?? ''),
  })),
)
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

const validateReservation = (state: typeof reservationForm.value) => {
  const errors: { name: string; message: string }[] = []
  if (!state.name)    errors.push({ name: 'name',   message: 'Please enter your name.' })
  if (!state.email)   errors.push({ name: 'email',  message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email address.' })
  if (!state.phone)   errors.push({ name: 'phone',  message: 'Please enter your phone number.' })
  if (hasMultipleLocations.value && !state.location_id) errors.push({ name: 'location_id', message: resCopy.value.chooseLocationLabel })
  if (!state.date)    errors.push({ name: 'date',   message: 'Please pick a date on the calendar.' })
  if (!state.time)    errors.push({ name: 'time',   message: 'Please choose a time.' })
  if (!state.guests)  errors.push({ name: 'guests', message: 'Please choose your party size.' })
  return errors
}

const toast = useToast()
const submitting = ref(false)

async function handleReservation() {
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch<{ id: string; cancellationToken: string }>(`/api/public/sites/${siteId}/reservations`, {
      method: 'POST',
      body: reservationForm.value,
    })
    setBookingConfirmation({
      type: 'reservation',
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
    toast.add({ description: (err as ApiValue)?.data?.error ?? 'Failed to submit. Please try again.', color: 'error' })
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
