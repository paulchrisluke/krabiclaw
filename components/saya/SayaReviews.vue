<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-default pb-8">
      <div>
        <h2 class="text-base font-semibold text-default tracking-wide uppercase">Guest Experience</h2>
        <p class="mt-2 text-4xl font-bold text-default italic">What Our Guests Say</p>
      </div>
      <div v-if="ratingSummary" class="flex flex-col items-start md:items-end gap-1">
        <div
          class="flex text-yellow-400"
          :aria-label="ratingSummary ? `${Math.round(Number(ratingSummary.average))} out of 5 stars` : undefined"
          role="img"
        >
          <span v-for="i in 5" :key="i" class="text-xl" aria-hidden="true">
            {{ i <= Math.round(Number(ratingSummary.average)) ? '★' : '☆' }}
          </span>
        </div>
        <p class="text-sm font-medium text-muted">
          {{ ratingSummary.average }} / 5.0 from {{ ratingSummary.count }} reviews
        </p>
      </div>
    </div>

    <div :class="['grid gap-8', layoutClass]">
      <!-- Real reviews -->
      <UCard
        v-for="review in displayedReviews"
        :key="review.reviewId || review.id || review.name || review.createTime"
        class="flex flex-col bg-default p-8 shadow-sm border border-default hover:shadow-md transition-all"
      >
        <div
          class="flex items-center gap-1 text-yellow-400 mb-4"
          :aria-label="`${reviewRating(review)} out of 5 stars`"
          role="img"
        >
          <span v-for="i in 5" :key="i" class="text-sm" aria-hidden="true">
            {{ i <= reviewRating(review) ? '★' : '☆' }}
          </span>
        </div>
        
        <blockquote class="grow">
          <p class="text-default leading-relaxed italic text-sm">
            "{{ reviewText(review) }}"
          </p>
        </blockquote>

        <!-- Review Reply -->
        <div v-if="review.reviewReply?.comment" class="mt-4 bg-muted border border-default rounded-xl p-4 text-xs">
          <p class="font-bold text-default mb-1">Restaurant Response:</p>
          <p class="text-muted">{{ typeof review.reviewReply.comment === 'string' ? review.reviewReply.comment : review.reviewReply.comment?.text || '' }}</p>
        </div>

        <div class="mt-6 flex items-center gap-3 pt-6 border-t border-default">
          <div class="h-10 w-10 rounded-full bg-inverted flex items-center justify-center text-inverted font-bold text-xs uppercase">
            {{ reviewAuthor(review).charAt(0) }}
          </div>
          <div>
            <p class="text-sm font-bold text-default">{{ reviewAuthor(review) }}</p>
            <time v-if="review.createTime || review.created_at" :datetime="review.createTime || review.created_at" class="block text-xs text-muted">
              {{ formatDate(review.createTime || review.created_at) }}
            </time>
          </div>
        </div>
      </UCard>

    </div>
    
    <div v-if="showViewMore && reviews.length > 0" class="mt-12 text-center">
      <UButton to="/reviews" color="primary" variant="outline" size="xl">
        View All Reviews
      </UButton>
    </div>
  </AppSection>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import { UButton } from '#components'

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
    default: 'neutral'
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

const reviewAuthor = review => {
  return review.reviewer?.displayName?.trim() || review.author_name?.trim() || 'Anonymous'
}
const reviewText = review => {
  const text = typeof review.comment === 'string' ? review.comment : review.comment?.text ?? review.content ?? ''
  if (props.limit && text.length > 280) {
    return text.slice(0, 280) + '...'
  }
  return text
}
const reviewRating = review => {
  const mapped = starRatingMap[review.starRating]
  if (mapped !== undefined) return mapped
  const numeric = Number(review.starRating ?? review.rating ?? 0)
  return isNaN(numeric) ? 0 : numeric
}

const displayedReviews = computed(() => {
  const filtered = props.reviews.filter(review => reviewText(review))
  return props.limit ? filtered.slice(0, props.limit) : filtered
})

const layoutClass = computed(() => {
  if (props.limit === 3) return 'md:grid-cols-3'
  if (props.limit === 4) return 'md:grid-cols-2 lg:grid-cols-4'
  return 'md:grid-cols-2'
})

const formatDate = value => {
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}
</script>
