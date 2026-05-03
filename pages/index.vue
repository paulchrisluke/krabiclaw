<template>
  <div>
    <!-- Hero -->
    <AppHero
      :title="businessTitle"
      :subtitle="businessSubtitle"
      size="home"
      video="/videos/hero-video.mp4"
    >
      <template #cta>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <AppButton to="/menu" variant="white" size="lg">View Menu</AppButton>
          <AppButton to="/reservations" variant="black" size="lg">Reserve a Table</AppButton>
        </div>
      </template>
    </AppHero>

    <!-- Latest Updates -->
    <RestaurantPosts
      :posts="googlePosts"
      :limit="3"
      show-view-more
      description="News, events and special offers from KIKUZUKI"
    />

    <RestaurantReviews
      :reviews="googleReviews"
      :rating-summary="googleReviewSummary"
      :limit="3"
      show-view-more
    />

    <!-- Q&A Preview -->
    <RestaurantQA
      :qa="googleBusiness.qa"
      :limit="2"
      show-view-more
      bg="gray"
      description="Frequently asked questions from our guests"
    />

    <!-- About teaser -->
    <RestaurantAbout
      :title="businessTitle"
      :description="businessSubtitle"
      :image="businessPrimaryPhoto?.googleUrl"
      is-teaser
      bg="black"
      padding="xl"
    />

    <!-- Photos Preview -->
    <AppSection bg="white" padding="default">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-3xl font-bold text-gray-900">Gallery</h2>
        <NuxtLink to="/photos" class="text-black font-semibold hover:underline">View All Photos →</NuxtLink>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="(media, index) in googleBusiness.media.slice(0, 4)" :key="media.name" class="aspect-square overflow-hidden rounded-2xl shadow-sm">
          <img :src="media.googleUrl" :alt="media.description || 'KIKUZUKI'" class="w-full h-full object-cover hover:scale-110 transition-transform duration-500">
        </div>
        <div v-if="!googleBusiness.media.length" v-for="i in 4" :key="i" class="aspect-square bg-stone-100 rounded-2xl animate-pulse"></div>
      </div>
    </AppSection>

    <!-- Location & Hours -->
    <AppSection bg="gray" padding="default">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Find Us in {{ businessCity || 'Krabi' }}</h2>
          <div class="space-y-6 text-gray-600 mb-8">
            <div v-if="businessAddress" class="flex items-start gap-4">
              <span class="text-2xl">📍</span>
              <div>
                <h3 class="font-bold text-gray-900 text-sm uppercase tracking-wider mb-1">Address</h3>
                <p>{{ businessAddress }}</p>
              </div>
            </div>
            
            <!-- Special Hours Notice -->
            <div v-if="specialHoursNotice" class="flex items-start gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 mb-6">
              <span class="text-2xl">🗓️</span>
              <div>
                <h3 class="font-bold text-amber-900 text-sm uppercase tracking-wider mb-1">Holiday Update</h3>
                <p class="text-amber-800 text-sm font-medium">{{ specialHoursNotice }}</p>
              </div>
            </div>

            <div v-if="businessHours" class="flex items-start gap-4">
              <span class="text-2xl">🕙</span>
              <div>
                <h3 class="font-bold text-gray-900 text-sm uppercase tracking-wider mb-1">Today's Hours</h3>
                <p>{{ businessHours }}</p>
              </div>
            </div>
            
            <div class="flex items-start gap-4">
              <span class="text-2xl">📞</span>
              <div>
                <h3 class="font-bold text-gray-900 text-sm uppercase tracking-wider mb-1">Phone</h3>
                <a :href="'tel:' + (businessPhone || '+66811543606')" class="text-blue-600 hover:underline">
                  {{ businessPhone || '+66 81 154 3606' }}
                </a>
              </div>
            </div>
          </div>
          <div class="flex gap-4">
            <AppButton to="/location" variant="primary" size="md">
              Full Location Details
            </AppButton>
            <AppButton to="/reservations" variant="secondary" size="md">
              Reserve a Table →
            </AppButton>
          </div>
        </div>
        <div class="rounded-3xl h-80 overflow-hidden shadow-2xl">
          <iframe 
            v-if="businessCoordinates"
            :src="`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d${businessCoordinates.lng}!3d${businessCoordinates.lat}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sTake%20Me%20Away%20by%20KIKUZUKI!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth`"
            width="100%" 
            height="100%" 
            style="border:0;" 
            allowfullscreen="" 
            loading="lazy" 
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
          <div v-else class="h-full bg-stone-200 flex items-center justify-center">
            <span class="text-stone-400 italic">Location preview...</span>
          </div>
        </div>
      </div>
    </AppSection>

    <!-- Contact CTA -->
    <AppSection bg="black" padding="large">
      <div class="text-center">
        <h2 class="text-3xl md:text-5xl font-bold text-white mb-6 italic">Ready to Experience KIKUZUKI?</h2>
        <p class="text-white/60 mb-10 max-w-2xl mx-auto">
          Whether you're joining us for a casual dinner or a special celebration, we look forward to serving you the finest Japanese cuisine in Krabi.
        </p>
        <div class="flex flex-col md:flex-row items-center justify-center gap-6">
          <NuxtLink 
            to="/reservations" 
            class="bg-white text-black px-10 py-4 rounded-full font-bold text-lg hover:bg-stone-200 transition-all transform hover:scale-105"
          >
            Book Now
          </NuxtLink>
          <NuxtLink 
            to="/contact" 
            class="text-white border-2 border-white/20 px-10 py-4 rounded-full font-bold text-lg hover:bg-white/10 transition-all"
          >
            Contact Us
          </NuxtLink>
        </div>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'
