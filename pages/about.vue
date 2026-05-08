<template>
  <div>
    <SayaHero
      :title="getField('hero.title', 'About Saya Kitchen')"
      :subtitle="getField('hero.subtitle', 'Authentic Japanese Robatayaki Experience in Krabi')"
      size="page"
      :establishment-year="googleBusiness.value?.business?.establishmentYear"
    />
    <SayaAbout
      :title="getField('story-title', 'Finding Inspiration in Every Turn')"
      :image="googleMedia[0]?.googleUrl"
      bg="white"
      padding="xl"
    >
      <div class="space-y-12 text-gray-700 text-lg leading-relaxed max-w-none">
        <div v-html="storyIntro" />

        <div class="grid md:grid-cols-2 gap-12 pt-8">
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">{{ getField('grill.title', 'Mastery of the Grill') }}</h3>
            <p>{{ getField('grill.description', 'Renowned for its robatayaki, our restaurant showcases a mastery of grilling techniques, presenting a delectable array of skewered delights.') }}</p>
          </div>
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">{{ getField('sushi.title', 'Artistry in Sushi') }}</h3>
            <p>{{ getField('sushi.description', "Complementing the robatayaki experience is our restaurant's sushi selection, where skilled chefs artfully craft a variety of sushi rolls.") }}</p>
          </div>
        </div>

        <div class="bg-stone-50 rounded-3xl p-10 md:p-16 my-16">
          <h2 class="text-3xl font-bold text-black mb-8 italic">{{ getField('journey.title', 'Our Journey') }}</h2>
          <div v-html="journeyBody" class="space-y-6" />
        </div>

        <div v-html="experienceBody" class="space-y-8" />

        <div v-if="businessDescription" class="mt-20 pt-20 border-t border-stone-100">
          <h4 class="text-sm font-bold uppercase tracking-widest text-stone-400 mb-8">From Google Business</h4>
          <p>{{ businessDescription }}</p>
        </div>
      </div>
    </SayaAbout>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { usePageContent } from '~/composables/usePageContent'

const { getField } = usePageContent('about')

const { siteId } = await useTenantSite()

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `about-google-business-${siteId}`,
  default: () => ({ business: null, media: [] })
})

const businessDescription = computed(() => googleBusiness.value?.business?.profile?.description || '')
const googleMedia = computed(() => googleBusiness.value?.media || [])

// Defaults moved to computeds to avoid inline template quote-escaping issues
const storyIntro = computed(() => getField('story.intro',
  '<p class="text-xl font-medium text-gray-900 border-l-4 border-black pl-6 py-2">' +
  'Saya Kitchen, nestled in the heart of Krabi, is a culinary haven that specializes in the artful fusion of robatayaki and sushi.' +
  '</p>'
))

const journeyBody = computed(() => getField('journey.body',
  '<p>Nestled amidst the tropical allure of Krabi, Saya Kitchen has an enchanting culinary tale. ' +
  'Beyond the sliding glazed door entrance and our giant red lucky cat, you are welcomed into a little piece of Japan.</p>' +
  '<p>The restaurant, a symphony of warm wood and subtle lighting, immerses diners in an ambiance that transports them to the heart of Japan.</p>'
))

const experienceBody = computed(() => getField('experience.body',
  '<p>Equally enticing is our sushi bar, a stage where culinary craftsmen orchestrate amazing flavors and textures. ' +
  'Committed to the freshest seafood, our sushi chefs weave magic into every dish.</p>' +
  '<p>Saya Kitchen brings the legacy of robatayaki and the allure of sushi together in a focused, warm dining experience.</p>'
))

useSeoMeta({
  title: 'About | Saya Kitchen',
  description: 'Learn about Saya Kitchen and our authentic Japanese robatayaki dining experience in Krabi.',
  ogImage: '/og-image.jpg',
  ogUrl: '/about'
})
</script>
