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
            <UForm v-if="!submitted" :state="reservationForm" :validate="validateReservation" class="space-y-6" @submit="handleReservation">

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
                label="resCopy.specialRequestsLabel"
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

            <!-- ── Thank You ───────────────────────────────────────── -->
            <div v-else class="py-10 text-center">
              <!-- Check icon -->
              <div class="mb-8 flex justify-center">
                <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
                  <UIcon name="i-heroicons-check-circle" class="size-12 text-primary" />
                </div>
              </div>

              <h2 class="saya-display saya-italic text-4xl text-default">
                Thank you, {{ lastSubmission?.name }}!
              </h2>
              <p class="mt-4 text-muted">
                We've received your request for
                <strong class="text-default">{{ lastSubmission?.guests }} {{ Number(lastSubmission?.guests) === 1 ? resCopy.guestLabel : resCopy.guestsLabelPlural }}</strong>
                on <strong class="text-default">{{ readableLastDate }}</strong>
                at <strong class="text-default">{{ lastSubmission?.time }}</strong>.
              </p>
              <p class="mt-2 text-sm text-muted">
                Our team will confirm your {{ resCopy.reservationWord }} shortly via email or phone.
              </p>

              <!-- Manage reservation -->
              <div v-if="cancelUrl" class="mt-10 rounded-2xl border border-default bg-default px-6 py-5">
                <p class="saya-eyebrow mb-1 text-muted">Manage {{ resCopy.reservationWord }}</p>
                <p class="text-sm text-muted">Changed your plans? Cancel anytime before your visit.</p>
                <UButton :to="cancelUrl" color="error" variant="ghost" size="sm" class="mt-4 rounded-full">
                  <UIcon name="i-heroicons-x-circle" class="mr-1.5 size-4" />
                  Cancel {{ resCopy.reservationWord }}
                </UButton>
              </div>

              <div class="mt-8 flex flex-col gap-3">
                <UButton :to="`tel:${contactPhone?.replace(/\s/g, '') ?? ''}`" color="neutral" variant="soft" class="rounded-full">
                  Call us: {{ contactPhone }}
                </UButton>
                <UButton color="primary" variant="ghost" size="sm" @click="resetForm">
                  Make another {{ resCopy.reservationWord }}
                </UButton>
              </div>
            </div>

          </UCard>
        </div>

        <!-- Sidebar -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">{{ resCopy.reservationFormTitle }} Details</h2>

          <UCard class="mb-6 rounded-2xl bg-muted">
            <h3 class="mb-4 text-lg font-semibold text-default">{{ resCopy.contactInfoHeading }}</h3>
            <div class="space-y-2">
              <p class="text-muted"><strong class="text-default">{{ resCopy.phoneLabelShort }}:</strong> {{ contactPhone }}</p>
              <p class="text-muted"><strong class="text-default">{{ resCopy.emailLabelShort }}:</strong> {{ contactEmail }}</p>
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

definePageMeta({ layout: 'saya' })

const { getField } = usePageContent('reservations')
const { site, siteId } = useTenantSite()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
useBootstrap()
const { formatDate } = useLocaleDate()

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

const readableLastDate = computed(() => {
  if (!lastSubmission.value?.date) return ''
  return formatDate(`${lastSubmission.value.date}T12:00:00`)
})

// ── Options ───────────────────────────────────────────────────────────────
const timeSelectOptions = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'].map(t => ({ label: t, value: t }))
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

// ── Contact ───────────────────────────────────────────────────────────────
const contactPhone = computed(() => getField('contact.phone', (site as ApiValue)?.config?.phone || ''))
const contactEmail = computed(() => getField('contact.email', (site as ApiValue)?.config?.email || ''))

// ── Form state ────────────────────────────────────────────────────────────
const reservationForm = ref({ name: '', email: '', phone: '', date: '', time: '', guests: '', requests: '' })
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validateReservation = (state: typeof reservationForm.value) => {
  const errors: { name: string; message: string }[] = []
  if (!state.name)    errors.push({ name: 'name',   message: 'Please enter your name.' })
  if (!state.email)   errors.push({ name: 'email',  message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email address.' })
  if (!state.phone)   errors.push({ name: 'phone',  message: 'Please enter your phone number.' })
  if (!state.date)    errors.push({ name: 'date',   message: 'Please pick a date on the calendar.' })
  if (!state.time)    errors.push({ name: 'time',   message: 'Please choose a time.' })
  if (!state.guests)  errors.push({ name: 'guests', message: 'Please choose your party size.' })
  return errors
}

const toast = useToast()
const submitting = ref(false)
const submitted = ref(false)
const lastSubmission = ref<{ name: string; date: string; time: string; guests: string; id?: string; cancellationToken?: string } | null>(null)

async function handleReservation() {
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch<{ id: string; cancellationToken: string }>(`/api/public/sites/${siteId}/reservations`, {
      method: 'POST',
      body: reservationForm.value,
    })
    lastSubmission.value = { ...reservationForm.value, id: res?.id, cancellationToken: res?.cancellationToken }
    submitted.value = true
    reservationForm.value = { name: '', email: '', phone: '', date: '', time: '', guests: '', requests: '' }
    selectedDate.value = undefined
    toast.add({ description: "Reservation request received! We'll confirm shortly.", color: 'success' })
  } catch (err) {
    toast.add({ description: (err as ApiValue)?.data?.error ?? 'Failed to submit. Please try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  submitted.value = false
  lastSubmission.value = null
}

const cancelUrl = computed(() => {
  if (!lastSubmission.value?.id || !lastSubmission.value?.cancellationToken) return null
  return `/reservations/cancel?id=${lastSubmission.value.id}#${lastSubmission.value.cancellationToken}`
})

// ── SEO ───────────────────────────────────────────────────────────────────
const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/reservations')
const requestUrl = useRequestURL()

useBreadcrumbSchema([
  { name: 'Home', url: `/` },
  { name: 'Reservations', url: `/reservations` }
])

const brandName = computed(() => (site as ApiValue)?.brand_name || (site as ApiValue)?.title || 'Restaurant')
useSeoMeta({
  title: computed(() => `${brandName.value} | ${resCopy.value.reserveCta}`),
  description: computed(() => resCopy.value.seoReservationDescription(brandName.value)),
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl,
  ogType: 'website'
})

useSchemaOrg([
  ({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: (site as ApiValue)?.brand_name || (site as ApiValue)?.title || 'Restaurant',
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
