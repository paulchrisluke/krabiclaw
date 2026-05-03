<template>
  <div>
    <AppHero
      title="About KIKUZUKI"
      subtitle="Authentic Japanese Robatayaki Experience in Krabi"
      size="page"
    />

    <!-- Brand Story Section -->
    <RestaurantAbout
      title="Finding Inspiration in Every Turn"
      :image="googleMedia[0]?.googleUrl"
      bg="white"
      padding="xl"
    >
      <div class="space-y-12 text-gray-700 text-lg leading-relaxed max-w-none">
        <p class="text-xl font-medium text-gray-900 border-l-4 border-black pl-6 py-2">
          Kikuzuki Japanese Restaurant, nestled in the heart of Krabi, Thailand, is a culinary haven that specializes in the artful fusion of robatayaki and sushi. This gastronomic gem offers a unique dining experience, combining traditional Japanese techniques with a modern twist.
        </p>

        <div class="grid md:grid-cols-2 gap-12 pt-8">
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">Mastery of the Grill</h3>
            <p>Renowned for its robatayaki, Kikuzuki showcases a mastery of grilling techniques, presenting a delectable array of skewered delights, from succulent meats to vibrant vegetables. Each dish is meticulously prepared and grilled to perfection, ensuring a symphony of flavors that tantalize the taste buds.</p>
          </div>
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">Artistry in Sushi</h3>
            <p>Complementing the robatayaki experience is Kikuzuki's sushi selection, where skilled chefs artfully craft a variety of sushi rolls using the freshest seafood and highest-quality ingredients. The sushi bar provides a front-row seat to the culinary spectacle.</p>
          </div>
        </div>

        <div class="bg-stone-50 rounded-3xl p-10 md:p-16 my-16">
          <h2 class="text-3xl font-bold text-black mb-8 italic">Our Journey</h2>
          <div class="space-y-6">
            <p>Nestled amidst the tropical allure of Krabi, Thailand, Kikuzuki has an enchanting culinary tale. Beyond the sliding glazed door entrance and our Kikuzuki Giant red lucky cat, you are welcomed into a little piece of Japan, step into a haven where the aroma of robatayaki and the artistry of sushi converge.</p>
            <p>The restaurant, a symphony of warm wood and subtle lighting, immerses diners in an ambiance that transports them to the heart of Japan. At the heart of Kikuzuki's prowess lies our robatayaki, where we aim to provide delicious seasoned delights by our skilled grill Chef where he prepares an array of skewers over an open flame, infusing each morsel with smoky perfection.</p>
            <p>We wanted to provide an amazing menu combined with an open grill in order all can view the preparation of the freshest ingredients which we hope show cases our testament to the precision and passion that defines the robatayaki tradition.</p>
          </div>
        </div>

        <div class="space-y-8">
          <p>Equally enticing is our sushi bar, a stage where culinary craftsmen orchestrate amazing flavors and textures. We are committed to the freshest seafood, our sushi chefs weave magic into every dish, also visually stunning preparation is very much part of your experience presenting a canvas of color and taste.</p>
          <p>Kikuzuki we hope and wish stands as a beacon of gastronomic delight, where the legacy of robatayaki and the allure of sushi come together in a culinary tapestry that captures the essence of Japanese cuisine. It's not just a meal; it's a sensory journey through the heart of Japan, an experience that lingers long after the last bite.</p>
          <p>This is also accompanied by wonderful Saki and Cocktails to help enjoy, not to mention our flavoured beer selection, sit back listen to the great music and immerse yourself in Kikuzuki.</p>
        </div>
      </div>
    </RestaurantAbout>

  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
import RestaurantAbout from '~/components/google/RestaurantAbout.vue'
import AppSection from '~/components/ui/AppSection.vue'

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
const googleMedia = computed(() => googleBusiness.value?.media || [])
const businessCategories = computed(() => googleBusiness.value?.business?.categories || [])
const businessAttributes = computed(() => googleBusiness.value?.business?.attributes || [])

useSeoMeta({
  title: 'About | Take Me Away by KIKUZUKI | Japanese Robatayaki Krabi',
  description: 'Learn about KIKUZUKI, our authentic Japanese robatayaki restaurant in Krabi, Thailand. Discover our story, Japanese culinary traditions, and commitment to authentic dining experiences.',
  ogTitle: 'About | Take Me Away by KIKUZUKI',
  ogDescription: 'Authentic Japanese robatayaki restaurant in Krabi, Thailand. Learn our story and culinary philosophy.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/about',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'About - Take Me Away by KIKUZUKI',
  twitterDescription: 'Japanese robatayaki restaurant in Krabi, Thailand with authentic culinary traditions.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  description: businessDescription.value || 'Authentic Japanese robatayaki izakaya in Krabi, Thailand offering traditional Japanese grilling experiences with a focus on quality ingredients and culinary craftsmanship.'
}])
</script>
