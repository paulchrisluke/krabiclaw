<template>
  <div class="min-h-screen bg-white">
    <AppHero
      title="Location & Hours"
      subtitle="Visit Us in Krabi, Thailand"
      size="page"
    />

    <!-- Map Section -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-12">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Find Us</h2>
        <div class="aspect-video bg-gray-200 rounded-lg overflow-hidden">
          <iframe 
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d98.7493211!3d8.0572977!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sTake%20Me%20Away%20by%20KIKUZUKI!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth" 
            width="100%" 
            height="100%" 
            style="border:0;" 
            allowfullscreen="" 
            loading="lazy" 
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
        <div class="mt-4 text-center">
          <a 
            href="https://maps.app.goo.gl/2KJfCAfH1idnRBqz6" 
            target="_blank" 
            rel="noopener noreferrer"
            class="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            Get Directions →
          </a>
        </div>
      </div>

      <!-- NAP Section -->
      <div class="grid md:grid-cols-2 gap-12 mb-12">
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div v-if="businessName">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Restaurant</h3>
              <p class="text-gray-700 text-lg">{{ businessName }}</p>
            </div>
            <div v-if="businessAddress">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Address</h3>
              <p class="text-gray-700 text-lg">{{ businessAddress }}</p>
            </div>
            <div v-if="businessPhone">
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Phone</h3>
              <p class="text-gray-700 text-lg">{{ businessPhone }}</p>
            </div>
          </div>
        </div>

        <!-- Hours Section -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Opening Hours</h2>
          <div v-if="businessHoursFormatted" class="bg-stone-50 rounded-2xl p-8 border border-stone-200">
            <table class="w-full">
              <tbody>
                <tr v-for="hour in businessHoursFormatted" :key="hour.day" class="border-b border-stone-100 last:border-0">
                  <td class="py-3 text-gray-600 font-medium">{{ hour.day }}</td>
                  <td class="py-3 text-right text-gray-900">{{ hour.hours }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="bg-gray-50 rounded-2xl p-8 text-center border border-dashed border-gray-200">
            <p class="text-gray-400 italic">Hours updated via Google Business Profile</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    products: [],
    qa: [],
    errors: [],
    syncedAt: null
  })
})

// Business data computed properties
const businessName = computed(() => googleBusiness.value?.business?.title || '')
const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`
})
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHoursFormatted = computed(() => formatGoogleHours(googleBusiness.value?.business?.regularHours))

// SEO Meta
useSeoMeta({
  title: 'Location & Hours | Take Me Away by KIKUZUKI | Krabi, Thailand',
  description: 'Find Take Me Away by KIKUZUKI in Krabi, Thailand. Get directions, view our location on Google Maps, and check our opening hours.',
  ogTitle: 'Location & Hours | Take Me Away by KIKUZUKI',
  ogDescription: 'Visit our Japanese robatayaki izakaya in Krabi, Thailand. View location, hours, and get directions.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/location',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Location & Hours - Take Me Away by KIKUZUKI',
  twitterDescription: 'Find our Japanese restaurant in Krabi, Thailand with directions and hours.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: businessName.value || 'Take Me Away by KIKUZUKI',
  hasMap: 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
  address: {
    '@type': 'PostalAddress',
    streetAddress: businessAddress.value || 'Southern Thailand',
    addressLocality: googleBusiness.value?.business?.storefrontAddress?.locality || 'Krabi',
    addressRegion: googleBusiness.value?.business?.storefrontAddress?.administrativeArea || 'Krabi Province',
    postalCode: googleBusiness.value?.business?.storefrontAddress?.postalCode || '81000',
    addressCountry: 'TH'
  },
  geo: { 
    '@type': 'GeoCoordinates', 
    latitude: googleBusiness.value?.business?.latlng?.latitude || 8.0572977, 
    longitude: googleBusiness.value?.business?.latlng?.longitude || 98.7493211 
  },
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    opens: '10:00',
    closes: '22:00'
  }],
  telephone: businessPhone.value || '+66-76-XXX-XXXX'
}])
</script>
