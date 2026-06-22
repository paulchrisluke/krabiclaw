<template>
  <UPage class="min-h-screen bg-default text-default">
    <UPageBody class="p-0">
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

        <!-- Multi-location pills -->
        <div v-if="locations.length > 1" class="mt-8 flex flex-wrap gap-3">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}/reviews`"
            class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
          >
            <UIcon name="i-heroicons-map-pin" class="size-3.5 opacity-70" />
            {{ loc.title }}
          </NuxtLink>
        </div>
      </header>

      <!-- Reviews grid -->
      <LazySayaReviews :reviews="visibleReviews" :rating-summary="googleReviewSummary" :show-title="false" />

      <!-- Load more -->
      <div v-if="hasMore" class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 text-center">
        <button
          class="inline-flex items-center gap-2 rounded-full border border-default px-8 py-3 text-[11px] font-medium uppercase tracking-widest text-default transition hover:bg-muted"
          @click="loadMore"
        >
          Show more <span class="opacity-50">({{ remaining }} remaining)</span>
        </button>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { googleBusiness, locations } = useBootstrap()
const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const allReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = r => starRatingMap[r.starRating] ?? Number(r.starRating ?? r.rating ?? 0)

const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = allReviews.value.map(googleReviewRating).filter(Boolean)
    if (!ratings.length) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  const average = Number(summary.averageRating)
  if (!Number.isFinite(average) || average <= 0) return null
  return { average: average.toFixed(1), count: summary.totalReviewCount }
})

// Progressive reveal — 8 at a time
const PAGE_SIZE = 8
const visibleCount = ref(PAGE_SIZE)
const visibleReviews = computed(() => allReviews.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < allReviews.value.length)
const remaining = computed(() => allReviews.value.length - visibleCount.value)
function loadMore() { visibleCount.value += PAGE_SIZE }

const siteName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Site')

const currentPageUrl = useSeoUrl('/reviews')
useSeoMeta({
  title: computed(() => `Reviews | ${siteName.value}`),
  description: computed(() => `Guest reviews for ${siteName.value}.`),
  ogTitle: computed(() => `Reviews | ${siteName.value}`),
  ogDescription: computed(() => `Guest reviews for ${siteName.value}.`),
  ogSiteName: computed(() => siteName.value),
  twitterTitle: computed(() => `Reviews | ${siteName.value}`),
  twitterDescription: computed(() => `Guest reviews for ${siteName.value}.`),
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl
})

useSchemaOrg([
  computed(() => ({
    '@type': getBusinessSchemaTypes(site?.vertical),
    name: siteName.value,
    review: allReviews.value.map(r => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.reviewer?.displayName || 'Guest' },
      datePublished: r.createTime,
      reviewBody: typeof r.comment === 'string' ? r.comment : r.comment?.text ?? r.content ?? '',
      reviewRating: { '@type': 'Rating', ratingValue: googleReviewRating(r), bestRating: 5 }
    }))
  }))
])
</script>