import AppHero from '~/components/ui/AppHero.vue'
import AppButton from '~/components/ui/AppButton.vue'
import AppSection from '~/components/ui/AppSection.vue'
import RestaurantReviews from '~/components/google/RestaurantReviews.vue'
import RestaurantPosts from '~/components/google/RestaurantPosts.vue'
import RestaurantQA from '~/components/google/RestaurantQA.vue'
import RestaurantAbout from '~/components/google/RestaurantAbout.vue'
import { getTodayGoogleHours, getSchemaOpeningHours, getSpecialHoursNotice } from '~/utils/formatters'

definePageMeta({
  layout: 'home'
})

const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  key: 'google-business-public',
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    errors: [],
    syncedAt: null
  })
})

const starRatingMap = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
}

// Business data computed properties
const businessTitle = computed(() => googleBusiness.value?.business?.title || 'Take Me Away by KIKUZUKI')
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description || 'Authentic Japanese Robatayaki Experience in Krabi')
const businessDescription = computed(() => googleBusiness.value?.business?.profile?.description || '')
const businessPrimaryPhoto = computed(() => googleBusiness.value?.media?.[0])
const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`
})
const businessCity = computed(() => googleBusiness.value?.business?.storefrontAddress?.locality || '')
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHours = computed(() => getTodayGoogleHours(googleBusiness.value?.business?.regularHours))
const specialHoursNotice = computed(() => getSpecialHoursNotice(googleBusiness.value?.business?.specialHours))
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const latestPosts = computed(() => googlePosts.value.slice(0, 3))
const businessCoordinates = computed(() => {
  const coords = googleBusiness.value?.business?.latlng
  return coords ? { lat: coords.latitude, lng: coords.longitude } : null
})

const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)
const googleReviewText = review => typeof review.comment === 'string'
  ? review.comment
  : review.comment?.text ?? ''

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    // Fallback to calculation if official summary is missing
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (ratings.length === 0) return null
    return {
      average: (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1),
      count: ratings.length
    }
  }

  return {
    average: Number(summary.averageRating).toFixed(1),
    count: summary.totalReviewCount
  }
})

useSeoMeta({
  title: 'Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya in Krabi',
  description: 'Experience authentic Japanese robatayaki at Take Me Away by KIKUZUKI in Krabi, Thailand. Fresh ingredients, traditional flavors, and unforgettable dining experience in southern Thailand.',
  ogTitle: 'Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya in Krabi',
  ogDescription: 'Authentic Japanese robatayaki izakaya in Krabi, Thailand. Fresh ingredients, traditional flavors, and unforgettable dining experience.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Take Me Away by KIKUZUKI - Japanese Robatayaki Izakaya',
  twitterDescription: 'Experience authentic Japanese robatayaki in beautiful Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

const restaurantStructuredData = computed(() => {
  const business = googleBusiness.value?.business
  const addr = business?.storefrontAddress
  const coords = business?.latlng

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: business?.title || 'Take Me Away by KIKUZUKI',
    image: googleBusiness.value?.media?.slice(0, 5).map(m => m.googleUrl) || ['/og-image.jpg'],
    '@id': 'https://www.kikuzuki-thailand.com',
    url: 'https://www.kikuzuki-thailand.com',
    telephone: business?.phoneNumbers?.[0]?.phoneNumber || '+66 81 154 3606',
    address: {
      '@type': 'PostalAddress',
      streetAddress: addr?.addressLines?.[0] || '117, Nong Thale',
      addressLocality: addr?.locality || 'Krabi',
      addressRegion: addr?.administrativeArea || 'Krabi Province',
      postalCode: addr?.postalCode || '81000',
      addressCountry: 'TH'
    },
    geo: coords ? {
      '@type': 'GeoCoordinates',
      latitude: coords.latitude,
      longitude: coords.longitude
    } : {
      '@type': 'GeoCoordinates',
      latitude: 8.0572977,
      longitude: 98.7493211
    },
    openingHoursSpecification: getSchemaOpeningHours(business?.regularHours),
    priceRange: business?.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE' ? '$$$$' :
                business?.priceLevel === 'PRICE_LEVEL_EXPENSIVE' ? '$$$' :
                business?.priceLevel === 'PRICE_LEVEL_MODERATE' ? '$$' : '$',
    servesCuisine: [
      business?.categories?.primaryCategory?.displayName,
      ...(business?.categories?.additionalCategories?.map(c => c.displayName) || [])
    ].filter(Boolean),
    hasMap: business?.metadata?.mapsUri || 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
    hasMenu: 'https://www.kikuzuki-thailand.com/menu',
    mainEntityOfPage: 'https://www.kikuzuki-thailand.com',
    sameAs: [
      'https://www.facebook.com/kikuzuki-thailand',
      'https://www.instagram.com/kikuzuki-thailand'
    ]
  }

  // Add Menu Schema if products exist
  const products = googleBusiness.value?.products || []
  if (products.length > 0) {
    schema.hasMenu = {
      '@type': 'Menu',
      name: 'KIKUZUKI Menu',
      mainEntityOfPage: 'https://www.kikuzuki-thailand.com/menu',
      hasMenuSection: [
        {
          '@type': 'MenuSection',
          name: 'Signature Dishes',
          hasMenuItem: products.slice(0, 10).map(p => ({
            '@type': 'MenuItem',
            name: p.title,
            description: p.description,
            offers: p.price ? {
              '@type': 'Offer',
              price: p.price.toString(),
              priceCurrency: 'THB'
            } : undefined,
            image: p.media?.[0]?.googleUrl
          }))
        }
      ]
    }
  }

  if (googleReviewSummary.value) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: googleReviewSummary.value.average,
      reviewCount: String(googleReviewSummary.value.count)
    }
    schema.review = googleReviews.value
      .filter(review => googleReviewText(review))
      .slice(0, 3)
      .map(review => ({
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: review.reviewer?.displayName ?? 'Google guest'
        },
        datePublished: review.createTime,
        reviewBody: googleReviewText(review),
        reviewRating: {
          '@type': 'Rating',
          ratingValue: googleReviewRating(review),
          bestRating: 5
        }
      }))
  }

  return schema
})

useHead(() => ({
  script: [
    {
      key: 'restaurant-google-business-schema',
      type: 'application/ld+json',
      innerHTML: JSON.stringify(restaurantStructuredData.value)
    }
  ]
}))
</script>
