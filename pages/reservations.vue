<template>
  <div class="min-h-screen bg-default text-default">
    <SayaHero
      :title="getField('hero.title', 'Reserve a Table')"
      :subtitle="getField('hero.subtitle', 'Book Your Authentic Dining Experience')"
      size="page"
    />
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 gap-12">
        <!-- Reservation Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-default mb-6">Make a Reservation</h2>
          <UCard class="rounded-lg bg-muted">
            <UForm v-if="!submitted" :state="reservationForm" :validate="validateReservation" class="space-y-6" @submit="handleReservation">
              <div class="grid gap-5 md:grid-cols-2">
                <UFormField label="Name" name="name" required>
                  <UInput
                    id="res-name"
                    v-model="reservationForm.name"
                    class="w-full"
                    size="lg"
                    placeholder="Your name"
                  />
                </UFormField>

                <UFormField label="Email" name="email" required>
                  <UInput
                    id="res-email"
                    v-model="reservationForm.email"
                    class="w-full"
                    size="lg"
                    type="email"
                    placeholder="you@example.com"
                  />
                </UFormField>

                <UFormField label="Phone" name="phone" required>
                  <UInput
                    id="res-phone"
                    v-model="reservationForm.phone"
                    class="w-full"
                    size="lg"
                    type="tel"
                    placeholder="+66 81 234 5678"
                  />
                </UFormField>

                <UFormField label="Date (Select Day)" name="date" required>
                  <UInput
                    id="res-date"
                    v-model="reservationForm.date"
                    class="w-full"
                    size="lg"
                    type="date"
                    :min="today"
                  />
                </UFormField>

                <UFormField label="Time" name="time" required>
                  <USelect
                    id="res-time"
                    v-model="reservationForm.time"
                    class="w-full"
                    size="lg"
                    :items="timeSelectOptions"
                    placeholder="Select time"
                  />
                </UFormField>

                <UFormField label="Guests" name="guests" required>
                  <USelect
                    id="res-guests"
                    v-model="reservationForm.guests"
                    class="w-full"
                    size="lg"
                    :items="guestOptions"
                    placeholder="Select guests"
                  />
                </UFormField>
              </div>

              <UFormField
                label="Special requests"
                name="requests"
                description="Dietary needs, accessibility requests, preferred seating, or celebration notes."
              >
                <UTextarea
                  id="res-requests"
                  v-model="reservationForm.requests"
                  class="w-full"
                  size="lg"
                  placeholder="Tell us anything that will help us prepare for your visit."
                  :rows="4"
                />
              </UFormField>

              <UButton type="submit" color="primary" variant="solid" size="xl" block :loading="submitting">
                Make Reservation
              </UButton>
            </UForm>

            <!-- Thank You State -->
            <div v-else class="py-8 text-center">
              <div class="mb-6 flex justify-center">
                <div class="flex size-16 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <UIcon name="i-heroicons-check-circle" class="size-10" />
                </div>
              </div>
              <h2 class="saya-display saya-italic text-3xl text-default">Thank you, {{ lastSubmission?.name }}!</h2>
              <p class="mt-4 text-muted">We've received your request for <strong>{{ lastSubmission?.guests }} guests</strong> on <strong>{{ lastSubmission?.date }}</strong> at <strong>{{ lastSubmission?.time }}</strong>.</p>
              <p class="mt-2 text-sm text-muted">Our team will confirm your reservation shortly via email or phone.</p>
              
              <div v-if="cancelUrl" class="mt-8 border-t border-default pt-8">
                <p class="text-xs text-muted mb-3 uppercase tracking-widest font-bold">Manage Reservation</p>
                <p class="text-xs text-muted mb-4 italic">Changed your mind? You can cancel your request below.</p>
                <UButton :to="cancelUrl" color="error" variant="ghost" size="xs">Cancel Reservation</UButton>
              </div>

              <div class="mt-10">
                <UButton color="primary" variant="soft" @click="submitted = false">Make another reservation</UButton>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Sidebar Info -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-default mb-6">Reservation Details</h2>

          <UCard class="mb-6 rounded-lg bg-muted">
            <h3 class="text-lg font-semibold text-default mb-4">Contact Information</h3>
            <div class="space-y-2">
              <p class="text-muted"><strong class="text-default">Phone:</strong> {{ contactPhone }}</p>
              <p class="text-muted"><strong class="text-default">Email:</strong> {{ contactEmail }}</p>
            </div>
          </UCard>

          <UCard class="mb-6 rounded-lg bg-muted">
            <h3 class="text-lg font-semibold text-default mb-4">Reservation Policies</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="policiesBody" class="text-muted" />
          </UCard>

          <div class="space-y-4">
            <UButton v-if="contactPhone" :to="`tel:${contactPhone.replace(/\s/g, '')}`" color="primary" variant="outline" class="w-full">
              Call {{ contactPhone }}
            </UButton>
            <UButton to="/contact" color="primary" variant="outline" class="w-full">
              Contact Form
            </UButton>
            <UButton to="/menu" color="primary" variant="outline" class="w-full">
              View Menu
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getFieldDef } from '~/config/content-registry'
import { usePageContent } from '~/composables/usePageContent'
import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

