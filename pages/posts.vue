<template>
  <div>
    <!-- Hero Section -->
    <AppHero
      title="Business Updates"
      subtitle="Latest News & Announcements"
      size="page"
    />



    <RestaurantPosts
      :posts="googlePosts"
      bg="white"
      padding="default"
      :show-title="false"
    />
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
import RestaurantPosts from '~/components/google/RestaurantPosts.vue'

const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [
      {
        name: 'mock-post-1',
        title: 'New Seasonal Menu: Autumn Flavors',
        summary: 'Experience the essence of autumn with our newly launched seasonal dishes. From grilled mushrooms to slow-cooked wagyu, discover the rich flavors of the harvest season.',
        createTime: '2024-03-15T10:00:00Z',
        media: [{ googleUrl: '/images/menu/steak.png' }]
      },
      {
        name: 'mock-post-2',
        title: 'Songkran Festival Celebration',
        summary: 'Join us for a special robatayaki feast during the Songkran holidays! We will be serving traditional favorites with a modern Japanese twist.',
        createTime: '2024-03-10T14:30:00Z',
        media: [{ googleUrl: '/images/menu/chicken.png' }],
        event: { title: 'Songkran Special' }
      },
      {
        name: 'mock-post-3',
        title: 'Now Open for Lunch!',
        summary: 'By popular demand, KIKUZUKI is now open for lunch service starting this weekend. Join us for premium bento boxes and light robatayaki sets.',
        createTime: '2024-03-05T09:15:00Z',
        media: [{ googleUrl: '/images/menu/egg-salad.png' }]
      }
    ],
    products: [],
    qa: [],
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
  title: 'Posts | Take Me Away by KIKUZUKI | Business Updates',
  description: 'Read the latest news, updates, and announcements from Take Me Away by KIKUZUKI in Krabi, Thailand. Stay informed about events, special offers, and restaurant news.',
  ogTitle: 'Posts | Take Me Away by KIKUZUKI',
  ogDescription: 'Business updates and news from our Japanese robatayaki restaurant in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/posts',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Posts - Take Me Away by KIKUZUKI',
  twitterDescription: 'Latest updates from our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: googlePosts.value.map(post => ({
      '@type': 'Article',
      headline: post.title,
      datePublished: post.createTime,
      author: {
        '@type': 'Organization',
        name: 'Take Me Away by KIKUZUKI'
      },
      image: post.media?.[0]?.googleUrl || '/og-image.jpg'
    }))
  }
}])
</script>
