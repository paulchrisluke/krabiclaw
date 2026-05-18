<template>
  <div class="min-h-screen bg-default text-default">
    <SayaHero
      :title="getField('hero.title', 'Reserve a Table') ?? 'Reserve a Table'"
      :subtitle="getField('hero.subtitle', 'Book Your Authentic Dining Experience') ?? 'Book Your Authentic Dining Experience'"
      size="page"
    />

    <div class="mx-auto max-w-6xl px-4 py-12">
      <div class="grid gap-12 md:grid-cols-2">

        <!-- Reservation Form / Thank-you -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">Make a Reservation</h2>

          <UCard class="rounded-2xl bg-muted">

            <!-- ── Form ────────────────────────────────────────────── -->
            <UForm v-if="!submitted" :state="reservationForm" :validate="validateReservation" class="space-y-6" @submit="handleReservation">

              <!-- Name + Email -->
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField label="Name" name="name" required>
                  <UInput v-model="reservationForm.name" size="lg" placeholder="Your name" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput v-model="reservationForm.email" size="lg" type="email" placeholder="you@example.com" />
                </UFormField>
              </div>

              <!-- Phone -->
              <UFormField label="Phone" name="phone" required>
                <UInput v-model="reservationForm.phone" size="lg" type="tel" placeholder="+66 81 234 5678" class="w-full" />
              </UFormField>

              <!-- Date — Calendar -->
              <UFormField label="Date" name="date" required>
                <div class="space-y-3">
                  <UCalendar
                    v-model="selectedDate"
                    class="w-full rounded-xl"
                  />
                  <p v-if="reservationForm.date" class="text-sm font-medium text-default">
                    Selected: <span class="text-primary">{{ readableDate }}</span>
                  </p>
                  <p v-else class="text-xs text-muted">Pick a day above to continue.</p>
                </div>
              </UFormField>

              <!-- Time + Guests -->
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField label="Time" name="time" required>
                  <USelect
                    v-model="reservationForm.time"
                    size="lg"
                    :items="timeSelectOptions"
                    placeholder="Select time"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Guests" name="guests" required>
                  <USelect
                    v-model="reservationForm.guests"
                    size="lg"
                    :items="guestOptions"
                    placeholder="Select guests"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Special requests -->
              <UFormField
                label="Special requests"
                name="requests"
                description="Dietary needs, accessibility requests, preferred seating, or celebration notes."
              >
                <UTextarea
                  v-model="reservationForm.requests"
                  size="lg"
                  placeholder="Tell us anything that will help us prepare for your visit."
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <UButton type="submit" color="primary" variant="solid" size="xl" block :loading="submitting">
                Request Reservation
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
                <strong class="text-default">{{ lastSubmission?.guests }} {{ Number(lastSubmission?.guests) === 1 ? 'guest' : 'guests' }}</strong>
                on <strong class="text-default">{{ readableLastDate }}</strong>
                at <strong class="text-default">{{ lastSubmission?.time }}</strong>.
              </p>
              <p class="mt-2 text-sm text-muted">
                Our team will confirm your reservation shortly via email or phone.
              </p>

              <!-- Manage reservation -->
              <div v-if="cancelUrl" class="mt-10 rounded-2xl border border-default bg-default px-6 py-5">
                <p class="saya-eyebrow mb-1 text-muted">Manage reservation</p>
                <p class="text-sm text-muted">Changed your plans? Cancel anytime before your visit.</p>
                <UButton :to="cancelUrl" color="error" variant="ghost" size="sm" class="mt-4 rounded-full">
                  <UIcon name="i-heroicons-x-circle" class="mr-1.5 size-4" />
                  Cancel reservation
                </UButton>
              </div>

              <div class="mt-8 flex flex-col gap-3">
                <UButton :to="`tel:${contactPhone?.replace(/\s/g, '') ?? ''}`" color="neutral" variant="soft" class="rounded-full">
                  Call us: {{ contactPhone }}
                </UButton>
                <UButton color="primary" variant="ghost" size="sm" @click="resetForm">
                  Make another reservation
                </UButton>
              </div>
            </div>

          </UCard>
        </div>

        <!-- Sidebar -->
        <div>
          <h2 class="mb-6 text-2xl font-bold text-default md:text-3xl">Reservation Details</h2>

          <UCard class="mb-6 rounded-2xl bg-muted">
            <h3 class="mb-4 text-lg font-semibold text-default">Contact Information</h3>
            <div class="space-y-2">
              <p class="text-muted"><strong class="text-default">Phone:</strong> {{ contactPhone }}</p>
              <p class="text-muted"><strong class="text-default">Email:</strong> {{ contactEmail }}</p>
            </div>
          </UCard>

          <UCard class="mb-6 rounded-2xl bg-muted">
            <h3 class="mb-4 text-lg font-semibold text-default">Reservation Policies</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="policiesBody" class="text-muted" />
          </UCard>

          <div class="space-y-4">
            <UButton v-if="contactPhone" :to="`tel:${contactPhone?.replace(/\s/g, '') ?? ''}`" color="primary" variant="outline" class="w-full">
              Call {{ contactPhone }}
            </UButton>
            <UButton to="/contact" color="primary" variant="outline" class="w-full">Contact Form</UButton>
            <UButton to="/menu" color="primary" variant="outline" class="w-full">View Menu</UButton>
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
  return new Date(reservationForm.value.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
})

const readableLastDate = computed(() => {
  if (!lastSubmission.value?.date) return ''
  return new Date(lastSubmission.value.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
})

// ── Options ───────────────────────────────────────────────────────────────
const timeSelectOptions = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'].map(t => ({ label: t, value: t }))
const guestOptions = [
  { value: '1', label: '1 Guest' },
  { value: '2', label: '2 Guests' },
  { value: '3', label: '3 Guests' },
  { value: '4', label: '4 Guests' },
  { value: '5', label: '5 Guests' },
  { value: '6', label: '6 Guests' },
  { value: '7', label: '7 Guests' },
  { value: '8+', label: '8+ Guests' },
]

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
const contactPhone = computed(() => getField('contact.phone', (site as ApiValue)?.config?.phone || '+66 81 154 3606'))
const contactEmail = computed(() => getField('contact.email', (site as ApiValue)?.config?.email || 'info@kikuzuki-thailand.com'))

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
const config = useRuntimeConfig()
const platformHostname = (config.public.freeSiteDomain as string | undefined)?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'krabiclaw.com'

useBreadcrumbSchema([
  { name: 'Home', url: `/` },
  { name: 'Reservations', url: `/reservations` }
])

useSeoMeta({
  title: 'Reserve a Table | Saya Kitchen',
  description: 'Reserve a table at Saya Kitchen in Krabi.',
  ogImage: '/og-image.jpg',
  ogUrl: `https://${(site as ApiValue)?.subdomain || 'restaurant'}.${platformHostname}/reservations`,
  ogType: 'website'
})

useSchemaOrg([
  ({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: (site as ApiValue)?.title || 'Restaurant',
    url: `https://${(site as ApiValue)?.subdomain || 'restaurant'}.${platformHostname}`,
    reservationUrl: `https://${(site as ApiValue)?.subdomain || 'restaurant'}.${platformHostname}/reservations`,
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `https://${(site as ApiValue)?.subdomain || 'restaurant'}.${platformHostname}/reservations` },
      result: { '@type': 'Reservation' }
    }
  })
])
</script>
