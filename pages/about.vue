<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Restaurant about page ─────────────────── -->
    <div v-if="!isPlatform">
      <SayaHero
        :title="getField('hero.title', 'About Us')"
        :subtitle="getField('hero.subtitle', 'Our Story')"
        size="page"
        :establishment-year="establishmentYear"
      />
      <SayaAbout
        :title="getField('story-title', 'Finding Inspiration in Every Turn')"
        :image="googleMedia[0]?.googleUrl"
        :image-alt="googleMedia[0]?.altText || googleMedia[0]?.description || 'Restaurant image'"
        bg="white"
        padding="xl"
      >
        <div class="space-y-12 text-default text-lg leading-relaxed max-w-none">
          <p class="text-xl font-medium border-l-4 border-current pl-6 py-2 opacity-80">{{ storyIntro }}</p>
          <div class="grid md:grid-cols-2 gap-12 pt-8">
            <div>
              <h3 class="text-2xl font-bold text-default mb-4">{{ getField('grill.title', 'Our Specialties') }}</h3>
              <p class="text-muted">{{ getField('grill.description', 'Our restaurant showcases mastery of culinary techniques, presenting a delectable array of dishes.') }}</p>
            </div>
            <div>
              <h3 class="text-2xl font-bold text-default mb-4">{{ getField('sushi.title', 'Our Craft') }}</h3>
              <p class="text-muted">{{ getField('sushi.description', 'Skilled chefs artfully craft a variety of dishes with care and precision.') }}</p>
            </div>
          </div>
          <div class="bg-muted rounded-3xl p-10 md:p-16 my-16">
            <h2 class="text-3xl font-bold text-default mb-8 italic">{{ getField('journey.title', 'Our Story') }}</h2>
            <p class="text-muted whitespace-pre-line">{{ journeyBody }}</p>
          </div>
          <p class="text-muted whitespace-pre-line">{{ experienceBody }}</p>
          <div v-if="businessDescription" class="mt-20 pt-20 border-t border-default">
            <h4 class="text-sm font-bold uppercase tracking-widest text-dimmed mb-8">From Google Business</h4>
            <p class="text-muted">{{ businessDescription }}</p>
          </div>
        </div>
      </SayaAbout>
    </div>

    <!-- ── PLATFORM: KrabiClaw about page ────────────────── -->
    <div v-else class="container mx-auto px-4 py-16">
      <div class="max-w-3xl mx-auto">
        <div class="mb-16">
          <h1 class="text-4xl font-bold text-default mb-4">About KrabiClaw</h1>
          <p class="text-xl text-muted">
            A restaurant website platform inspired by the restaurants we love in Krabi — built to help independent restaurants compete online without needing technical skills or expensive agencies.
          </p>
        </div>
        <article class="prose prose-lg max-w-none text-default space-y-8">
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">How It Started</h2>
            <p class="text-muted">KrabiClaw began during COVID, when restaurants suddenly needed online ordering, delivery systems, and websites just to survive. Early versions of the platform were built to help restaurants get online quickly and manage food delivery operations without complicated software.</p>
            <p class="text-muted">But one problem kept appearing: menu management.</p>
            <p class="text-muted">Most restaurant owners didn't want to log into dashboards or learn website builders. They wanted to send a WhatsApp message like "add this item," "change this price," or upload a photo of a new menu page.</p>
            <p class="text-muted">Then AI changed what was possible.</p>
            <p class="text-muted">That led to ChowBot — the assistant behind KrabiClaw. Restaurant owners can simply message ChowBot on WhatsApp to update menus, generate food images, create marketing content, publish announcements, and manage their restaurant website using natural conversation.</p>
          </section>
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">Why KrabiClaw Exists</h2>
            <p class="text-muted">Generic website builders weren't made for restaurants. They don't understand menus, delivery workflows, Google Business integration, or how restaurant owners actually operate day to day.</p>
            <p class="text-muted">KrabiClaw is built specifically for restaurants. Every feature comes from solving real operational problems faced by real restaurant owners.</p>
          </section>
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">Get in Touch</h2>
            <p class="text-muted">Questions, partnership ideas, or just want to talk restaurants and technology — we'd love to hear from you.</p>
            <div class="not-prose flex flex-col sm:flex-row gap-4 mt-6">
              <UButton to="/contact" color="primary" size="lg">Contact Us</UButton>
              <UButton href="https://x.com/paulchrisluke" target="_blank" rel="noopener" variant="outline" color="neutral" size="lg">Follow on X</UButton>
            </div>
          </section>
        </article>
      </div>
    </div>

  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

import { useOrganizationSchema, useBreadcrumbSchema } from '~/composables/useSchemaOrg'
import { usePageContent } from '~/composables/usePageContent'

const { isPlatform, siteId } = useTenantSite()
const { getField } = usePageContent('about')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `about-google-business-${siteId}`,
  default: () => ({ business: null, media: [] }),
  enabled: () => !isPlatform && !!siteId
})

const establishmentYear = computed(() => googleBusiness.value?.business?.establishmentYear ?? null)
const businessDescription = computed(() => googleBusiness.value?.business?.profile?.description ?? '')
const googleMedia = computed(() => googleBusiness.value?.media ?? [])

function sanitizeFieldText(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim()
}

const journeyBody = computed(() => sanitizeFieldText(getField('journey.body',
  'Our restaurant has a unique story to tell. From our humble beginnings to where we are today, every step has been guided by passion and dedication.\n\nThe restaurant, a symphony of warm ambiance and subtle lighting, immerses diners in an unforgettable experience.'
)))
const storyIntro = computed(() => sanitizeFieldText(getField('story.intro', 'Welcome to our restaurant, where culinary tradition meets modern creativity.')))
const experienceBody = computed(() => sanitizeFieldText(getField('experience.body',
  'Our culinary team orchestrates amazing flavors and textures. Committed to the freshest ingredients, our chefs weave magic into every dish.\n\nWe bring together tradition and innovation in a focused, warm dining experience.'
)))

if (isPlatform) {
  useOrganizationSchema()
  useBreadcrumbSchema([
    { name: 'Home', url: `${siteUrl}/` },
    { name: 'About', url: `${siteUrl}/about` }
  ])
}

useSeoMeta(isPlatform
  ? {
      title: 'About | KrabiClaw',
      description: 'KrabiClaw is an AI-powered restaurant website builder built in Krabi, Thailand by Paul Chris Luke.',
      ogImage: '/og-image.jpg',
      ogUrl: `${siteUrl}/about`
    }
  : {
      title: computed(() => `About | ${getField('restaurant.name', 'Our Restaurant')}`),
      description: computed(() => getField('seo.description', 'Learn about our restaurant and our story.')),
      ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
    }
)
</script>
