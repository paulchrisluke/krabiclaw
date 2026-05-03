<template>
  <div>
    <!-- Hero Section -->
    <AppHero
      title="Photo Gallery"
      subtitle="Visual Journey Through KIKUZUKI"
      size="page"
    />

    <!-- Photo Gallery -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div v-if="googleMedia.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="media in googleMedia" :key="media.name" class="group relative overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow">
          <img 
            :src="media.googleUrl" 
            :alt="media.description || 'KIKUZUKI restaurant photo'"
            class="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
          >
          <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-300 flex items-end p-4">
            <div class="text-white">
              <p v-if="media.description" class="text-sm font-medium">{{ media.description }}</p>
              <p class="text-xs opacity-75">{{ formatDate(media.createTime) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- No Photos Placeholder -->
      <div v-else class="text-center text-gray-400 p-24 bg-stone-50 rounded-3xl border border-dashed border-stone-200">
        <p class="italic">Our gallery is updated via Google Business Profile. Please check back soon for new photos.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [
      {
        name: 'accounts/123456789/locations/987654321/media/1',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Grilled salmon robatayaki with seasonal vegetables',
        createTime: '2024-03-15T12:00:00Z',
        mediaFormat: 'PHOTO'
      },
      {
        name: 'accounts/123456789/locations/987654321/media/2',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Traditional yakitori skewers assortment',
        createTime: '2024-03-14T18:30:00Z',
        mediaFormat: 'PHOTO'
      },
      {
        name: 'accounts/123456789/locations/987654321/media/3',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Cozy interior dining area with robatayaki grill',
        createTime: '2024-03-13T20:15:00Z',
        mediaFormat: 'PHOTO'
      },
      {
        name: 'accounts/123456789/locations/987654321/media/4',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Fresh seafood selection for grilling',
        createTime: '2024-03-12T16:45:00Z',
        mediaFormat: 'PHOTO'
      },
      {
        name: 'accounts/123456789/locations/987654321/media/5',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Exterior view of KIKUZUKI restaurant at night',
        createTime: '2024-03-11T19:00:00Z',
        mediaFormat: 'PHOTO'
      },
      {
        name: 'accounts/123456789/locations/987654321/media/6',
        googleUrl: '/images/menu/placeholder-food.jpg',
        description: 'Chef preparing robatayaki over charcoal flame',
        createTime: '2024-03-10T17:30:00Z',
        mediaFormat: 'PHOTO'
      }
    ],
    posts: [],
    products: [],
    qa: [],
    errors: [],
    syncedAt: null
  })
})

const googleMedia = computed(() => googleBusiness.value?.media || [])

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
  title: 'Photos | Take Me Away by KIKUZUKI | Restaurant Gallery',
  description: 'Browse photos of Take Me Away by KIKUZUKI in Krabi, Thailand. See our restaurant interior, food, dishes, and atmosphere through our photo gallery.',
  ogTitle: 'Photos | Take Me Away by KIKUZUKI',
  ogDescription: 'Photo gallery of our Japanese robatayaki restaurant in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/photos',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Photos - Take Me Away by KIKUZUKI',
  twitterDescription: 'Browse photos of our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  photo: googleMedia.value.map(media => ({
    '@type': 'Photograph',
    url: media.googleUrl,
    description: media.description || 'KIKUZUKI restaurant photo'
  }))
}])
</script>
