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
      :image-alt="googleMedia[0]?.altText || googleMedia[0]?.description || 'Tenant image'"
      bg="white"
      padding="xl"
    >
      <div class="space-y-12 text-[var(--ui-text)] text-lg leading-relaxed max-w-none">
        <p class="text-xl font-medium border-l-4 border-black pl-6 py-2">{{ storyIntro }}</p>

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
          <p class="space-y-6 whitespace-pre-line">{{ journeyBody }}</p>
        </div>

        <p class="space-y-8 whitespace-pre-line">{{ experienceBody }}</p>

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
const route = useRoute()
const requestURL = useRequestURL()

const { siteId } = await useTenantSite()

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `about-google-business-${siteId}`,
  default: () => ({ business: null, media: [] })
})

const businessDescription = computed(() => googleBusiness.value?.business?.profile?.description || '')
const googleMedia = computed(() => googleBusiness.value?.media || [])

function sanitizeFieldText(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim()
}

const journeyBody = computed(() => sanitizeFieldText(getField('journey.body',
  'Our restaurant has a unique story to tell. ' +
  'From our humble beginnings to where we are today, every step has been guided by passion and dedication.\n\n' +
  'The restaurant, a symphony of warm ambiance and subtle lighting, immerses diners in an unforgettable experience.'
)))

const storyIntro = computed(() => sanitizeFieldText(getField('story.intro',
  'Welcome to our restaurant, where culinary tradition meets modern creativity.'
)))

const experienceBody = computed(() => sanitizeFieldText(getField('experience.body',
  'Our culinary team orchestrates amazing flavors and textures. ' +
  'Committed to the freshest ingredients, our chefs weave magic into every dish.\n\n' +
  'We bring together tradition and innovation in a focused, warm dining experience.'
)))

const restaurantName = computed(() => getField('restaurant.name', ''))

useSeoMeta({
  title: computed(() => restaurantName.value ? `About | ${restaurantName.value}` : 'About Us'),
  description: computed(() => getField('seo.description', 'Learn about our restaurant and our story.')),
  ogImage: computed(() => getField('seo.ogImage', '/og-image.jpg')),
  ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
})
</script>
