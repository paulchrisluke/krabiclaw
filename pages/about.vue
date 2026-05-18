<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Restaurant about page ─────────────────── -->
    <div v-if="!isPlatform">
      <SayaHero
        :title="getField('hero.title', 'About Us')"
        :subtitle="getField('hero.subtitle', '')"
        size="page"
      />

      <!-- Story: image + title + body -->
      <AppSection bg="white" padding="xl">
        <div class="max-w-4xl mx-auto">
          <div class="mb-12 overflow-hidden rounded-3xl h-96">
            <img
              v-if="getField('story.image')"
              :src="getField('story.image')"
              alt="Our story"
              class="w-full h-full object-cover"
            >
            <div
              v-else
              class="w-full h-full bg-muted flex items-center justify-center border-2 border-dashed border-default"
            >
              <span class="text-muted italic text-sm">Add a story image</span>
            </div>
          </div>

          <h2 class="font-black italic tracking-tighter text-4xl md:text-5xl text-default leading-none mb-8">
            {{ getField('story.title', 'Our Story') }}
          </h2>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="prose prose-lg max-w-none text-default" v-html="getField('story.body', '')" />
        </div>
      </AppSection>

      <!-- Journey -->
      <AppSection bg="alt" padding="xl">
        <div class="max-w-4xl mx-auto">
          <div class="bg-muted rounded-3xl p-10 md:p-16">
            <h2 class="text-3xl font-bold text-default mb-8 italic">
              {{ getField('journey.title', 'Our Journey') }}
            </h2>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose prose-lg max-w-none text-muted" v-html="getField('journey.body', '')" />
          </div>
        </div>
      </AppSection>

      <!-- CTA -->
      <AppSection bg="black" padding="lg">
        <div class="max-w-4xl mx-auto text-center py-8">
          <h2 class="saya-display text-4xl md:text-5xl text-inverted mb-10">
            {{ getField('cta.title', 'Come dine with us') }}
          </h2>
          <div class="flex flex-wrap justify-center gap-4">
            <UButton v-if="hasOrderLinks" to="/order" size="xl" color="neutral" variant="solid" class="rounded-full">Order Now</UButton>
            <UButton to="/reservations" size="xl" color="neutral" :variant="hasOrderLinks ? 'ghost' : 'outline'" class="rounded-full">Reserve a Table</UButton>
          </div>
        </div>
      </AppSection>
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

const { data: aboutLocsData } = isPlatform || !siteId
  ? { data: ref({ locations: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/locations`, {
      key: `order-locs-${siteId}`,
      default: () => ({ locations: [] })
    })
const hasOrderLinks = computed(() =>
  (aboutLocsData.value?.locations ?? []).some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()

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
