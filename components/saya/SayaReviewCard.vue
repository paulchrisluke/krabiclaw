<template>
  <div v-if="variant === 'compact'" class="bg-elevated p-8">
    <div class="mb-3 flex gap-1" role="img" :aria-label="$t('saya.reviews.stars_aria', { rating: review.rating })">
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
    <p class="text-sm leading-relaxed text-default">"{{ review.content }}"</p>
    <div class="mt-6 flex items-center justify-between gap-3 border-t border-default pt-4">
      <p class="text-sm font-medium text-default">{{ review.author }}</p>
      <span
        v-if="review.locationTitle"
        class="shrink-0 rounded-full border border-default px-2 py-0.5 text-xs text-muted"
      >
        {{ review.locationTitle }}
      </span>
    </div>
  </div>

  <article v-else class="rounded-3xl border border-default bg-default p-8 sm:p-9">
    <div class="mb-5 flex items-start gap-4">
      <UAvatar :src="review.avatarUrl ?? undefined" :text="getInitials(review.author)" size="md" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-default">{{ review.author }}</span>
          <span
            v-if="review.source === 'gmb'"
            class="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-muted"
          >
            {{ $t('saya.reviews_page.via_google') }}
          </span>
          <span
            v-if="review.locationTitle"
            class="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs text-muted"
          >
            {{ review.locationTitle }}
          </span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex gap-0.5" role="img" :aria-label="$t('saya.reviews.stars_aria', { rating: review.rating })">
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
          <span v-if="review.dateLabel" class="text-muted">·</span>
          <span v-if="review.dateLabel" class="text-xs text-muted">{{ review.dateLabel }}</span>
        </div>
      </div>
    </div>

    <div v-if="review.title" class="saya-display saya-italic mb-2 text-2xl leading-tight text-default">
      {{ review.title }}
    </div>
    <p class="text-sm leading-relaxed text-default">{{ review.content }}</p>

    <slot />
  </article>
</template>

<script setup lang="ts">
defineProps<{
  review: {
    id?: string | number
    author: string
    avatarUrl?: string | null
    rating: number
    content: string
    title?: string | null
    dateLabel?: string | null
    source?: string | null
    locationTitle?: string | null
  }
  variant?: 'compact' | 'full'
}>()
</script>
