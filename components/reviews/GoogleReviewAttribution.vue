<template>
  <div class="mt-3 space-y-2 text-xs text-muted">
    <p translate="no" class="whitespace-nowrap font-normal not-italic">Google Maps</p>
    <div class="flex flex-wrap items-center gap-3">
      <img v-if="metadata?.author_photo_uri" :src="metadata.author_photo_uri" alt="" class="size-8 rounded-full" loading="lazy" referrerpolicy="no-referrer" />
      <a v-if="metadata?.author_uri" :href="metadata.author_uri" target="_blank" rel="noopener noreferrer" class="underline">{{ t('saya.reviews.author_profile') }}</a>
      <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="underline">{{ t('saya.reviews.view_on_google') }}</a>
      <a v-if="metadata?.flag_content_uri" :href="metadata.flag_content_uri" target="_blank" rel="noopener noreferrer" class="underline">{{ t('saya.reviews.report_review') }}</a>
    </div>
    <p v-if="metadata?.visit_date">{{ t('saya.reviews.visited', { date: `${metadata.visit_date.year}-${String(metadata.visit_date.month).padStart(2, '0')}` }) }}</p>
    <details v-if="metadata?.original_text && metadata.original_language_code !== metadata.language_code">
      <summary class="cursor-pointer">{{ t('saya.reviews.translated_review', { language: metadata.original_language_code }) }}</summary>
      <p class="mt-2 whitespace-pre-line" :lang="metadata.original_language_code ?? undefined">{{ metadata.original_text }}</p>
    </details>
  </div>
</template>

<script setup lang="ts">
// Google Places display terms: a shown review carries its author attribution,
// a link to the review on Google Maps, and Google's "report" link. The
// ordering notice is one line per list, not per card: `saya.reviews.google_order_notice`.
import type { GoogleReviewMetadata } from '~/shared/google-review'
const { t } = useI18n()
defineProps<{ metadata: GoogleReviewMetadata | null; sourceUrl: string | null }>()
</script>
