<template>
  <div class="min-h-screen bg-white">
    <SayaHero :title="getField('hero.title', 'Location & Hours')" :subtitle="getField('hero.subtitle', 'Visit Us in your city')" size="page" :establishment-year="googleBusiness?.business?.establishmentYear" />
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-12">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Find Us</h2>
        <div class="aspect-video overflow-hidden rounded-2xl bg-(--ui-bg-muted)">
          <div class="flex h-full w-full items-center justify-center">
            <div class="px-8 text-center">
              <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white text-gray-900 shadow-sm">
                <UIcon name="i-simple-icons-googlemaps" class="size-7" />
              </div>
              <p class="text-base font-semibold text-gray-900">Google Maps will appear here</p>
              <p class="mt-2 text-sm text-gray-500">Connect Google Business to sync verified directions.</p>
            </div>
          </div>
        </div>
        <div class="mt-4 text-center">
          <span class="inline-block cursor-not-allowed rounded-full border border-stone-200 px-6 py-3 font-semibold text-gray-400">Get Directions →</span>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-12 mb-12">
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Restaurant</h3>
              <p class="text-gray-700 text-lg">{{ getField('businessName', businessName) || 'Connect Google Business' }}</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Address</h3>
              <p class="text-gray-700 text-lg">
                {{ getField('address', businessAddress) || 'Connect Google Business' }}
                <span v-if="!getField('address', businessAddress)" class="text-sm text-gray-400 block">Connect Google Business to sync the verified address.</span>
              </p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 uppercase tracking-wider text-xs">Phone</h3>
              <p class="text-gray-700 text-lg">
                {{ getField('phoneNumber', businessPhone) || 'Connect Google Business' }}
                <span v-if="!getField('phoneNumber', businessPhone)" class="text-sm text-gray-400 block">Connect Google Business to sync the verified phone number.</span>
              </p>
            </div>
          </div>
          <div v-if="parkingInfo" class="mt-8">
            <h3 class="font-semibold text-gray-900 mb-2 uppercase tracking-wider text-xs">Parking</h3>
            <div v-html="parkingInfo" class="text-gray-600 text-sm" />
          </div>
          <div v-if="extraNotes" class="mt-4">
            <h3 class="font-semibold text-gray-900 mb-2 uppercase tracking-wider text-xs">Additional Notes</h3>
            <div v-html="extraNotes" class="text-gray-600 text-sm" />
          </div>
        </div>
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Opening Hours</h2>
          <div class="bg-stone-50 rounded-2xl p-8 border border-stone-200">
            <table class="w-full">
              <tbody>
                <tr v-for="hour in (businessHoursFormatted.length > 0 ? businessHoursFormatted : defaultHours)" :key="hour.day" class="border-b border-stone-100 last:border-0">
                  <td class="py-3 text-gray-600 font-medium">{{ hour.day }}</td>
                  <td class="py-3 text-right text-gray-900">
                    {{ hour.hours }}
                    <span v-if="businessHoursFormatted.length === 0" class="text-sm text-gray-400 block">Connect Google Business to keep hours fresh.</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
definePageMeta({ layout: 'tenant' })
import { formatGoogleHours } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'
import { useTenantSite } from '~/composables/useTenantSite'

const { getField } = usePageContent('location')

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `location-google-business-${siteId}`,
  default: () => ({ business: null, media: [] })
})
const businessName = computed(() => googleBusiness.value?.business?.title || '')
const businessAddress = computed(() => { const a = googleBusiness.value?.business?.storefrontAddress; return a ? `${a.addressLines?.[0] || ''}, ${a.locality || ''}, ${a.administrativeArea || ''} ${a.postalCode || ''}` : '' })
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHoursFormatted = computed(() => formatGoogleHours(googleBusiness.value?.business?.regularHours))

// Default hours for when Google Business data is not available
const defaultHours = [
  { day: 'Monday', hours: '5:00 PM - 10:00 PM' },
  { day: 'Tuesday', hours: '5:00 PM - 10:00 PM' },
  { day: 'Wednesday', hours: '5:00 PM - 10:00 PM' },
  { day: 'Thursday', hours: '5:00 PM - 10:00 PM' },
  { day: 'Friday', hours: '5:00 PM - 11:00 PM' },
  { day: 'Saturday', hours: '5:00 PM - 11:00 PM' },
  { day: 'Sunday', hours: '5:00 PM - 10:00 PM' }
]

const parkingInfo = computed(() => getField('parking.info', ''))
const extraNotes = computed(() => getField('extra.notes', ''))
useSeoMeta({ 
  title: `Location & Hours | ${getField('businessName', businessName) || 'Restaurant'}`, 
  description: `Find ${getField('businessName', businessName) || 'our restaurant'} in ${getField('city', googleBusiness.value?.business?.storefrontAddress?.locality) || 'your area'} and view current opening hours.`, 
  ogImage: getField('ogImage', '/og-image.jpg'), 
  ogUrl: '/location' 
})
</script>
