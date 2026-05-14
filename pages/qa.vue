<template>
  <div class="min-h-screen bg-default">
    <SayaHero
      title="Questions & Answers"
      subtitle="Customer Inquiries About Our Restaurant"
      size="page"
    />

    <SayaQA
      :qa="googleQA"
      bg="white"
      padding="default"
      :show-title="false"
    />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })
import { useTenantSite } from '~/composables/useTenantSite'

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `qa-google-business-${siteId}`,
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    errors: [],
    syncedAt: null
  })
})

const googleQA = computed(() => googleBusiness.value?.qa || [])

// SEO Meta
useSeoMeta({
  title: 'Q&A | Your Restaurant | Customer Questions',
  description: 'Find answers to frequently asked questions about Your Restaurant in your city. Browse customer inquiries and our responses about authentic dining.',
  ogTitle: 'Q&A | Your Restaurant',
  ogDescription: 'Customer questions and answers about our authentic restaurant in your city.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/qa',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Q&A - Your Restaurant',
  twitterDescription: 'Customer questions and answers about our Japanese restaurant in your city.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Restaurant',
    name: 'Your Restaurant',
    mainEntity: {
      '@type': 'FAQPage',
      mainEntity: {
        '@type': 'Question',
        name: 'Customer Questions About Our Restaurant',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Find answers to common questions about our authentic restaurant, menu, and services.'
        }
      }
    }
  }))
])
</script>
