<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">{{ item?.name }}</h1>
        <p class="text-lg md:text-xl opacity-90">{{ category?.name }}</p>
      </div>
    </div>

    <!-- Item Details -->
    <div class="max-w-6xl mx-auto px-4 py-12" v-if="item">
      <div class="grid md:grid-cols-2 gap-12">
        <!-- Image Section -->
        <div>
          <div class="bg-gray-200 rounded-lg h-96 flex items-center justify-center mb-6">
            <img 
              v-if="item.image && item.image !== '/images/menu/PLACEHOLDER_IMAGE.png'" 
              :src="item.image" 
              :alt="item.name" 
              class="w-full h-full object-cover rounded-lg"
            />
            <span v-else class="text-gray-500">No Image Available</span>
          </div>
        </div>

        <!-- Details Section -->
        <div>
          <div class="mb-6">
            <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{{ item.name }}</h2>
            <p class="text-lg text-gray-700 mb-6">{{ item.description }}</p>
            
            <!-- Price -->
            <div class="mb-6">
              <span class="text-3xl font-bold text-gray-900">฿{{ item.price }}</span>
            </div>

            <!-- Category -->
            <div class="mb-6">
              <span class="inline-block bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                {{ category?.name }}
              </span>
            </div>

            <!-- Allergens -->
            <div class="mb-6" v-if="item.allergens && item.allergens.length > 0">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Allergens</h3>
              <div class="flex flex-wrap gap-2">
                <span 
                  v-for="allergen in item.allergens" 
                  :key="allergen"
                  class="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium"
                >
                  {{ allergen }}
                </span>
              </div>
            </div>

            <!-- Availability -->
            <div class="mb-6">
              <span 
                :class="[
                  'inline-block px-3 py-1 rounded-full text-sm font-medium',
                  item.available 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                ]"
              >
                {{ item.available ? 'Available' : 'Not Available' }}
              </span>
            </div>

            <!-- Back to Menu -->
            <div class="mt-8">
              <NuxtLink 
                to="/menu" 
                class="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
              >
                ← Back to Menu
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 404 State -->
    <div class="max-w-6xl mx-auto px-4 py-12 text-center" v-else>
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Menu Item Not Found</h1>
      <p class="text-lg text-gray-700 mb-6">The menu item you're looking for doesn't exist.</p>
      <NuxtLink 
        to="/menu" 
        class="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
      >
        ← Back to Menu
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'

const route = useRoute()

const { item, category } = computed(() => {
  const slug = route.params.slug
  for (const cat of menuData.categories) {
    const found = cat.items.find(i => i.slug === slug)
    if (found) return { item: found, category: cat }
  }
  return { item: null, category: null }
}).value

// SEO Meta
useSeoMeta({
  title: item ? `${item.name} | Menu | Take Me Away by KIKUZUKI` : 'Menu Item Not Found | Take Me Away by KIKUZUKI',
  description: item ? item.description : 'The menu item you\'re looking for doesn\'t exist.',
  ogTitle: item ? `${item.name} | Menu | Take Me Away by KIKUZUKI` : 'Menu Item Not Found',
  ogDescription: item ? item.description : 'Menu item not found',
  ogImage: item?.image || '/og-image.jpg',
  ogUrl: item ? `https://www.kikuzuki-thailand.com/menu/${item.slug}` : 'https://www.kikuzuki-thailand.com/menu',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: item ? item.name : 'Menu Item Not Found',
  twitterDescription: item ? item.description : 'Menu item not found',
  twitterImage: item?.image || '/og-image.jpg'
})

// Schema.org for menu item
if (item) {
  useSchemaOrg([
    {
      '@type': 'MenuItem',
      name: item.name,
      description: item.description,
      image: item.image !== '/images/menu/PLACEHOLDER_IMAGE.png' ? item.image : undefined,
      offers: {
        '@type': 'Offer',
        price: String(item.price),
        priceCurrency: item.priceCurrency
      },
      suitableForDiet: [],
      nutrition: {
        '@type': 'NutritionInformation'
      }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.kikuzuki-thailand.com' },
        { '@type': 'ListItem', position: 2, name: 'Menu', item: 'https://www.kikuzuki-thailand.com/menu' },
        { '@type': 'ListItem', position: 3, name: item.name, item: `https://www.kikuzuki-thailand.com/menu/${item.slug}` }
      ]
    }
  ])
}
</script>
