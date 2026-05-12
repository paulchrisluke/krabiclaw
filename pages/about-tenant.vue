<template>
  <div>
    <SayaHero
      :title="getField('hero.title', 'About Us')"
      :subtitle="getField('hero.subtitle', 'Our Story')"
      size="page"
      :establishment-year="googleBusiness.value?.business?.establishmentYear"
    />
    <SayaAbout
      :title="getField('story-title', 'Finding Inspiration in Every Turn')"
      :image="googleMedia[0]?.googleUrl"
      bg="white"
      padding="xl"
    >
      <div class="space-y-12 text-[var(--ui-text)] text-lg leading-relaxed max-w-none">
        <div v-html="storyIntro" />

        <div class="grid md:grid-cols-2 gap-12 pt-8">
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">{{ getField('grill.title', 'Our Specialties') }}</h3>
            <p>{{ getField('grill.description', 'Our restaurant showcases mastery of culinary techniques, presenting a delectable array of dishes.') }}</p>
          </div>
          <div>
            <h3 class="text-2xl font-bold text-black mb-4">{{ getField('sushi.title', 'Our Craft') }}</h3>
            <p>{{ getField('sushi.description', "Skilled chefs artfully craft a variety of dishes with care and precision.") }}</p>
          </div>
        </div>

        <div class="bg-[var(--ui-bg-muted)] rounded-3xl p-10 md:p-16 my-16">
          <h2 class="text-3xl font-bold text-black mb-8 italic">{{ getField('journey.title', 'Our Story') }}</h2>
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
definePageMeta({ layout: 'saya' })
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
  '<p class="text-xl font-medium text-[var(--ui-text-highlighted)] border-l-4 border-black pl-6 py-2">'  +
  'Welcome to our restaurant, where culinary tradition meets modern creativity.' +
  '</p>'
))

const journeyBody = computed(() => getField('journey.body',
  '<p>Our restaurant has a unique story to tell. ' +
  'From our humble beginnings to where we are today, every step has been guided by passion and dedication.</p>' +
  '<p>The restaurant, a symphony of warm ambiance and subtle lighting, immerses diners in an unforgettable experience.</p>'
))

const experienceBody = computed(() => getField('experience.body',
  '<p>Our culinary team orchestrates amazing flavors and textures. ' +
  'Committed to the freshest ingredients, our chefs weave magic into every dish.</p>' +
  '<p>We bring together tradition and innovation in a focused, warm dining experience.</p>'
))

const restaurantName = computed(() => getField('restaurant.name', ''))

useSeoMeta({
  title: computed(() => restaurantName.value ? `About | ${restaurantName.value}` : 'About Us'),
  description: computed(() => getField('seo.description', 'Learn about our restaurant and our story.')),
  ogImage: computed(() => getField('seo.ogImage', '/og-image.jpg')),
  ogUrl: '/about'
})
</script>
