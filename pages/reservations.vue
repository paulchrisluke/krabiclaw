<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <SayaHero
      :title="getField('hero.title', 'Reserve a Table')"
      :subtitle="getField('hero.subtitle', 'Book Your Authentic Dining Experience')"
      size="page"
    />
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 gap-12">
        <!-- Reservation Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-(--ui-text) mb-6">Make a Reservation</h2>
          <UCard class="rounded-lg bg-(--ui-bg-muted)">
            <UForm :state="reservationForm" :validate="validateReservation" class="space-y-6" @submit="handleReservation">
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

                <UFormField label="Date" name="date" required>
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

              <UButton type="submit" color="neutral" variant="solid" size="xl" block :loading="submitting" :disabled="submitted">
                {{ submitted ? 'Request received!' : 'Make Reservation' }}
              </UButton>
            </UForm>
          </UCard>
        </div>

        <!-- Sidebar Info -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-(--ui-text) mb-6">Reservation Details</h2>

          <UCard class="mb-6 rounded-lg bg-(--ui-bg-muted)">
            <h3 class="text-lg font-semibold text-(--ui-text) mb-4">Contact Information</h3>
            <div class="space-y-2">
              <p class="text-(--ui-text-muted)"><strong class="text-(--ui-text)">Phone:</strong> {{ contactPhone }}</p>
              <p class="text-(--ui-text-muted)"><strong class="text-(--ui-text)">Email:</strong> {{ contactEmail }}</p>
            </div>
          </UCard>

          <UCard class="mb-6 rounded-lg bg-(--ui-bg-muted)">
            <h3 class="text-lg font-semibold text-(--ui-text) mb-4">Reservation Policies</h3>
            <div v-html="policiesBody" class="text-(--ui-text-muted)" />
          </UCard>

          <div class="space-y-4">
            <UButton :to="`tel:${contactPhone.replace(/\s/g, '')}`" color="neutral" variant="outline" class="w-full">
              Call {{ contactPhone }}
            </UButton>
            <UButton to="/contact" color="neutral" variant="outline" class="w-full">
              Contact Form
            </UButton>
            <UButton to="/menu" color="neutral" variant="outline" class="w-full">
              View Menu
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })
import { usePageContent } from '~/composables/usePageContent'

const { getField } = usePageContent('reservations')

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
const rawPoliciesHtml = getField('policies.body',
  '<ul class="space-y-2">' +
  '<li>• Reservations are held for 15 minutes</li>' +
  '<li>• Cancellations required 2 hours in advance</li>' +
  '<li>• Large parties (6+ guests) may require deposit</li>' +
  '<li>• Special dietary requests accommodated with advance notice</li>' +
  '</ul>'
)

// Sanitize on client side only
onMounted(async () => {
  if (process.client) {
    const DOMPurify = await import('dompurify')
    policiesBody.value = DOMPurify.default.sanitize(rawPoliciesHtml)
  } else {
    policiesBody.value = rawPoliciesHtml
  }
})

// Set initial value for SSR
if (!process.client) {
  policiesBody.value = rawPoliciesHtml
}

// Defaults in computed to avoid parse errors from embedded HTML in template expressions
const contactPhone = computed(() => getField('contact.phone', '+66 81 154 3606'))
const contactEmail = computed(() => getField('contact.email', 'info@kikuzuki-thailand.com'))
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

const { site, siteId } = useTenantSite()
const toast = useToast()
const submitting = ref(false)
const submitted = ref(false)

const handleReservation = async () => {
  if (submitting.value) return
  submitting.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/reservations`, {
      method: 'POST',
      body: reservationForm.value,
    })
    submitted.value = true
    reservationForm.value = { name: '', email: '', phone: '', date: '', time: '', guests: '', requests: '' }
    toast.add({ description: 'Reservation request received! We\'ll confirm shortly.', color: 'success' })
  } catch (err) {
    toast.add({ description: err?.data?.error ?? 'Failed to submit. Please try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
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
