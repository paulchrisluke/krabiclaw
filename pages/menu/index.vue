<template>
  <div class="min-h-screen bg-white">
    <AppHero
      title="Our Menu"
      subtitle="Authentic Japanese Robatayaki Izakaya"
      size="page"
    />

    <!-- Google Business Products -->
    <AppSection v-if="googleProducts.length" bg="white" padding="default">
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Products & Services</h2>
      <p class="text-gray-500 mb-8">From Google Business Profile</p>
      <div class="divide-y divide-gray-100">
        <div v-for="product in googleProducts" :key="product.name" class="p-6 border-b border-gray-100 last:border-b-0">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ product.title || product.name }}</h3>
              <p v-if="product.description" class="text-gray-600 mb-2">{{ product.description }}</p>
              <p v-if="product.price" class="text-lg font-bold text-gray-900">{{ product.price }}</p>
            </div>
            <div v-if="product.photoUrls?.[0]" class="ml-6">
              <img :src="product.photoUrls[0]" :alt="product.title || product.name" class="w-24 h-24 object-cover rounded-lg">
            </div>
          </div>
        </div>
      </div>
    </AppSection>

    <!-- Fallback to static menu if no products -->
    <template v-else>
      <MenuCategoryNav
        :categories="menuData.categories"
        :active="activeCategory"
        @select="activeCategory = $event"
      />

      <AppSection
        v-for="category in menuData.categories"
        :key="category.id"
        :id="category.id"
        bg="white"
        padding="default"
      >
        <h2 class="text-2xl font-bold text-gray-900 mb-2">{{ category.name }}</h2>
        <p v-if="category.description && !category.description.includes('PLACEHOLDER')" class="text-gray-500 mb-8">{{ category.description }}</p>
        <div class="divide-y divide-gray-100">
          <MenuItemCard
            v-for="item in category.items"
            :key="item.id"
            :item="item"
          />
        </div>
      </AppSection>
    </template>

    <!-- No products placeholder -->
    <AppSection v-if="!googleProducts.length && !menuData.categories.length" bg="white" padding="default">
      <div class="text-center text-gray-500 p-8">
        <p>PLACEHOLDER: Products from Google Business API (/api/google-business/public -> products)</p>
        <p class="text-sm mt-2">This section will display products and services from your Google Business Profile</p>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'
import AppHero from '~/components/ui/AppHero.vue'
import AppSection from '~/components/ui/AppSection.vue'
import MenuCategoryNav from '~/components/menu/MenuCategoryNav.vue'
import MenuItemCard from '~/components/menu/MenuItemCard.vue'

const activeCategory = ref(menuData.categories[0]?.id ?? '')

const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    products: [],
    qa: [],
    errors: [],
    syncedAt: null
  })
})

// Business data computed properties
const businessDescription = computed(() => googleBusiness.value?.business?.profile?.description || '')
const googleProducts = computed(() => googleBusiness.value?.products || [])

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
