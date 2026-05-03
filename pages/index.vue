<template>
  <div>
    <!-- Hero -->
    <AppHero
      title="Take Me Away by KIKUZUKI"
      subtitle="Authentic Japanese Robatayaki Izakaya in Krabi, Thailand"
      height="100vh"
      video="/videos/hero-video.mp4"
    >
      <template #cta>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <AppButton to="/menu" variant="primary" size="lg">View Menu</AppButton>
          <AppButton to="/reservations" variant="secondary" size="lg">Reserve a Table</AppButton>
        </div>
      </template>
    </AppHero>

    <!-- Featured dishes -->
    <AppSection bg="white" padding="py-16">
      <h2 class="text-3xl font-bold text-gray-900 mb-2">Featured Dishes</h2>
      <p class="text-gray-500 mb-8">Signature robatayaki from our kitchen</p>
      <div class="divide-y divide-gray-100">
        <MenuItemCard
          v-for="item in featuredItems"
          :key="item.id"
          :item="item"
        />
      </div>
      <div class="mt-8">
        <AppButton to="/menu" variant="secondary" size="md"
          class="border-black text-black hover:bg-black hover:text-white">
          View Full Menu →
        </AppButton>
      </div>
    </AppSection>

    <!-- About teaser -->
    <AppSection bg="black" padding="py-16">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold text-white mb-4">The Art of Robatayaki</h2>
          <p class="text-white/70 mb-6 leading-relaxed">
            Robatayaki — meaning "fireside cooking" — is a centuries-old Japanese grilling tradition.
            At KIKUZUKI, skilled chefs grill premium meats, fresh seafood, and seasonal vegetables
            over an open charcoal flame, right before your eyes.
          </p>
          <AppButton to="/about" variant="secondary" size="md">Our Story</AppButton>
        </div>
        <div class="bg-white/10 rounded-lg h-64 flex items-center justify-center">
          <span class="text-white/30 text-sm">PLACEHOLDER_ABOUT_IMAGE</span>
        </div>
      </div>
    </AppSection>

    <!-- Location teaser -->
    <AppSection bg="gray" padding="py-16">
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Find Us in Krabi</h2>
          <div class="space-y-3 text-gray-600 mb-6">
            <p>📍 Krabi Province, Southern Thailand 81000</p>
            <p>🕙 Daily: 10:00 – 22:00</p>
            <p>📞 +66-76-XXX-XXXX</p>
          </div>
          <div class="flex gap-4">
            <AppButton to="/location" variant="primary"
              class="bg-black text-white hover:bg-black/90" size="md">
              Get Directions
            </AppButton>
            <AppButton to="/reservations" variant="ghost"
              class="text-black hover:text-black" size="md">
              Reserve →
            </AppButton>
          </div>
        </div>
        <div class="rounded-lg h-64 overflow-hidden">
          <iframe 
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d98.7493211!3d8.0572977!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sTake%20Me%20Away%20by%20KIKUZUKI!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth" 
            width="100%" 
            height="100%" 
            style="border:0;" 
            allowfullscreen="" 
            loading="lazy" 
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
import { menuData } from '~/data/menu'
import AppHero from '~/components/ui/AppHero.vue'
import AppButton from '~/components/ui/AppButton.vue'
import AppSection from '~/components/ui/AppSection.vue'
import MenuItemCard from '~/components/menu/MenuItemCard.vue'

definePageMeta({
  layout: 'home'
})

const featuredItems = computed(() =>
  menuData.categories
    .flatMap(c => c.items)
    .filter(i => i.featured)
    .slice(0, 4)
)

useSeoMeta({
  title: 'Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya in Krabi',
  description: 'Experience authentic Japanese robatayaki at Take Me Away by KIKUZUKI in Krabi, Thailand. Fresh ingredients, traditional flavors, and unforgettable dining experience in southern Thailand.',
  ogTitle: 'Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya in Krabi',
  ogDescription: 'Authentic Japanese robatayaki izakaya in Krabi, Thailand. Fresh ingredients, traditional flavors, and unforgettable dining experience.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Take Me Away by KIKUZUKI - Japanese Robatayaki Izakaya',
  twitterDescription: 'Experience authentic Japanese robatayaki in beautiful Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  description: 'Authentic Japanese robatayaki izakaya in Krabi, Thailand offering fresh ingredients and traditional flavors',
  url: 'https://www.kikuzuki-thailand.com',
  telephone: '+66-76-XXX-XXXX',
  email: 'info@kikuzuki-thailand.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Southern Thailand',
    addressLocality: 'Krabi',
    addressRegion: 'Krabi Province',
    postalCode: '81000',
    addressCountry: 'TH'
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 8.0572977,
    longitude: 98.7493211
  },
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    opens: '10:00',
    closes: '22:00'
  }],
  priceRange: '$$',
  servesCuisine: ['Japanese', 'Robatayaki', 'Izakaya'],
  hasMap: 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
  sameAs: [
    'https://www.facebook.com/kikuzuki-thailand',
    'https://www.instagram.com/kikuzuki-thailand'
  ]
}])
</script>