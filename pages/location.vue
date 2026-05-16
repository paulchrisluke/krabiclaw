<template>
  <div class="min-h-screen bg-default">
    <SayaHero :title="getField('hero.title', 'Location & Hours')" :subtitle="getField('hero.subtitle', 'Visit Us in your city')" size="page" :establishment-year="googleBusiness?.business?.establishmentYear" />
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-12">
        <h2 class="text-2xl md:text-3xl font-bold text-highlighted mb-6">Find Us</h2>
        <div class="aspect-video overflow-hidden rounded-2xl border border-default">
          <iframe
            v-if="mapEmbedSrc"
            :src="mapEmbedSrc"
            title="Location map"
            width="100%"
            height="100%"
            style="border:0"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          />
          <div v-else class="flex h-full w-full flex-col items-center justify-center bg-muted gap-3">
            <UIcon name="i-simple-icons-googlemaps" class="size-8 text-muted" />
            <span class="text-sm text-muted">Google Maps will appear once synced</span>
          </div>
        </div>
        <div class="mt-4 text-center">
          <button disabled type="button" class="inline-block cursor-not-allowed rounded-full border border-default px-6 py-3 font-semibold text-dimmed">Get Directions →</button>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-12 mb-12">
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-highlighted mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div>
              <h3 class="font-semibold text-highlighted mb-1 uppercase tracking-wider text-xs">Restaurant</h3>
              <p class="text-default text-lg">{{ getField('businessName', businessName) || 'Connect Google Business' }}</p>
            </div>
            <div>
              <h3 class="font-semibold text-highlighted mb-1 uppercase tracking-wider text-xs">Address</h3>
              <p class="text-default text-lg">
                {{ getField('address', businessAddress) || 'Connect Google Business' }}
                <span v-if="!getField('address', businessAddress)" class="text-sm text-dimmed block">Connect Google Business to sync the verified address.</span>
              </p>
            </div>
            <div>
              <h3 class="font-semibold text-highlighted mb-1 uppercase tracking-wider text-xs">Phone</h3>
              <p class="text-default text-lg">
                {{ getField('phoneNumber', businessPhone) || 'Connect Google Business' }}
                <span v-if="!getField('phoneNumber', businessPhone)" class="text-sm text-dimmed block">Connect Google Business to sync the verified phone number.</span>
              </p>
            </div>
          </div>
          <div v-if="parkingInfo" class="mt-8">
            <h3 class="font-semibold text-highlighted mb-2 uppercase tracking-wider text-xs">Parking</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="parkingInfo" class="text-muted text-sm" />
          </div>
          <div v-if="extraNotes" class="mt-4">
            <h3 class="font-semibold text-highlighted mb-2 uppercase tracking-wider text-xs">Additional Notes</h3>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="extraNotes" class="text-muted text-sm" />
          </div>
        </div>
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-highlighted mb-6">Opening Hours</h2>
          <div class="bg-muted rounded-2xl p-8 border border-default">
            <table class="w-full">
              <tbody>
                <tr v-for="hour in (businessHoursFormatted.length > 0 ? businessHoursFormatted : defaultHours)" :key="hour.day" class="border-b border-default last:border-0">
                  <td class="py-3 text-muted font-medium">{{ hour.day }}</td>
                  <td class="py-3 text-right text-highlighted">
                    {{ hour.hours }}
                  </td>
                </tr>
              </tbody>
            </table>
            <span v-if="businessHoursFormatted.length === 0" class="mt-3 block text-sm text-dimmed">Connect Google Business to keep hours fresh.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
definePageMeta({ layout: 'saya' })
import { formatGoogleHours } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'
import { useTenantSite } from '~/composables/useTenantSite'
// import DOMPurify from 'isomorphic-dompurify'
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: s => s }


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

const mapEmbedSrc = computed(() => {
  const biz = googleBusiness.value?.business
  if (!biz) return null

  // 1. Coordinates
  if (biz.latlng?.latitude != null && biz.latlng?.longitude != null) {
    return `https://maps.google.com/maps?q=${biz.latlng.latitude},${biz.latlng.longitude}&output=embed`
  }

  // 2. CID from mapsUri
  const mapsUri = biz.mapsUri
  if (mapsUri) {
    try {
      const url = new URL(mapsUri)
      const cid = url.searchParams.get('cid')
      if (cid) {
        return `https://maps.google.com/maps?cid=${cid}&output=embed`
      }
    } catch (_e) {
      // ignore
    }
  }

  // 3. Address
  const addr = biz.storefrontAddress?.addressLines?.[0]
  if (addr) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(String(addr))}&output=embed`
  }
  return null
})

const parkingInfo = computed(() => {
  const raw = getField('parking.info', '')
  if (!raw || typeof raw !== 'string') return ''
  return DOMPurify.sanitize(raw)
})
const extraNotes = computed(() => {
  const raw = getField('extra.notes', '')
  if (!raw || typeof raw !== 'string') return ''
  return DOMPurify.sanitize(raw)
})
useSeoMeta({ 
  title: `Location & Hours | ${getField('businessName', businessName) || 'Restaurant'}`, 
  description: `Find ${getField('businessName', businessName) || 'our restaurant'} in ${getField('city', googleBusiness.value?.business?.storefrontAddress?.locality) || 'your area'} and view current opening hours.`, 
  ogImage: getField('ogImage', '/og-image.jpg'), 
  ogUrl: '/location' 
})
</script>
