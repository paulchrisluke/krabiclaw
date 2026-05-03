<template>
  <div class="min-h-screen bg-white">
    <AppHero
      title="Our Menu"
      subtitle="Authentic Japanese Robatayaki Izakaya"
    />

    <!-- Menu Introduction -->
    <AppSection bg="gray" padding="py-12">
      <div class="max-w-4xl mx-auto prose prose-lg">
        <p class="text-gray-700 mb-4 leading-relaxed">
          Indulge in the culinary artistry of our base Japanese menu, a symphony of flavors featuring your favourite Japanese Izakaya and Robatayaki Cusine.
        </p>
        <p class="text-gray-700 mb-4 leading-relaxed">
          Our sushi and Sashimi selection showcases the freshest, highest-quality ingredients expertly crafted into delectable bites. From classic favorites like California rolls to innovative creations, each bite is a journey through the delicate balance of textures and tastes. Immerse yourself in the rich umami of our sashimi, featuring pristine slices of raw fish that melt in your mouth, a testament to the precision and dedication of our skilled sushi chefs.
        </p>
        <p class="text-gray-700 mb-4 leading-relaxed">
          For noodle enthusiasts, our menu offers an array of soul-satisfying options. Slurp your way through steaming bowls of ramen, where hand-pulled noodles swim in flavorful broth, topped with an assortment of ingredients that dance harmoniously on your palate. Udon lovers will find comfort in our thick, chewy noodles served in hearty broths, with an array of toppings to customize your bowl to perfection.
        </p>
        <p class="text-gray-700 mb-4 leading-relaxed">
          The robatayaki section of our menu introduces the ancient Japanese grilling technique, where skewers of succulent meats, seafood, and vegetables are meticulously grilled over an open flame. Revel in the smoky aroma and charred perfection of each skewer, as our chefs showcase their expertise in capturing the essence of flame-kissed flavors.
        </p>
        <p class="text-gray-700 leading-relaxed">
          Complementing our menu is a curated selection of sauces and condiments, enhancing the authenticity of every dish. Whether you're a sushi connoisseur, noodle enthusiast, or robatayaki aficionado, our base Japanese menu is a celebration of culinary excellence, inviting you to embark on a gastronomic journey through the heart of Japan's diverse and exquisite culinary landscape.
        </p>
      </div>
    </AppSection>

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
      padding="py-12"
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
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'

const activeCategory = ref(menuData.categories[0]?.id ?? '')

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
