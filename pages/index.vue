<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'tenant'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="krabiclaw-platform">
      <AppHero
        id="section-hero"
        title="KrabiClaw"
        subtitle="The AI-powered restaurant platform. Build your digital presence in minutes."
        size="home"
        bg="black"
      >
        <template #cta>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <UButton
              to="/signup"
              variant="outline"
              size="lg"
              color="neutral"
              class="text-white ring-white/50 hover:bg-white/10"
            >
              Start Free
            </UButton>
            <UButton to="/pricing" size="lg" color="neutral">View Pricing</UButton>
          </div>
        </template>
      </AppHero>

      <!-- Platform features section -->
      <AppSection id="features" bg="white" padding="xl">
        <div class="text-center mb-16">
          <h2 class="text-4xl font-bold text-stone-900 mb-4 tracking-tight">
            Everything your restaurant needs to thrive online
          </h2>
          <p class="text-xl text-stone-600 max-w-2xl mx-auto">
            Professional websites with AI-powered content, Google Business integration, and seamless reservation management.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-12">
          <UCard class="bg-stone-50 border border-stone-100">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">🎨</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-stone-900">Beautiful Themes</h3>
            <p class="text-stone-600 leading-relaxed">
              Choose from premium, conversion-optimized restaurant themes that look stunning on any device.
            </p>
          </UCard>

          <UCard class="bg-stone-50 border border-stone-100">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">🤖</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-stone-900">AI-Powered Content</h3>
            <p class="text-stone-600 leading-relaxed">
              Our AI helps you write compelling copy, generate mouth-watering descriptions, and optimize for SEO.
            </p>
          </UCard>

          <UCard class="bg-stone-50 border border-stone-100">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">📊</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-stone-900">Google Sync</h3>
            <p class="text-stone-600 leading-relaxed">
              Automatically sync your reviews, photos, and business hours directly from your Google Business Profile.
            </p>
          </UCard>
        </div>
      </AppSection>

      <!-- CTA Section -->
      <AppSection bg="black" padding="xl">
        <div class="text-center">
          <h2 class="text-4xl font-bold mb-6 italic text-white">Ready to grow your restaurant?</h2>
          <p class="text-stone-400 text-xl mb-10">Join hundreds of restaurants building their future with KrabiClaw.</p>
          <UButton
            to="/signup"
            variant="solid"
            color="neutral"
            size="lg"
            class="bg-white text-black hover:bg-white/90"
          >
            Get Started for Free
          </UButton>
        </div>
      </AppSection>
    </div>

    <!-- Saya Restaurant Theme (Tenant Site) -->
    <div v-else class="saya-restaurant-theme">
      <AppHero
        id="section-hero"
        :title="getField('hero.title', 'Your Restaurant Name')"
        :subtitle="getField('hero.subtitle', 'An Authentic Dining Experience')"
        size="home"
        :video="getFieldStr('hero.video', '/videos/hero-video.mp4')"
        :establishment-year="googleBusiness.value?.business?.establishmentYear"
      >
        <template #cta>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <UButton to="/menu" variant="solid" color="neutral" size="lg" class="bg-white text-black hover:bg-white/90">
              View Menu
            </UButton>
            <UButton v-if="hasLocations" :to="locationsCtaUrl" variant="solid" color="neutral" size="lg">
              {{ locationsCtaText }}
            </UButton>
            <UButton v-else to="/reservations" variant="solid" color="neutral" size="lg">
              Reserve a Table
            </UButton>
          </div>
        </template>
      </AppHero>

      <!-- Location Cards/Picker -->
      <AppSection v-if="hasLocations" bg="white" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Our Locations</h2>
          <p class="text-xl text-gray-600">Visit us at any of our convenient locations</p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AppCard
            v-for="location in locations"
            :key="location.id"
            variant="elevated"
            border="light"
            hoverable
            @click="navigateToLocation(location)"
          >
            <div v-if="location.image_url" class="aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
              <img
                :src="location.image_url"
                :alt="location.title"
                class="w-full h-full object-cover"
              >
            </div>
            <div v-else class="aspect-video bg-gray-100 rounded-t-lg flex items-center justify-center">
              <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <div class="p-6">
              <div class="flex items-start justify-between mb-2">
                <h3 class="text-lg font-semibold text-gray-900">{{ location.title }}</h3>
                <UBadge color="info" variant="soft" size="sm">Primary</UBadge>
              </div>

              <p v-if="location.address" class="text-gray-600 text-sm mb-3">{{ location.address }}</p>

              <div class="flex items-center text-sm text-gray-500">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {{ location.city || 'Location' }}
              </div>
            </div>
          </AppCard>
        </div>
      </AppSection>

      <!-- Featured Menu Preview -->
      <AppSection v-if="hasMenu" bg="gray" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Featured Menu</h2>
          <p class="text-xl text-gray-600">Taste our signature dishes</p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AppCard
            v-for="item in featuredMenuItems"
            :key="item.id"
            variant="elevated"
            border="light"
            hoverable
          >
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">{{ item.name }}</h3>
                <p v-if="item.description" class="text-gray-600 text-sm mt-1">{{ item.description }}</p>
              </div>
              <div v-if="item.price" class="text-lg font-bold text-gray-900 ml-4">
                {{ item.price }}
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span
                :class="[
                  'inline-flex items-center px-2 py-1 text-xs font-medium rounded',
                  item.available
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                ]"
              >
                {{ item.available ? 'Available' : 'Unavailable' }}
              </span>

              <UButton to="/menu" variant="outline" size="sm">View Full Menu</UButton>
            </div>
          </AppCard>
        </div>
      </AppSection>

      <!-- Reviews Summary -->
      <AppSection v-if="hasGoogleBusiness && googleReviewSummary" bg="white" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">What Our Guests Say</h2>
          <div class="flex items-center justify-center gap-4">
            <div class="flex items-center">
              <div class="flex text-yellow-400">
                <svg v-for="i in 5" :key="i" class="w-5 h-5 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span class="text-2xl font-bold text-gray-900 ml-2">{{ googleReviewSummary.average }}</span>
            </div>
            <span class="text-gray-600">({{ googleReviewSummary.count }} reviews)</span>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div
            v-for="review in featuredReviews"
            :key="review.id"
            class="bg-gray-50 rounded-lg p-6"
          >
            <div class="flex items-center mb-4">
              <div class="flex text-yellow-400">
                <svg v-for="i in review.rating" :key="i" class="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span class="ml-2 text-sm text-gray-600">{{ review.rating }}/5</span>
            </div>

            <p class="text-gray-700 mb-3">{{ review.content }}</p>
            <p class="text-sm text-gray-600 font-medium">{{ review.author }}</p>
          </div>
        </div>
      </AppSection>

      <!-- Posts/News -->
      <ClientOnly>
        <RestaurantPosts :posts="googlePosts" :limit="3" show-view-more description="News, events and special offers" />
      </ClientOnly>

      <!-- About teaser -->
      <ClientOnly>
        <RestaurantAbout
          :title="getField('about-teaser-title', businessTitle)"
          :image="businessPrimaryPhoto?.googleUrl"
          is-teaser
          bg="black"
          padding="xl"
        >
          <p class="text-white/80 text-lg font-light leading-relaxed">
            {{ getField('cta.description', businessSubtitle) }}
          </p>
        </RestaurantAbout>
      </ClientOnly>

      <!-- Gallery -->
      <AppSection bg="white" padding="default">
        <div class="flex items-center justify-between mb-8">
          <h2 class="text-3xl font-bold text-gray-900 italic">Gallery</h2>
          <NuxtLink to="/photos" class="text-black font-semibold hover:underline">View All Photos →</NuxtLink>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- Loaded photos -->
          <template v-if="googleMedia.length">
            <div v-for="media in googleMedia.slice(0, 4)" :key="media.name" class="aspect-square overflow-hidden rounded-2xl shadow-sm">
              <img
                :src="media.googleUrl"
                :alt="media.description || 'Restaurant Photo'"
                class="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
              >
            </div>
          </template>
          <!-- Empty state placeholders -->
          <template v-else>
            <div v-for="i in 4" :key="i" class="aspect-square bg-stone-100 rounded-2xl flex items-center justify-center">
              <span class="text-stone-300 text-xs font-medium text-center px-2">Photo from<br>Google Business</span>
            </div>
          </template>
        </div>
      </AppSection>

      <!-- Location & Hours -->
      <AppSection id="section-google" bg="gray" padding="default">
        <div class="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 class="text-3xl font-bold text-gray-900 mb-4 italic">
              Find Us{{ businessCity ? ` in ${businessCity}` : ' at Our Location' }}
            </h2>
            <div class="space-y-4 text-gray-600 mb-8">
              <!-- Address placeholder if not yet synced -->
              <div v-if="businessAddress">
                <p>{{ businessAddress }}</p>
              </div>
              <div v-else class="h-5 bg-stone-200 rounded animate-pulse w-64" />

              <div v-if="specialHoursNotice" class="flex items-start gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <span class="text-2xl">🗓️</span>
                <div>
                  <h3 class="font-bold text-amber-900 text-sm uppercase tracking-wider mb-1">Holiday Update</h3>
                  <p class="text-amber-800 text-sm font-medium">{{ specialHoursNotice }}</p>
                </div>
              </div>

              <p v-if="businessHours">{{ businessHours }}</p>
              <div v-else class="h-5 bg-stone-200 rounded animate-pulse w-48" />

              <p v-if="businessPhone">{{ businessPhone }}</p>
              <div v-else class="h-5 bg-stone-200 rounded animate-pulse w-36" />
            </div>
            <div class="flex gap-4">
              <UButton to="/location" variant="solid" color="primary" size="md">Full Location Details</UButton>
              <UButton to="/reservations" variant="outline" size="md">Reserve a Table →</UButton>
            </div>
          </div>
          <div class="rounded-3xl h-80 overflow-hidden shadow-2xl bg-stone-100">
            <iframe
              v-if="businessCoordinates"
              :src="`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d${businessCoordinates.lng}!3d${businessCoordinates.lat}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sYour%20Restaurant!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth`"
              width="100%"
              height="100%"
              style="border:0;"
              allowfullscreen=""
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <p class="text-stone-400 text-sm text-center px-4">Map will appear once<br>Google Business is linked</p>
            </div>
          </div>
        </div>
      </AppSection>

      <!-- CTA -->
      <AppSection id="section-cta" bg="black" padding="xl">
        <div class="text-center">
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6 italic">
            {{ getField('cta.title', 'Ready to Experience Our Restaurant?') }}
          </h2>
          <p class="text-white/60 mb-10 max-w-2xl mx-auto font-light">
            {{ getField('cta.description', "Whether you're joining us for a casual dinner or a special celebration, we look forward to serving you the finest cuisine.") }}
          </p>
          <div class="flex flex-col md:flex-row items-center justify-center gap-6">
            <UButton to="/reservations" variant="solid" color="neutral" size="lg" class="bg-white text-black hover:bg-stone-200">
              Book Now
            </UButton>
            <UButton to="/contact" variant="outline" color="neutral" size="lg" class="border-2 border-white/20 hover:bg-white/10">
              Contact Us
            </UButton>
          </div>
        </div>
      </AppSection>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { getTodayGoogleHours, getSpecialHoursNotice } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'