definePageMeta({ layout: 'saya' })

const { getField } = usePageContent('reservations')
const { site, siteId } = useTenantSite()

const timeSlots = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const timeSelectOptions = timeSlots.map(time => ({ label: time, value: time }))
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

// Sanitized policies body to prevent XSS
const policiesBody = ref('')
const reservationPoliciesDefault = getFieldDef('reservations', 'policies.body')?.defaultValue ?? ''
const rawPoliciesHtml = getField('policies.body', reservationPoliciesDefault) ?? reservationPoliciesDefault

// Sanitize on client side only
onMounted(async () => {
  const DOMPurify = await import('dompurify')
  policiesBody.value = DOMPurify.default.sanitize(rawPoliciesHtml)
})

// Set initial value for SSR
if (!process.client) {
  policiesBody.value = rawPoliciesHtml
}

// Defaults in computed to avoid parse errors from embedded HTML in template expressions
// Defaults to site config if available
const contactPhone = computed(() => getField('contact.phone', site?.config?.phone || '+66 81 154 3606'))
const contactEmail = computed(() => getField('contact.email', site?.config?.email || 'info@kikuzuki-thailand.com'))
const reservationForm = ref({
  name: '',
  email: '',
  phone: '',
  date: '',
  time: '',
  guests: '',
  requests: ''
})

const today = new Date().toISOString().slice(0, 10)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validateReservation = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) {
    errors.push({ name: 'email', message: 'Please enter your email.' })
  } else if (!emailPattern.test(state.email)) {
    errors.push({ name: 'email', message: 'Please enter a valid email address.' })
  }
  if (!state.phone) errors.push({ name: 'phone', message: 'Please enter your phone number.' })
  if (!state.date) errors.push({ name: 'date', message: 'Please choose a date.' })
  if (!state.time) errors.push({ name: 'time', message: 'Please choose a time.' })
  if (!state.guests) errors.push({ name: 'guests', message: 'Please choose your party size.' })
  return errors
}

const toast = useToast()
const submitting = ref(false)
const submitted = ref(false)
const lastSubmission = ref(null)

const handleReservation = async () => {
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await $fetch(`/api/public/sites/${siteId}/reservations`, {
      method: 'POST',
      body: reservationForm.value,
    })
    lastSubmission.value = { 
      ...reservationForm.value,
      id: res?.id,
      cancellationToken: res?.cancellationToken
    }
    submitted.value = true
    reservationForm.value = { name: '', email: '', phone: '', date: '', time: '', guests: '', requests: '' }
    toast.add({ description: 'Reservation request received! We\'ll confirm shortly.', color: 'success' })
  } catch (err) {
    toast.add({ description: err?.data?.error ?? 'Failed to submit. Please try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

const cancelUrl = computed(() => {
  if (!lastSubmission.value?.id || !lastSubmission.value?.cancellationToken) return null
  return `/reservations/cancel?id=${lastSubmission.value.id}&token=${encodeURIComponent(lastSubmission.value.cancellationToken)}`
})

const config = useRuntimeConfig()
const platformHostname = config.public.freeSiteDomain?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'krabiclaw.com'

useBreadcrumbSchema([
  { name: 'Home', url: `/` },
  { name: 'Reservations', url: `/reservations` }
])

useSeoMeta({
  title: 'Reserve a Table | Saya Kitchen',
  description: 'Reserve a table at Saya Kitchen in Krabi.',
  ogImage: '/og-image.jpg',
  ogUrl: `https://${site?.subdomain || 'restaurant'}.${platformHostname}/reservations`,
  ogType: 'website'
})

useSchemaOrg([
  ({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: site?.title || 'Restaurant',
    url: `https://${site?.subdomain || 'restaurant'}.${platformHostname}`,
    reservationUrl: `https://${site?.subdomain || 'restaurant'}.${platformHostname}/reservations`,
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `https://${site?.subdomain || 'restaurant'}.${platformHostname}/reservations`
      },
      result: {
        '@type': 'Reservation'
      }
    }
  })
])
</script>
