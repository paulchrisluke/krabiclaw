<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Restaurant about page ─────────────────── -->
    <div v-if="!isPlatform">

      <!-- Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
        <p class="saya-kicker mb-6">Our story</p>
        <h1 class="saya-display-lg text-default">
          <em class="saya-italic">{{ getField('hero.title', 'About us') }}</em>
        </h1>
        <p v-if="getField('hero.subtitle')" class="mt-6 max-w-2xl text-base leading-relaxed text-muted">
          {{ getField('hero.subtitle') }}
        </p>
      </header>

      <!-- Story: image + body -->
      <section class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div :class="getField('story.image') ? 'grid gap-16 lg:grid-cols-2 lg:items-start' : 'max-w-3xl'">
          <!-- Story image or video -->
          <div v-if="getField('story.image')" class="overflow-hidden rounded-2xl bg-zinc-950/5 relative">
            <video
              v-if="/\.(mp4|webm|mov)$/i.test(getField('story.image'))"
              :src="getField('story.image')"
              autoplay
              muted
              loop
              playsinline
              class="w-full object-cover aspect-4/3"
            />
            <img
              v-else
              :src="getField('story.image')"
              alt=""
              aria-hidden="true"
              class="w-full object-cover aspect-4/3"
            >
          </div>

          <!-- Story text -->
          <div>
            <h2 class="saya-display-md text-default">
              {{ getField('story.title', 'Our Story') }}
            </h2>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose prose-lg mt-8 max-w-none text-muted" v-html="storyBody" />
          </div>
        </div>
      </section>

      <!-- Journey section -->
      <section v-if="getField('journey.title') || getField('journey.body')" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="max-w-3xl">
            <p class="saya-kicker mb-6">The journey</p>
            <h2 class="saya-display-md text-default">
              {{ getField('journey.title', 'Our Journey') }}
            </h2>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose prose-lg mt-8 max-w-none text-default" v-html="journeyBody" />
          </div>
        </div>
      </section>

      <!-- CTA strip -->
      <section class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-24 sm:px-6 lg:px-8">
        <h3 class="saya-display-md saya-italic text-default">
          {{ getField('cta.title', 'Come dine with us.') }}
        </h3>
        <div class="flex flex-wrap gap-3">
          <UButton v-if="hasOrderLinks" to="/order" color="primary" variant="solid" size="xl" class="rounded-full">Order Now</UButton>
          <UButton to="/reservations" color="primary" :variant="hasOrderLinks ? 'outline' : 'solid'" size="xl" class="rounded-full">Reserve a table</UButton>
        </div>
      </section>
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

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: s => s }

const { isPlatform } = useTenantSite()
const { getField, locations } = useBootstrap()

const storyBody = computed(() => DOMPurify.sanitize(getField('story.body', '') || ''))
const journeyBody = computed(() => DOMPurify.sanitize(getField('journey.body', '') || ''))

const hasOrderLinks = computed(() =>
  locations.value.some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()
const sharedOgImage = useSharedOgImage()

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
      ogImage: sharedOgImage,
      ogUrl: `${siteUrl}/about`
    }
  : {
      title: computed(() => `About | ${getField('restaurant.name', 'Our Restaurant')}`),
      description: computed(() => getField('seo.description', 'Learn about our restaurant and our story.')),
      ogImage: sharedOgImage,
      ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
    }
)
</script>
