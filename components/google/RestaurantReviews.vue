<template>
  <section v-if="displayedReviews.length > 0" class="bg-white">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-sm font-medium text-gray-500">Guest Reviews</p>
          <h2 class="mt-2 text-3xl font-semibold text-gray-900">What Guests Say</h2>
        </div>
        <p v-if="ratingSummary" class="text-sm text-gray-500">
          {{ ratingSummary.average }} out of 5 from Google reviews
        </p>
      </div>

      <div class="mt-8 grid gap-6 md:grid-cols-3">
        <article
          v-for="review in displayedReviews"
          :key="review.reviewId || review.name || review.createTime"
          class="rounded-lg border border-gray-200 bg-gray-50 p-6"
        >
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm font-medium text-gray-900">{{ reviewAuthor(review) }}</p>
            <p class="text-sm font-semibold text-amber-700">{{ reviewRating(review) }} / 5</p>
          </div>
          <p class="mt-4 text-sm leading-6 text-gray-600">{{ reviewText(review) }}</p>
          <time v-if="review.createTime" :datetime="review.createTime" class="mt-4 block text-xs text-gray-500">
            {{ formatDate(review.createTime) }}
          </time>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  reviews: {
    type: Array,
    default: () => []
  },
  ratingSummary: {
    type: Object,
    default: null
  }
})

const starRatingMap = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
}

const reviewAuthor = review => review.reviewer?.displayName ?? 'Google guest'
const reviewText = review => typeof review.comment === 'string'
  ? review.comment
  : review.comment?.text ?? ''
const reviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)

const displayedReviews = computed(() =>
  props.reviews
    .filter(review => reviewText(review))
    .slice(0, 3)
)

const formatDate = value =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(value))
</script>
