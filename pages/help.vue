<template>
  <div class="container mx-auto px-4 py-10 sm:py-14">
    <PublicHelpChowBot />
  </div>
</template>

<script setup lang="ts">
import { PUBLIC_SUPPORT_FAQ_ENTRIES } from '~/utils/public-support'

definePageMeta({ layout: 'platform' })

usePlatformPageSeo({
  path: '/help',
  title: 'Support',
  description: 'Get help with KrabiClaw, browse docs and product updates, or open a support request through ChowBot support.',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Support', url: '/help' },
  ],
  faqItems: PUBLIC_SUPPORT_FAQ_ENTRIES.map(item => ({
    question: item.title,
    answer: item.answer,
  })),
})
</script>
