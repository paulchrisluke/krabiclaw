<template>
  <div>
    <!-- Hero Section -->
    <SayaHero
      title="Photo Gallery"
      subtitle="Visual Journey Through Our Restaurant"
      size="page"
    />

    <!-- Photo Gallery -->
    <UContainer class="py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Real photos -->
        <UCard 
          v-for="media in googleMedia" 
          :key="media.name" 
          class="group overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
        >
          <div class="relative">
            <img 
              :src="media.googleUrl" 
              :alt="media.description || 'Restaurant photo'"
              class="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
            >
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-300 flex items-end p-4">
              <div class="text-white">
                <p v-if="media.description" class="text-sm font-medium">{{ media.description }}</p>
                <p class="text-xs opacity-75">{{ formatDate(media.createTime) }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Saya gallery placeholders when Google photos are not connected -->
        <template v-if="googleMedia.length === 0">
          <div
            v-for="photo in sayaGalleryPlaceholders"
            :key="photo.src"
            class="aspect-square overflow-hidden rounded-lg"
          >
            <img :src="photo.src" :alt="photo.alt" class="h-full w-full object-cover transition-transform duration-300 hover:scale-105">
          </div>
        </template>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { useTenantSite } from '~/composables/useTenantSite'

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `photos-google-business-${siteId}`,
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    errors: [],
    syncedAt: null
  })
})

const googleMedia = computed(() => googleBusiness.value?.media || [])

const sayaGalleryPlaceholders = [
  { src: '/images/gallery/sushi-platter.jpg', alt: 'Sushi platter', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/robatayaki-grill.jpg', alt: 'Grill dishes', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/dining-room.jpg', alt: 'Restaurant dining room', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/izakaya-dishes.jpg', alt: 'Japanese dishes', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/fresh-sushi.jpg', alt: 'Fresh sushi rolls', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/restaurant-tables.jpg', alt: 'Restaurant seating', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/shared-plates.jpg', alt: 'Shared plates', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/chef-preparing.jpg', alt: 'Chef at work', attribution: 'Photo by Unsplash' },
  { src: '/images/gallery/evening-atmosphere.jpg', alt: 'Evening ambiance', attribution: 'Photo by Unsplash' }
]

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const { site } = await useTenantSite()

// SEO Meta
useSeoMeta({
  title: `Photos | ${site?.title || 'Restaurant'}`,
  description: `Browse photos from ${site?.title || 'our restaurant'}, featuring our dishes and dining atmosphere.`,
  ogTitle: `Photos | ${site?.title || 'Restaurant'}`,
  ogDescription: `Photo gallery for ${site?.title || 'our restaurant'}.`,
  ogImage: '/og-image.jpg',
  ogUrl: '/photos',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: `Photos - ${site?.title || 'Restaurant'}`,
  twitterDescription: `Browse photos of ${site?.title || 'our restaurant'}.`,
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Restaurant',
    name: 'Saya Kitchen',
    photo: googleMedia.value.map(media => ({
      '@type': 'Photograph',
      url: media.googleUrl,
      description: media.description || 'Restaurant photo'
    }))
  }))
])
</script>
