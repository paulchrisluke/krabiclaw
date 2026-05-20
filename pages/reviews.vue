<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Reviews</p>
      <h1 class="saya-display-md text-default">
        <template v-if="googleReviewSummary">
          <span class="flex flex-wrap items-center gap-4">
            <UIcon name="i-heroicons-star-solid" class="size-8 text-primary" />
            {{ googleReviewSummary.average }}
            <span class="text-muted">· {{ googleReviewSummary.count?.toLocaleString() }} reviews</span>
          </span>
        </template>
        <em v-else class="saya-italic">What guests are saying</em>
      </h1>
    </header>
    <SayaReviews :reviews="googleReviews" :rating-summary="googleReviewSummary" :show-title="false" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { googleBusiness } = useBootstrap()
const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = r => starRatingMap[r.starRating] ?? Number(r.starRating ?? r.rating ?? 0)

const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (!ratings.length) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  const average = Number(summary.averageRating)
  if (!Number.isFinite(average) || average <= 0) return null
  return { average: average.toFixed(1), count: summary.totalReviewCount }
})

const restaurantName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Restaurant')

const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/reviews')
useSeoMeta({
  title: computed(() => `Reviews | ${restaurantName.value}`),
  description: computed(() => `Guest reviews for ${restaurantName.value}.`),
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Restaurant',
    name: restaurantName.value,
    review: googleReviews.value.map(r => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.reviewer?.displayName || 'Guest' },
      datePublished: r.createTime,
      reviewBody: typeof r.comment === 'string' ? r.comment : r.comment?.text ?? r.content ?? '',
      reviewRating: { '@type': 'Rating', ratingValue: googleReviewRating(r), bestRating: 5 }
    }))
  }))
])
</script>
