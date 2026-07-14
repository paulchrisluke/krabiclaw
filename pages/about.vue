<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <BlawbyTenantPage
      v-if="!isPlatform && isBlawby"
      path="/about"
      fallback-eyebrow="About"
      fallback-title="About"
      fallback-summary="Learn more about this organization, its mission, and the people it serves."
    />

    <!-- ── TENANT: Restaurant about page ─────────────────── -->
    <div v-else-if="!isPlatform">

      <!-- Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
        <p class="saya-kicker mb-6">{{ copy.ourStoryKicker }}</p>
        <h1 class="saya-display-lg text-default">
          <em class="saya-italic">{{ getField('hero.title', copy.aboutHeroTitle) }}</em>
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
              v-if="isVideoUrl(getField('story.image'))"
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
              {{ getField('story.headline', copy.ourStoryTitle) }}
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
            <p class="saya-kicker mb-6">{{ copy.ourJourneyKicker }}</p>
            <h2 class="saya-display-md text-default">
              {{ getField('journey.title', copy.ourJourneyTitle) }}
            </h2>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose prose-lg mt-8 max-w-none text-default" v-html="journeyBody" />
          </div>
        </div>
      </section>

      <!-- CTA strip -->
      <section class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-24 sm:px-6 lg:px-8">
        <h3 class="saya-display-md saya-italic text-default">
          {{ getField('cta.title', copy.ctaTitle) }}
        </h3>
        <div class="flex flex-wrap gap-3">
          <SayaButton v-if="hasOrderLinks" to="/order" variant="solid" size="lg">{{ copy.orderNowCta }}</SayaButton>
          <SayaButton
            :to="copy.ctaRoute"
            :variant="hasOrderLinks ? 'outline' : 'solid'"
            size="lg"
          >
            {{ copy.reserveCta }}
          </SayaButton>
        </div>
      </section>

      <!-- ── Dynamic content blocks ───────────────────────────── -->
      <template v-if="contentBlocks.length > 0">
        <component
          v-for="block in contentBlocks.filter(b => b.component)"
          :key="block._uid || block.field"
          :is="resolveComponent(block.component)"
          :data="block"
          class="content-block"
        />
      </template>
    </div>

    <!-- ── PLATFORM: KrabiClaw about page ────────────────── -->
    <div v-else class="relative overflow-hidden bg-default min-h-screen py-20 lg:py-28">
      <!-- Ambient Mesh Background Lights -->
      <div class="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
      <div class="absolute bottom-1/3 left-1/4 -z-10 w-[500px] h-[500px] bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>

      <div class="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl relative z-10">
        
        <!-- Header -->
        <div class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-4">
          <!-- Eyebrow -->
          <span class="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/25">
            <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-ping" />
            Our Story &amp; Mission
          </span>
          
          <h1 class="text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.05] tracking-tight text-default text-balance m-0 mt-2">
            The heart behind <span class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">KrabiClaw</span>.
          </h1>
          
          <p class="text-lg leading-relaxed text-muted m-0 max-w-2xl mt-2">
            A website platform for local businesses inspired by the independent, family-run businesses we love around the world — built to help them thrive in the digital era.
          </p>
        </div>

        <!-- Story Sections -->
        <article class="space-y-12">
          <!-- How It Started Card -->
          <div class="group relative bg-elevated/40 backdrop-blur-md border border-default p-8 sm:p-10 rounded-[32px] shadow-lg hover:shadow-xl transition-all duration-300">
            <div class="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-2xl opacity-50"></div>
            <div class="relative z-10">
              <span class="text-xs font-black tracking-widest uppercase text-primary">01 / Origin</span>
              <h2 class="text-2xl font-black text-default mt-2 mb-4">How It Started</h2>
              <div class="space-y-4 text-[14px] leading-relaxed text-muted">
                <p>KrabiClaw began during COVID, when businesses suddenly needed online presence, booking systems, and websites just to survive. Early versions of the platform were built to help businesses get online quickly and manage operations without complicated software.</p>
                <p>But one problem kept appearing: content management. Most business owners didn't want to log into dashboards or learn website builders. They wanted to send a simple WhatsApp message like "add this item," "change this price," or upload a photo of a new offering.</p>
                <p>That led to <strong class="text-default">ChowBot</strong> — the assistant behind KrabiClaw. Business owners can simply message ChowBot on WhatsApp to update offerings, generate descriptions, publish announcements, and manage their website using natural, friendly conversation.</p>
              </div>
            </div>
          </div>

          <!-- Why KrabiClaw Exists Card -->
          <div class="group relative bg-elevated/40 backdrop-blur-md border border-default p-8 sm:p-10 rounded-[32px] shadow-lg hover:shadow-xl transition-all duration-300">
            <div class="absolute -bottom-12 -right-12 w-32 h-32 bg-(--kc-teal)/10 rounded-full blur-2xl opacity-50"></div>
            <div class="relative z-10">
              <span class="text-xs font-black tracking-widest uppercase text-(--kc-teal-600)">02 / Purpose</span>
              <h2 class="text-2xl font-black text-default mt-2 mb-4">Why KrabiClaw Exists</h2>
              <div class="space-y-4 text-[14px] leading-relaxed text-muted">
                <p>Generic website builders weren't made for local businesses. They don't understand offerings, digital bookings, workflows, Google Business sync, or how business owners actually operate day-to-day.</p>
                <p>KrabiClaw is built specifically for local businesses. Every single detail comes from solving real operational challenges faced by real business owners. We focus on simplicity, premium design, and AI automation so you can focus on what you do best.</p>
              </div>
            </div>
          </div>

          <!-- CTA Banner -->
          <div class="relative overflow-hidden bg-gradient-to-br from-primary/5 via-elevated/40 to-(--kc-teal)/5 border border-default rounded-[32px] p-8 sm:p-10 text-center shadow-lg">
            <div class="absolute inset-0 bg-gradient-to-tr from-primary/10 via-(--kc-coral)/15 to-(--kc-teal)/10 rounded-full blur-3xl -z-10 animate-pulse duration-[8s]"></div>
            <div class="relative z-10 flex flex-col items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <PlatformIcon name="envelope" class="size-6" />
              </div>
              <h3 class="text-xl font-extrabold text-default">Get in Touch</h3>
              <p class="text-sm text-muted max-w-xl">
                Have questions, partnership ideas, or just want to talk business and technology? We'd love to hear from you.
              </p>
              <div class="mt-2 flex flex-wrap justify-center gap-4">
                <PlatformButton
                  to="/help"
                  size="xl"
                  class="font-bold transition-all duration-300 hover:scale-[1.02]"
                >
                  Contact Us
                  <PlatformIcon name="arrow-right" class="size-4" />
                </PlatformButton>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

