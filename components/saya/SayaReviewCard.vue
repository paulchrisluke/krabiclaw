<template>
  <component :is="variant === 'compact' ? 'div' : 'article'" :class="variant === 'compact' ? 'bg-elevated p-8' : 'rounded-3xl border border-default bg-default p-8 sm:p-9'">
    <template v-if="variant === 'compact'">
      <div class="mb-3 flex gap-1" role="img" :aria-label="t('saya.reviews.stars_aria', { rating: review.rating })">
        <SayaIcon
          v-for="s in 5"
          :key="s"
          name="star"
          solid
          aria-hidden="true"
          class="size-3.5"
          :class="s <= review.rating ? 'text-primary' : 'text-muted'"
        />
      </div>
      <p class="text-sm leading-relaxed text-default">"{{ body }}"</p>
      <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
        <p class="text-sm font-medium text-default">
          {{ author }}<span v-if="dateLabel" class="font-normal text-muted"> · {{ dateLabel }}</span>
        </p>
        <span v-if="locationTitle" class="max-w-full rounded-full border border-default px-2 py-0.5 text-xs break-words text-muted">
          {{ locationTitle }}
        </span>
      </div>
    </template>

    <template v-else>
      <div class="mb-5 flex items-start gap-4">
        <UAvatar :src="portrait || undefined" :alt="author" size="xl" loading="lazy" decoding="async" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-default">{{ author }}</span>
            <span
              v-if="review.source === 'google_places'"
              class="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-muted"
            >
              {{ t('saya.reviews_page.via_google') }}
            </span>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="flex gap-0.5" role="img" :aria-label="t('saya.reviews.stars_aria', { rating: review.rating })">
              <SayaIcon
                v-for="s in 5"
                :key="s"
                name="star"
                solid
                aria-hidden="true"
                class="size-3"
                :class="s <= review.rating ? 'text-primary' : 'text-muted'"
              />
            </div>
            <span v-if="dateLabel" class="text-muted">·</span>
            <span v-if="dateLabel" class="text-xs text-muted">{{ dateLabel }}</span>
          </div>
        </div>
      </div>

      <div v-if="review.title" class="saya-display saya-italic mb-2 text-2xl leading-tight text-default">
        {{ review.title }}
      </div>
      <p class="text-sm leading-relaxed text-default">{{ body }}</p>

    </template>

    <div v-if="review.owner_reply" class="mt-6 rounded-2xl border-l-4 border-primary bg-elevated p-5">
      <p class="mb-2 text-xs text-muted">{{ t('saya.reviews_page.owner_response') }}<template v-if="review.owner_reply_at"> · {{ formatDate(review.owner_reply_at) }}</template></p>
      <p class="text-sm leading-relaxed text-default">{{ review.owner_reply }}</p>
    </div>
    <GoogleReviewAttribution v-if="review.source === 'google_places'" :metadata="review.google_review_metadata ?? null" :source-url="review.original_reference ?? null" />
    <slot />
  </component>
</template>

<script setup lang="ts">
import type { GoogleReviewMetadata } from '~/shared/google-review'
const { t } = useI18n()
const { formatDate } = useLocaleDate()

/** A review row as the reviews API and the product payload carry it. */
const props = defineProps<{
  review: {
    id: string | number
    author_name: string | null
    rating: number
    content: string | null
    title?: string | null
    source?: string | null
    original_reference?: string | null
    google_review_metadata?: GoogleReviewMetadata | null
    /** When an imported review was written; a Google review is dated by this. */
    original_review_date?: string | null
    /** When the row was written here; a review written on this site is dated by this. */
    created_at?: string | null
    owner_reply?: string | null
    owner_reply_at?: string | null
    media?: Array<{ slot: string; public_url?: string | null }>
  }
  /** Text to show instead of the row's content, e.g. a truncated preview. */
  content?: string
  /** Named when a site has several locations and the reader needs to know which one this is about. */
  locationTitle?: string | null
  variant?: 'compact' | 'full'
}>()

const author = computed(() => props.review.author_name ?? '')
const body = computed(() => props.content ?? props.review.content ?? '')
/** A Google review is dated by its Google publish time, one written here by its row. No date, no date line. */
const dateLabel = computed(() => {
  const writtenAt = props.review.source === 'google_places' ? props.review.original_review_date : props.review.created_at
  return writtenAt ? formatDate(writtenAt) : null
})
const portrait = computed(() => props.review.media?.find(item => item.slot === 'portrait')?.public_url || null)
</script>
