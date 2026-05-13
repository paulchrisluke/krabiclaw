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
            A restaurant website builder born in Krabi, Thailand — built by someone who's spent 15 years helping
            businesses get found online, and got tired of watching great restaurants stay invisible.
          </p>
        </div>
        <article class="prose prose-lg max-w-none text-default space-y-8">
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">The Problem We Kept Seeing</h2>
            <p class="text-muted">The best meal I had in Krabi in 2024 was at a tiny robatayaki restaurant tucked behind a mango farm. No website. A blurry photo on Google Maps. Reviews that said "great food" but no address, no hours, no menu. Half the tables were empty every night.</p>
            <p class="text-muted">That restaurant was KIKUZUKI — and it became the first site built on what is now KrabiClaw.</p>
          </section>
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">Who Built This</h2>
            <p class="text-muted">I'm Paul Chris Luke — half Chinese, half American, originally from Chattanooga, Tennessee. I've spent over 15 years in eCommerce, conversion rate optimization, and digital marketing. I'm a Google Certified CRO specialist, a Shopify Plus partner, and I've managed millions of dollars in ad spend across Google and Meta.</p>
            <p class="text-muted">A few years ago I moved to Southeast Asia — not for the lifestyle arbitrage that word implies, but because I wanted my work to matter in places where a single well-built website can be the difference between a family business surviving or not. I run <a href="https://whynotearth.com" class="underline hover:no-underline" target="_blank" rel="noopener">Why Not Earth</a>, a marketing agency that charges commercial clients for high-quality work and uses that revenue to provide the same services free to nonprofits working on trafficking prevention, job creation, and rural internet access.</p>
          </section>
          <section>
            <h2 class="text-2xl font-bold text-default mb-4">Why Not Just Use Squarespace?</h2>
            <p class="text-muted">Generic website builders don't understand restaurants. They don't know what a menu section is, they don't sync to Google Business Profile, they don't handle multiple locations under one brand, and they're built for an English-speaking small business owner in San Francisco — not a Thai restaurant owner in Krabi.</p>
            <p class="text-muted">KrabiClaw is built specifically for restaurants. Every feature — the menu builder, Google Business sync, AI menu extraction, draft/publish workflow — came from a real problem we hit building real restaurant sites.</p>
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
