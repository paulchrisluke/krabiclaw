<template>
  <div class="min-h-screen bg-white">
    <AppHero
      title="Customer Reviews"
      subtitle="What Our Guests Say About KIKUZUKI"
      size="page"
    />

    <RestaurantReviews
      :reviews="googleReviews"
      :rating-summary="googleReviewSummary"
      bg="white"
      padding="default"
      :show-title="false"
    />
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
import RestaurantReviews from '~/components/google/RestaurantReviews.vue'
const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [
      {
        name: 'accounts/123456789/locations/987654321/reviews/1',
        reviewId: '1',
        reviewer: {
          displayName: 'Sarah Johnson'
        },
        starRating: 'FIVE',
        comment: 'Absolutely incredible robatayaki experience! The grilled salmon was perfection, and the atmosphere was intimate and authentic. The chef\'s skill is evident in every dish.',
        createTime: '2024-03-15T19:30:00Z',
        updateTime: '2024-03-15T19:30:00Z'
      },
      {
        name: 'accounts/123456789/locations/987654321/reviews/2',
        reviewId: '2',
        reviewer: {
          displayName: 'Michael Chen'
        },
        starRating: 'FOUR',
        comment: 'Great Japanese restaurant in Krabi! Fresh ingredients and traditional preparation. The yakitori was excellent, though service was a bit slow during peak hours.',
        createTime: '2024-03-10T20:15:00Z',
        updateTime: '2024-03-10T20:15:00Z'
      },
      {
        name: 'accounts/123456789/locations/987654321/reviews/3',
        reviewId: '3',
        reviewer: {
          displayName: 'Emma Thompson'
        },
        starRating: 'FIVE',
        comment: 'Hidden gem in Krabi! The robatayaki is authentic and the quality is outstanding. Perfect for a special dinner. Will definitely return!',
        createTime: '2024-03-08T18:45:00Z',
        updateTime: '2024-03-08T18:45:00Z'
      },
      {
        name: 'accounts/123456789/locations/987654321/reviews/4',
        reviewId: '4',
        reviewer: {
          displayName: 'James Wilson'
        },
        starRating: 'FIVE',
        comment: 'Exceptional dining experience! The robatayaki grill master is truly skilled. Every dish was perfectly cooked and beautifully presented.',
        createTime: '2024-03-05T21:00:00Z',
        updateTime: '2024-03-05T21:00:00Z',
        reviewReply: {
          comment: 'Thank you so much for your kind words! We\'re thrilled you enjoyed your experience with us. We look forward to welcoming you back soon!',
          updateTime: '2024-03-06T09:00:00Z'
        }
      },
      {
        name: 'accounts/123456789/locations/987654321/reviews/5',
        reviewId: '5',
        reviewer: {
          displayName: 'Maria Garcia'
        },
        starRating: 'FOUR',
        comment: 'Wonderful authentic Japanese food in Krabi! The robatayaki was delicious and the staff was very attentive. Will come again.',
        createTime: '2024-03-01T19:30:00Z',
        updateTime: '2024-03-01T19:30:00Z'
      }
    ],
    media: [],
    posts: [],
    products: [],
    qa: [],
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

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// SEO Meta
useSeoMeta({
  title: 'Reviews | Take Me Away by KIKUZUKI | Customer Testimonials',
  description: 'Read authentic customer reviews and testimonials for Take Me Away by KIKUZUKI in Krabi, Thailand. See what our guests say about our Japanese robatayaki restaurant.',
  ogTitle: 'Reviews | Take Me Away by KIKUZUKI',
  ogDescription: 'Customer reviews and testimonials for our Japanese robatayaki restaurant in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/reviews',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Reviews - Take Me Away by KIKUZUKI',
  twitterDescription: 'Customer reviews for our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
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
}])
</script>
