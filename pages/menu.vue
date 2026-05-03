<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">Menu</h1>
        <p class="text-lg md:text-xl opacity-90">Authentic Japanese Robatayaki Izakaya</p>
      </div>
    </div>

    <!-- Menu Categories -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div v-for="category in menuData.categories" :key="category.id" class="mb-16">
        <!-- Category Header -->
        <div class="bg-black text-white p-6 mb-8">
          <h2 class="text-2xl md:text-3xl font-bold">{{ category.name }}</h2>
          <p v-if="category.description" class="mt-2 opacity-90">{{ category.description }}</p>
        </div>

        <!-- Menu Items -->
        <div class="space-y-6">
          <NuxtLink 
            v-for="item in category.items" 
            :key="item.id"
            :to="`/menu/${item.slug}`"
            class="flex items-center justify-between p-6 border-b border-gray-200 hover:bg-gray-50 transition-colors block"
          >
            <div class="flex-1">
              <div class="flex items-center gap-4">
                <div v-if="item.image && item.image !== '/images/menu/PLACEHOLDER_IMAGE.png'" class="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                  <img :src="item.image" :alt="item.name" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center">
                  <span class="text-gray-400 text-xs text-center">No Image</span>
                </div>
                <div class="flex-1">
                  <h3 class="text-xl font-semibold text-gray-900">{{ item.name }}</h3>
                  <p class="text-gray-600 mt-1">{{ item.description }}</p>
                </div>
              </div>
            </div>
            <div class="text-right ml-6">
              <div v-if="item.available" class="text-2xl font-bold text-gray-900">
                ฿{{ item.price }}
              </div>
              <div v-else class="text-lg text-red-500 font-medium">
                Not Available
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'

// SEO Meta
useSeoMeta({
  title: 'Menu | Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya',
  description: 'Explore our complete menu of authentic Japanese robatayaki dishes, appetizers, and drinks at Take Me Away by KIKUZUKI in Krabi, Thailand.',
  ogTitle: 'Menu | Take Me Away by KIKUZUKI',
  ogDescription: 'Complete menu of Japanese robatayaki izakaya dishes in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/menu',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Menu - Take Me Away by KIKUZUKI',
  twitterDescription: 'Japanese robatayaki menu in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([
  {
    '@type': 'Restaurant',
    name: 'Take Me Away by KIKUZUKI',
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: menuData.categories.map(category => ({
        '@type': 'MenuSection',
        name: category.name,
        description: category.description,
        hasMenuItem: category.items.map(item => ({
          '@type': 'MenuItem',
          name: item.name,
          description: item.description,
          image: item.image,
          offers: {
            '@type': 'Offer',
            price: String(item.price),
            priceCurrency: item.priceCurrency
          }
        }))
      }))
    }
  },
  {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.kikuzuki-thailand.com' },
      { '@type': 'ListItem', position: 2, name: 'Menu', item: 'https://www.kikuzuki-thailand.com/menu' }
    ]
  }
])

</script>
