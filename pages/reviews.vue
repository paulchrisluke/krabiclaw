<template>
  <div class="min-h-screen bg-default text-default">
    <SayaHero
      title="Customer Reviews"
      subtitle="What Our Guests Say About Our Restaurant"
      size="page"
    />

    <SayaReviews
      :reviews="googleReviews"
      :rating-summary="googleReviewSummary"
      bg="white"
      padding="default"
      :show-title="false"
    />
    <AppSection v-if="googleReviews.length === 0 && isAuthenticated" bg="alt" padding="sm">
      <div class="text-center">
        <NuxtLink to="/dashboard/integrations" class="font-semibold text-default underline decoration-default underline-offset-4 hover:decoration-primary">
          Connect Google Business →
        </NuxtLink>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'saya' })
const { siteId } = await useTenantSite()
const { isAuthenticated } = useAuth()

// Validate siteId before useFetch
if (!siteId) {
  throw new Error('Missing tenant siteId')
}

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `reviews-google-business-${siteId}`,
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
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
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

// SEO Meta
const { site } = await useTenantSite()
useSeoMeta({
  title: `Reviews | ${site?.title || 'Restaurant'}`,
  description: `Read guest reviews and testimonials for ${site?.title || 'our restaurant'}.`,
  ogTitle: `Reviews | ${site?.title || 'Restaurant'}`,
  ogDescription: `Guest reviews and testimonials for ${site?.title || 'our restaurant'}.`,
  ogImage: '/og-image.jpg',
  ogUrl: '/reviews',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: `Reviews - ${site?.title || 'Restaurant'}`,
  twitterDescription: `Guest reviews for ${site?.title || 'our restaurant'}.`,
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Restaurant',
    name: 'Saya Kitchen',
    review: googleReviews.value.map(review => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: review.reviewer?.displayName || 'Google guest'
      },
      datePublished: review.createTime,
      reviewBody: googleReviewText(review),
      reviewRating: {
        '@type': 'Rating',
        ratingValue: googleReviewRating(review),
        bestRating: 5
      }
    }))
  }))
])
</script>
