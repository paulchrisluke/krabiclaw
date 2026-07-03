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

          <div class="rounded-2xl bg-muted p-6 sm:p-8">

            <!-- ── Form ────────────────────────────────────────────── -->
            <form class="space-y-6" novalidate @submit.prevent="handleReservation">
              <div v-if="submitError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                {{ submitError }}
              </div>

              <!-- Name + Email -->
              <div class="grid gap-5 sm:grid-cols-2">
                <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.nameLabel" name="name" required :error="fieldError('name')">
                  <input :id="id" v-model="reservationForm.name" type="text" :placeholder="resCopy.namePlaceholder" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
                </SayaFormField>
                <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.emailLabel" name="email" required :error="fieldError('email')">
                  <input :id="id" v-model="reservationForm.email" type="email" :placeholder="resCopy.emailPlaceholder" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
                </SayaFormField>
              </div>

              <!-- Phone -->
              <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.phoneLabel" name="phone" required :error="fieldError('phone')">
                <input :id="id" v-model="reservationForm.phone" type="tel" :placeholder="resCopy.phonePlaceholder" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
              </SayaFormField>

              <SayaFormField
                v-if="hasMultipleLocations"
                v-slot="{ id, describedBy, invalid }"
                :label="resCopy.locationLabel"
                name="location_id"
                required
                :error="fieldError('location_id')"
              >
                <select :id="id" v-model="reservationForm.location_id" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid">
                  <option value="" disabled>{{ resCopy.selectLocationLabel }}</option>
                  <option v-for="opt in locationSelectOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </SayaFormField>

              <!-- Date -->
              <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.dateLabel" name="date" required :error="fieldError('date')">
                <div class="space-y-3">
                  <input :id="id" v-model="reservationForm.date" type="date" :min="todayIso" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
                  <p v-if="reservationForm.date" class="text-sm font-medium text-default">
                    Selected: <span class="text-primary">{{ readableDate }}</span>
                  </p>
                  <p v-else class="text-xs text-muted">{{ resCopy.pickDayLabel }}</p>
                </div>
              </SayaFormField>

              <!-- Time + Guests -->
              <div class="grid gap-5 sm:grid-cols-2">
                <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.timeLabel" name="time" required :error="fieldError('time')">
                  <select :id="id" v-model="reservationForm.time" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid">
                    <option value="" disabled>{{ resCopy.selectTimeLabel }}</option>
                    <option v-for="opt in timeSelectOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </SayaFormField>
                <SayaFormField v-slot="{ id, describedBy, invalid }" :label="resCopy.guestsLabel" name="guests" required :error="fieldError('guests')">
                  <select :id="id" v-model="reservationForm.guests" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid">
                    <option value="" disabled>{{ resCopy.selectGuestsLabel }}</option>
                    <option v-for="opt in guestOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </SayaFormField>
              </div>

              <!-- Special requests -->
              <SayaFormField
                v-slot="{ id, describedBy, invalid }"
                :label="resCopy.specialRequestsLabel"
                name="requests"
                :description="resCopy.bookingNotesPlaceholder"
              >
                <textarea
                  :id="id"
                  v-model="reservationForm.requests"
                  :placeholder="resCopy.specialRequestsPlaceholder"
                  rows="3"
                  :class="inputClass"
                  :aria-describedby="describedBy"
                  :aria-invalid="invalid"
                />
              </SayaFormField>

              <SayaButton type="submit" size="lg" block :loading="submitting">
                {{ resCopy.reservationRequestButton }}
              </SayaButton>
            </form>

          </div>
        </div>

        <!-- Sidebar -->
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
            <SayaButton :to="resCopy.reservationExploreRoute" variant="outline" block>
              {{ resCopy.reservationExploreLabel }}
            </SayaButton>
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

// ── Date ──────────────────────────────────────────────────────────────────
// Native <input type="date"> replaces UCalendar/@internationalized/date — same
// "YYYY-MM-DD" string shape reservationForm.date already expected, no bridging
// needed. Server already rejects past dates; `min` is just a UX nicety.
// Use local time instead of UTC to show visitor's actual today.
const todayIso = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
})

// Plain-Tailwind form styling — replaces UInput/UTextarea/USelect's default
// look now that this page no longer depends on Nuxt UI (see SayaFormField.vue).
import { FORM_INPUT_CLASS } from '~/utils/form-constants'
const inputClass = FORM_INPUT_CLASS

const readableDate = computed(() => {
  if (!reservationForm.value.date) return ''
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
  return times
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
  if (!state.date)    errors.push({ name: 'date',   message: 'Please pick a date.' })
  if (!state.time)    errors.push({ name: 'time',   message: 'Please choose a time.' })
  if (!state.guests)  errors.push({ name: 'guests', message: 'Please choose your party size.' })
  return errors
}

const submitting = ref(false)
const submitError = ref<string | null>(null)
const reservationErrors = ref<{ name: string; message: string }[]>([])
const fieldError = (name: string) => reservationErrors.value.find(e => e.name === name)?.message ?? null

async function handleReservation() {
  if (submitting.value || !siteId) return
  submitError.value = null
  reservationErrors.value = validateReservation(reservationForm.value)
  if (reservationErrors.value.length > 0) return

  submitting.value = true
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
