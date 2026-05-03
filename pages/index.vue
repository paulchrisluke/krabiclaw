<template>
  <div>
    <!-- Hero -->
    <AppHero
      title="Take Me Away by KIKUZUKI"
      subtitle="Authentic Japanese Robatayaki Izakaya in Krabi, Thailand"
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

    <!-- Featured dishes -->
    <AppSection bg="white" padding="default">
      <h2 class="text-3xl font-bold text-gray-900 mb-2">Featured Dishes</h2>
      <p class="text-gray-500 mb-8">Signature robatayaki from our kitchen</p>
      <div class="divide-y divide-gray-100">
        <MenuItemCard
          v-for="item in featuredItems"
          :key="item.id"
          :item="item"
        />
      </div>
      <div class="mt-8">
        <AppButton to="/menu" variant="primary" size="md">
          View Full Menu →
        </AppButton>
      </div>
    </AppSection>

    <RestaurantReviews
      :reviews="googleReviews"
      :rating-summary="googleReviewSummary"
    />

    <!-- About teaser -->
    <AppSection bg="black" padding="default">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold text-white mb-4">The Art of Robatayaki</h2>
          <p class="text-white/70 mb-6 leading-relaxed">
            Robatayaki — meaning "fireside cooking" — is a centuries-old Japanese grilling tradition.
            At KIKUZUKI, skilled chefs grill premium meats, fresh seafood, and seasonal vegetables
            over an open charcoal flame, right before your eyes.
          </p>
          <AppButton to="/about" variant="white" size="md">Our Story</AppButton>
        </div>
        <div class="bg-white/10 rounded-lg h-64 flex items-center justify-center">
          <span class="text-white/30 text-sm">PLACEHOLDER_ABOUT_IMAGE</span>
        </div>
      </div>
    </AppSection>

    <!-- Location teaser -->
    <AppSection bg="gray" padding="default">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Find Us in Krabi</h2>
          <div class="space-y-3 text-gray-600 mb-6">
            <p>📍 Krabi Province, Southern Thailand 81000</p>
            <p>🕙 Daily: 10:00 – 22:00</p>
            <p>📞 +66-76-XXX-XXXX</p>
          </div>
          <div class="flex gap-4">
            <AppButton to="/location" variant="primary" size="md">
              Get Directions
            </AppButton>
            <AppButton to="/reservations" variant="secondary" size="md">
              Reserve →
            </AppButton>
          </div>
        </div>
        <div class="rounded-lg h-64 overflow-hidden">
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
      </div>
    </AppSection>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'
import AppHero from '~/components/ui/AppHero.vue'
import AppButton from '~/components/ui/AppButton.vue'
import AppSection from '~/components/ui/AppSection.vue'
import MenuItemCard from '~/components/menu/MenuItemCard.vue'
import RestaurantReviews from '~/components/google/RestaurantReviews.vue'

definePageMeta({
  layout: 'home'
})

const featuredItems = computed(() =>
  menuData.categories
    .flatMap(c => c.items)
    .filter(i => i.featured)
    .slice(0, 4)
)

const { data: googleBusiness } = await useFetch('/api/google-business/public', {
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

const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)
const googleReviewText = review => typeof review.comment === 'string'
  ? review.comment
  : review.comment?.text ?? ''

const googleReviewSummary = computed(() => {
  const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
  if (ratings.length === 0) return null

  return {
    average: (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1),
    count: ratings.length
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
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'Take Me Away by KIKUZUKI',
    description: 'Authentic Japanese robatayaki izakaya in Krabi, Thailand offering fresh ingredients and traditional flavors',
    url: 'https://www.kikuzuki-thailand.com',
    telephone: '+66-81-154-3606',
    email: 'info@kikuzuki-thailand.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '117, Nong Thale',
      addressLocality: 'Krabi',
      addressRegion: 'Krabi Province',
      postalCode: '81000',
      addressCountry: 'TH'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 8.0572977,
      longitude: 98.7493211
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Sunday'],
        opens: '12:00',
        closes: '22:30'
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '12:00',
        closes: '22:30'
      }
    ],
    priceRange: '$$',
    servesCuisine: ['Japanese', 'Robatayaki', 'Izakaya'],
    hasMap: 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
    sameAs: [
      'https://www.facebook.com/kikuzuki-thailand',
      'https://www.instagram.com/kikuzuki-thailand'
    ]
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
