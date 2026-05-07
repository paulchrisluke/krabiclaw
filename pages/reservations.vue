<template>
  <div class="min-h-screen bg-white">
    <AppHero
      :title="getField('hero.title', 'Reserve a Table')"
      :subtitle="getField('hero.subtitle', 'Book Your Authentic Dining Experience')"
      size="page"
    />
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 gap-12">
        <!-- Reservation Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Make a Reservation</h2>
          <UCard class="bg-gray-50 rounded-lg">
            <UForm @submit="handleReservation" class="space-y-6">
              <UInput
                id="res-name"
                v-model="reservationForm.name"
                label="Name"
                required
              />
              <UInput
                id="res-email"
                v-model="reservationForm.email"
                type="email"
                label="Email"
                required
              />
              <UInput
                id="res-phone"
                v-model="reservationForm.phone"
                type="tel"
                label="Phone"
                required
              />
              <div class="grid md:grid-cols-2 gap-4">
                <UInput
                  id="res-date"
                  v-model="reservationForm.date"
                  type="date"
                  label="Date"
                  required
                />
                <UInput
                  id="res-time"
                  v-model="reservationForm.time"
                  label="Time"
                  required
                >
                  <select v-model="reservationForm.time" class="w-full h-full bg-transparent">
                    <option value="">Select time</option>
                    <option v-for="h in timeSlots" :key="h" :value="h">{{ h }}</option>
                  </select>
                </UInput>
              </div>
              <UInput
                id="res-guests"
                v-model="reservationForm.guests"
                label="Guests"
                required
              >
                <select v-model="reservationForm.guests" class="w-full h-full bg-transparent">
                  <option value="">Select guests</option>
                  <option v-for="n in guestOptions" :key="n.value" :value="n.value">{{ n.label }}</option>
                </select>
              </UInput>
              <UTextarea
                id="res-requests"
                v-model="reservationForm.requests"
                label="Special Requests"
                placeholder="Dietary restrictions, seating preferences…"
                :rows="3"
              />
              <UButton type="submit" color="primary" size="lg" class="w-full">
                Make Reservation
              </UButton>
            </UForm>
          </UCard>
        </div>

        <!-- Sidebar Info -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Reservation Details</h2>

          <UCard class="bg-gray-50 rounded-lg mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
            <div class="space-y-2">
              <p class="text-gray-700"><strong>Phone:</strong> {{ contactPhone }}</p>
              <p class="text-gray-700"><strong>Email:</strong> {{ contactEmail }}</p>
            </div>
          </UCard>

          <UCard class="bg-gray-50 rounded-lg mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Reservation Policies</h3>
            <div v-html="policiesBody" />
          </UCard>

          <div class="space-y-4">
            <UButton :to="`tel:${contactPhone.replace(/\s/g, '')}`" variant="outline" size="lg" class="w-full">
              Call: {{ contactPhone }}
            </UButton>
            <UButton to="/contact" variant="ghost" size="lg" class="w-full">
              Send Message
            </UButton>
            <UButton to="/menu" variant="ghost" size="lg" class="w-full">
              View Menu
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { usePageContent } from '~/composables/usePageContent'

const { getField } = usePageContent('reservations')

const timeSlots = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
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

// Defaults in computed to avoid parse errors from embedded HTML in template expressions
const contactPhone = computed(() => getField('contact.phone', '+66 81 154 3606'))
const contactEmail = computed(() => getField('contact.email', 'info@kikuzuki-thailand.com'))
const policiesBody = computed(() => getField('policies.body',
  '<ul class="space-y-2 text-gray-700">' +
  '<li>• Reservations are held for 15 minutes</li>' +
  '<li>• Cancellations required 2 hours in advance</li>' +
  '<li>• Large parties (6+ guests) may require deposit</li>' +
  '<li>• Special dietary requests accommodated with advance notice</li>' +
  '</ul>'
))

// Reservation form data
const reservationForm = ref({
  name: '',
  email: '',
  phone: '',
  date: '',
  time: '',
  guests: '',
  requests: ''
})

const handleReservation = () => {
  // Handle reservation submission
  console.log('Reservation submitted:', reservationForm.value)
}

const { site } = await useTenantSite()

const config = useRuntimeConfig()

// Extract hostname from config for URLs
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  // Remove protocol if present to get just the hostname
  return domain.replace(/^https?:\/\//, '')
})

useSeoMeta({
  title: 'Reserve a Table | Restaurant',
  description: 'Reserve a table at our restaurant.',
  ogImage: '/og-image.jpg',
  ogUrl: `https://${site?.subdomain || 'restaurant'}.${platformHostname}/reservations`
})
</script>
