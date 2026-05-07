<template>
  <div>
    <!-- Hero Section -->
    <SayaHero
      title="Business Updates"
      subtitle="Latest News & Announcements"
      size="page"
    />



    <SayaPosts
      :posts="googlePosts"
      bg="white"
      padding="default"
      :show-title="false"
    />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { useTenantSite } from '~/composables/useTenantSite'

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `posts-google-business-${siteId}`,
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    errors: [],
    syncedAt: null
  })
})

const googlePosts = computed(() => googleBusiness.value?.posts || [])

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// SEO Meta
useSeoMeta({
  title: 'Posts | Restaurant Website | Business Updates',
  description: 'Read the latest news, updates, and announcements from our restaurant. Stay informed about events, special offers, and restaurant news.',
  ogTitle: 'Posts | Restaurant Website',
  ogDescription: 'Business updates and news from our authentic restaurant.',
  ogImage: '/og-image.jpg',
  ogUrl: '/posts',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Posts - Restaurant Website',
  twitterDescription: 'Latest updates from our Japanese restaurant.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Restaurant',
    name: 'Your Restaurant',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: googlePosts.value.map(post => ({
        '@type': 'Article',
        headline: post.title,
        datePublished: post.createTime,
        author: {
          '@type': 'Organization',
          name: 'Your Restaurant'
        },
        image: post.media?.[0]?.googleUrl || '/og-image.jpg'
      }))
    }
  }))
])
</script>
