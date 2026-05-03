<template>
  <AppSection :bg="bg" :padding="padding" v-if="reviews.length > 0">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-gray-200 pb-8">
      <div>
        <h2 class="text-base font-semibold text-black tracking-wide uppercase">Guest Experience</h2>
        <p class="mt-2 text-4xl font-bold text-black italic">What Our Guests Say</p>
      </div>
      <div v-if="ratingSummary" class="flex flex-col items-start md:items-end gap-1">
        <div class="flex text-yellow-400">
          <span v-for="i in 5" :key="i" class="text-xl">
            {{ i <= Math.round(Number(ratingSummary.average)) ? '★' : '☆' }}
          </span>
        </div>
        <p class="text-sm font-medium text-gray-500">
          {{ ratingSummary.average }} / 5.0 from {{ ratingSummary.count }} Google reviews
        </p>
      </div>
    </div>

    <div :class="['grid gap-8', layoutClass]">
      <article
        v-for="review in displayedReviews"
        :key="review.reviewId || review.name || review.createTime"
        class="flex flex-col rounded-2xl bg-white p-8 shadow-sm border border-gray-100 transition-all hover:shadow-md"
      >
        <div class="flex items-center gap-1 text-yellow-400 mb-4">
          <span v-for="i in 5" :key="i" class="text-sm">
            {{ i <= reviewRating(review) ? '★' : '☆' }}
          </span>
        </div>
        
        <blockquote class="flex-grow">
          <p class="text-gray-700 leading-relaxed italic text-sm">
            "{{ reviewText(review) }}"
          </p>
        </blockquote>

        <!-- Review Reply -->
        <div v-if="review.reviewReply?.comment" class="mt-4 bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs">
          <p class="font-bold text-black mb-1">KIKUZUKI Response:</p>
          <p class="text-gray-600">{{ typeof review.reviewReply.comment === 'string' ? review.reviewReply.comment : review.reviewReply.comment?.text || '' }}</p>
        </div>

        <div class="mt-6 flex items-center gap-3 pt-6 border-t border-gray-50">
          <div class="h-10 w-10 rounded-full bg-black flex items-center justify-center text-white font-bold text-xs uppercase">
            {{ reviewAuthor(review).charAt(0) }}
          </div>
          <div>
            <p class="text-sm font-bold text-black">{{ reviewAuthor(review) }}</p>
            <time v-if="review.createTime" :datetime="review.createTime" class="block text-xs text-gray-400">
              {{ formatDate(review.createTime) }}
            </time>
          </div>
        </div>
      </article>
    </div>
    
    <div v-if="showViewMore" class="mt-12 text-center">
      <AppButton to="/reviews" variant="secondary" size="md">
        View All Guest Reviews
      </AppButton>
    </div>
  </AppSection>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import AppButton from '~/components/ui/AppButton.vue'

const props = defineProps({
  reviews: {
    type: Array,
    default: () => []
  },
  ratingSummary: {
    type: Object,
    default: null
  },
  limit: {
    type: Number,
    default: null
  },
  bg: {
    type: String,
    default: 'gray'
  },
  padding: {
    type: String,
    default: 'lg'
  },
  showTitle: {
    type: Boolean,
    default: true
  },
  showViewMore: {
    type: Boolean,
    default: false
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
const reviewText = review => {
  const text = typeof review.comment === 'string' ? review.comment : review.comment?.text ?? ''
  if (props.limit && text.length > 280) {
    return text.slice(0, 280) + '...'
  }
  return text
}
const reviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)

const displayedReviews = computed(() => {
  const filtered = props.reviews.filter(review => reviewText(review))
  return props.limit ? filtered.slice(0, props.limit) : filtered
})

const layoutClass = computed(() => {
  if (props.limit === 3) return 'md:grid-cols-3'
  if (props.limit === 4) return 'md:grid-cols-2 lg:grid-cols-4'
  return 'md:grid-cols-2'
})

const formatDate = value =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value))
</script>
