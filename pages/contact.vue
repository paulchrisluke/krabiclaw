<template>
  <div>
    <AppHero
      :title="getField('hero.title', 'Contact Us')"
      :subtitle="getField('hero.subtitle', 'Get in Touch with Your Restaurant')"
      size="page"
      :establishment-year="googleBusiness.value?.business?.establishmentYear"
    />
    <UContainer class="py-12">
      <UCard class="mb-12">
        <div v-html="introBody" class="prose prose-lg max-w-none text-gray-700" />
      </UCard>

      <div class="grid md:grid-cols-2 gap-12">
        <!-- Contact Details -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div v-if="businessName">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Restaurant</h3>
              <p class="text-gray-700">{{ businessName }}</p>
            </div>
            <div v-if="businessAddress">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Address</h3>
              <p class="text-gray-700">{{ businessAddress }}</p>
            </div>
            <div v-if="businessPhone">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Phone</h3>
              <p class="text-gray-700">{{ businessPhone }}</p>
            </div>
            <div v-if="businessHours">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Opening Hours</h3>
              <p class="text-gray-700">{{ businessHours }}</p>
            </div>
          </div>
          <div class="mt-8">
            <h3 class="font-semibold text-gray-900 mb-4">Follow Us</h3>
            <div class="flex space-x-4">
              <a :href="getField('social.facebook', '#')" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900">Facebook</a>
              <a :href="getField('social.instagram', '#')" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900">Instagram</a>
            </div>
          </div>
        </div>

          <!-- Contact Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Send Us a Message</h2>
          <UCard>
            <UForm class="space-y-4" @submit.prevent>
              <UFormField label="Name">
                <UInput type="text" id="name" name="name" />
              </UFormField>
              <UFormField label="Email">
                <UInput type="email" id="email" name="email" />
              </UFormField>
              <UFormField label="Message">
                <UTextarea id="message" name="message" :rows="4" />
              </UFormField>
              <UButton type="submit" color="neutral" size="md" block>
                Send Message
              </UButton>
            </UForm>
          </UCard>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-12 grid md:grid-cols-2 gap-6">
        <UCard to="/reservations" class="hover:shadow-md transition-shadow cursor-pointer">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Make a Reservation</h3>
          <p class="text-gray-700">Book your table online or call us directly</p>
        </UCard>
        <UCard to="/location" class="hover:shadow-md transition-shadow cursor-pointer">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Find Us</h3>
          <p class="text-gray-700">Get directions and view our location on Google Maps</p>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { getTodayGoogleHours } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'

const { getField } = usePageContent('contact')

const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  key: 'google-business-public',
  default: () => ({ business: null })
})

const businessName = computed(() => googleBusiness.value?.business?.title || '')
const businessAddress = computed(() => {
  const a = googleBusiness.value?.business?.storefrontAddress
  return a ? `${a.addressLines?.[0] || ''}, ${a.locality || ''}, ${a.administrativeArea || ''} ${a.postalCode || ''}` : ''
})
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHours = computed(() => getTodayGoogleHours(googleBusiness.value?.business?.regularHours))

// Default moved to computed to avoid inline quote escaping issues
const introBody = computed(() => getField('intro.body',
  '<p class="mb-4 leading-relaxed">For an unparalleled culinary experience, our restaurant beckons you to transcend the virtual and savor the exquisite reality. Our website offers a glimpse of the gastronomic symphony that awaits—robust grills and artful creations.</p>' +
  '<p class="mb-4 leading-relaxed">Contact us to transform your online curiosity into a reservation, immersing yourself in the warm ambiance, skilled craftsmanship, and tantalizing flavors.</p>' +
  '<p class="font-semibold leading-relaxed">Elevate your senses; contact us for an unforgettable dining adventure.</p>'
))

useSeoMeta({
  title: 'Contact | Restaurant Website',
  description: 'Contact our restaurant. Get our phone number, address, and send us a message.',
  ogImage: '/og-image.jpg',
  ogUrl: '/contact'
})
</script>