import { getVerticalCopy } from '~/utils/vertical-copy'
import { useDynamicComponent } from '~/composables/useDynamicComponent'

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s) => s }

const { isPlatform, site } = useTenantSite()
const { isBlawby } = usePublicTemplate()
const { getField, locations, contentBlocks } = useBootstrap()
const { resolveComponent } = useDynamicComponent()
const { locale } = useI18n()
const copy = computed(() => getVerticalCopy(site?.vertical, locale.value))

const storyBody = computed(() => DOMPurify.sanitize(getField('story.body', '') || ''))
const journeyBody = computed(() => DOMPurify.sanitize(getField('journey.body', '') || ''))

const hasOrderLinks = computed(() =>
  locations.value.some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

function isVideoUrl(url) {
  try {
    const pathname = new URL(url).pathname
    return /\.(mp4|webm|mov)$/i.test(pathname)
  } catch {
    return /\.(mp4|webm|mov)$/i.test(url)
  }
}

const route = useRoute()
const requestURL = useRequestURL()
const tenantOgImage = useTenantOgImage()

if (isPlatform) {
  usePlatformPageSeo({
    path: '/about',
    title: 'About',
    description: 'KrabiClaw is a premium, AI-powered website builder designed for independent businesses globally.',
    pageType: 'AboutPage',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'About', url: '/about' },
    ],
  })
} else {
  useSeoMeta({
    title: computed(() => `About | ${site?.brand_name || 'KrabiClaw'}`),
    description: computed(() => getField('seo.description', 'Learn about our business and our story.')),
    ogTitle: computed(() => `About | ${site?.brand_name || 'KrabiClaw'}`),
    ogDescription: computed(() => getField('seo.description', 'Learn about our business and our story.')),
    ogSiteName: computed(() => site?.brand_name || 'KrabiClaw'),
    twitterTitle: computed(() => `About | ${site?.brand_name || 'KrabiClaw'}`),
    twitterDescription: computed(() => getField('seo.description', 'Learn about our business and our story.')),
    ogImage: tenantOgImage,
    ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
  })
}
</script>
