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
  { src: 'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80', alt: 'Saya sushi platter' },
  { src: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80', alt: 'Robatayaki grill at Saya' },
  { src: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80', alt: 'Warm restaurant dining room' },
  { src: 'https://images.unsplash.com/photo-1562436260-8c9216eeb703?auto=format&fit=crop&w=900&q=80', alt: 'Japanese izakaya dishes' },
  { src: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=900&q=80', alt: 'Fresh sushi rolls' },
  { src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80', alt: 'Restaurant tables ready for dinner' },
  { src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', alt: 'Shared plates at Saya Kitchen' },
  { src: 'https://images.unsplash.com/photo-1514517220033-cc8c0a7fb7f9?auto=format&fit=crop&w=900&q=80', alt: 'Chef preparing dinner' },
  { src: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=80', alt: 'Evening restaurant atmosphere' }
]

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
  title: 'Photos | Saya Kitchen',
  description: 'Browse Saya Kitchen photos, from robatayaki grill dishes to our warm Krabi dining room.',
  ogTitle: 'Photos | Saya Kitchen',
  ogDescription: 'Photo gallery for Saya Kitchen in Krabi.',
  ogImage: '/og-image.jpg',
  ogUrl: '/photos',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Photos - Saya Kitchen',
  twitterDescription: 'Browse photos of Saya Kitchen in Krabi.',
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