import { useTenantSite } from '~/composables/useTenantSite'
import { usePublicMenu } from '~/composables/usePublicMenu'

definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()
const { getField, getFieldStr } = usePageContent('home')

// Validate tenant context ONLY for tenant sites
if (!isPlatform && !siteId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// SEO for KrabiClaw Platform
if (isPlatform) {
  useSeoMeta({
    title: 'KrabiClaw | AI Restaurant Website Builder',
    description: 'Build your restaurant website in minutes with AI. No coding required.',
    ogTitle: 'KrabiClaw | AI Restaurant Website Builder',
    ogDescription: 'Professional restaurant websites with AI content and Google Business integration.',
    ogImage: '/og-krabiclaw.jpg',
    ogUrl: 'https://krabiclaw.com',
    ogType: 'website'
  })
}

// Get locations data (tenant-scoped) - Only if not platform
const { data: locationsData } = isPlatform
  ? { data: ref({ locations: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/locations`, {
      key: 'locations-data',
      default: () => ({ locations: [] })
    })

const locations = computed(() => locationsData.value?.locations || [])
const hasLocations = computed(() => locations.value.length > 0)

// Location CTA logic
const locationsCtaUrl = computed(() => {
  if (locations.value.length === 1) {
    return `/locations/${locations.value[0].slug}`
  }
  return '/locations'
})

const locationsCtaText = computed(() => {
  if (locations.value.length === 1) {
    return 'View Location'
  }
  return 'Choose Location'
})

// Get brand menu for preview
const {
  menu,
  hasMenu,
  menuItemsBySection
} = isPlatform ? { menu: ref(null), hasMenu: ref(false), menuItemsBySection: ref({}) } : usePublicMenu(siteId, null)

// Featured menu items (first 6 items from all sections)
const featuredMenuItems = computed(() => {
  if (!menu.value) return []
  const allItems = Object.values(menuItemsBySection.value).flat()
  return allItems.slice(0, 6)
})

// Google Business data (tenant-scoped)
const { data: googleBusiness } = isPlatform
  ? { data: ref({ business: null, reviews: [], media: [], posts: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/google-business`, {
      key: 'google-business-public',
      default: () => ({ business: null, reviews: [], media: [], posts: [] })
    })

const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

const businessTitle = computed(() => googleBusiness.value?.business?.title || 'Your Restaurant')
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description || 'Authentic Japanese Robatayaki Experience in Krabi')
const businessPrimaryPhoto = computed(() => googleBusiness.value?.media?.[0])
const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`.replace(/^,\s*/, '')
})
const businessCity = computed(() => googleBusiness.value?.business?.storefrontAddress?.locality || '')
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHours = computed(() => getTodayGoogleHours(googleBusiness.value?.business?.regularHours))
const specialHoursNotice = computed(() => getSpecialHoursNotice(googleBusiness.value?.business?.specialHours))
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const googleMedia = computed(() => googleBusiness.value?.media || [])
const businessCoordinates = computed(() => {
  const coords = googleBusiness.value?.business?.latlng
  return coords ? { lat: coords.latitude, lng: coords.longitude } : null
})
const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)
const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (ratings.length === 0) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  return { average: Number(summary.averageRating).toFixed(1), count: summary.totalReviewCount }
})

const hasGoogleBusiness = computed(() => !!googleBusiness.value?.business)
const featuredReviews = computed(() => googleReviews.value.slice(0, 3))

// Navigate to location
const navigateToLocation = (location) => {
  navigateTo(`/locations/${location.slug}`)
}

if (!isPlatform) {
  useSeoMeta({
    title: 'KrabiClaw | Beautiful Restaurant Websites. Powered by AI.',
    description: 'Build your restaurant website in minutes with KrabiClaw. Professional themes, Google Business integration, and AI-powered content.',
    ogTitle: 'KrabiClaw | Beautiful Restaurant Websites. Powered by AI.',
    ogDescription: 'Professional restaurant websites with AI-powered content and Google Business integration.',
    ogImage: '/og-image.jpg',
    ogUrl: 'https://krabiclaw.com',
    ogType: 'website'
  })
}
</script>
