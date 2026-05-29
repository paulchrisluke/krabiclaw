<template>
  <div class="relative overflow-hidden py-16 sm:py-24">
    <!-- Mesh Background Accents -->
    <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60"></div>
    <div class="absolute bottom-1/4 right-1/4 -z-10 w-112.5 h-112.5 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-50"></div>

    <div class="container mx-auto px-4 max-w-7xl">
      <!-- Hero Section -->
      <div class="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center gap-6">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
          <UIcon name="i-heroicons-bolt" class="size-3.5" />
          The Ultimate Platform
        </span>
        <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] text-default m-0 text-balance">
<<<<<<< HEAD
          Supercharge Your Business. <br class="hidden sm:inline" />
          <span class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">Zero Middlemen.</span>
=======
          Supercharge Your Business. <br class="hidden sm:inline" />
          <span class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">Zero Middlemen.</span>
>>>>>>> origin/main
        </h1>
        <p class="text-lg sm:text-xl text-muted leading-relaxed m-0 text-balance">
          Say goodbye to expensive agencies, 30% commissions, and buggy plugins. KrabiClaw gives your business a high-converting storefront, direct bookings, and automated local SEO in one simple system.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mt-2">
          <UButton to="/signup" size="lg" class="font-semibold bg-primary text-inverted rounded-[9px] hover:bg-primary/90 shadow-sm transition-transform hover:-translate-y-0.5">
            Start Free Today
          </UButton>
          <UButton to="/pricing" variant="outline" color="neutral" size="lg" class="font-semibold rounded-[9px] transition-transform hover:-translate-y-0.5">
            View Pricing
          </UButton>
        </div>
      </div>

      <!-- Feature Grid -->
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-24">
        <div
          v-for="feature in detailedFeatures"
          :key="feature.title"
          class="group relative rounded-[22px] p-8 border border-default bg-elevated/40 backdrop-blur-md hover:bg-elevated/70 hover:border-primary/40 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 flex flex-col justify-between overflow-hidden"
        >
          <!-- Subtle Glow Effect on Hover -->
          <div class="absolute top-0 right-0 w-24 h-24 bg-linear-to-bl from-primary/5 to-transparent rounded-bl-full group-hover:from-primary/10 transition-all duration-300"></div>

          <div>
            <!-- Icon Wrapper -->
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300"
              :class="feature.badgeColor"
            >
              <UIcon :name="feature.icon" class="size-6 text-white" />
            </div>

            <!-- Title & Description -->
            <h3 class="text-xl font-extrabold text-default mb-3 group-hover:text-primary transition-colors">
              {{ feature.title }}
            </h3>
            <p class="text-[14px] leading-relaxed text-muted mb-6">
              {{ feature.description }}
            </p>

            <!-- Technical Detail Checklist -->
            <ul class="space-y-2.5 p-0 mb-8 list-none">
              <li
                v-for="spec in feature.specs"
                :key="spec"
                class="flex items-start gap-2 text-[13px] text-muted leading-snug"
              >
                <UIcon name="i-heroicons-check-circle" class="size-4 shrink-0 text-(--kc-teal) mt-0.5" />
                <span>{{ spec }}</span>
              </li>
            </ul>
          </div>

          <!-- Documentation Backlink -->
          <div class="pt-4 border-t border-default/50">
            <NuxtLink
              :to="feature.docLink"
              class="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors no-underline group/link"
            >
              Learn how to set this up
              <UIcon name="i-heroicons-arrow-right" class="size-3.5 transition-transform group-hover/link:translate-x-1" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Live SEO Highlight & Callout Banner -->
      <div class="relative rounded-[28px] overflow-hidden border border-default p-8 sm:p-12 mb-20 bg-(--kc-navy) text-white shadow-xl">
        <div class="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-80"></div>
        <div class="absolute -bottom-32 -left-32 w-80 h-80 bg-(--kc-teal)/20 rounded-full blur-3xl opacity-60"></div>

        <div class="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
          <div class="lg:col-span-7 space-y-6">
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/20">
              <UIcon name="i-heroicons-presentation-chart-line" class="size-3.5" />
              Integrated Analytics & SEO
            </span>
            <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white m-0">
              Claim Your Spot on the Front Page of Google
            </h2>
            <p class="text-white/80 text-[15px] sm:text-base leading-relaxed max-w-2xl m-0">
              Stop letting food aggregators capture your organic search traffic and sell it back to you with hefty fees. With our new <strong>Google Search Console</strong> and <strong>Google Analytics 4</strong> integration, your customized, blazing-fast site gets discovered directly by diners.
            </p>
            <div class="flex flex-wrap gap-4 pt-2">
              <NuxtLink
                to="/blog/demystifying-restaurant-seo-search-console-analytics"
                class="inline-flex items-center gap-1.5 bg-white text-(--kc-navy) text-[14px] font-bold px-5 py-3 rounded-[9px] hover:bg-white/90 transition-colors no-underline"
              >
                Read our SEO Strategy Guide
                <UIcon name="i-heroicons-book-open" class="size-4" />
              </NuxtLink>
              <NuxtLink
                to="/docs/restaurant-seo-analytics-setup-guide"
                class="inline-flex items-center gap-1 text-[14px] font-semibold text-white/90 hover:text-white hover:underline transition-colors no-underline"
              >
                View Setup Documentation →
              </NuxtLink>
            </div>
          </div>
          <!-- Visual card display Mockup -->
          <div class="lg:col-span-5 flex justify-center">
            <div class="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl max-w-sm w-full space-y-4">
              <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-(--kc-coral) flex items-center justify-center">
                    <UIcon name="i-heroicons-presentation-chart-bar" class="size-4 text-white" />
                  </div>
                  <span class="font-semibold text-sm">Direct Storefront Stats</span>
                </div>
                <span class="text-xs bg-(--kc-teal)/20 text-(--kc-teal) px-2.5 py-0.5 rounded-full font-medium">Example</span>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                  <div class="text-xs text-white/60 mb-1">Direct Conversions</div>
                  <div class="text-xl font-bold">+42.8%</div>
                </div>
                <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                  <div class="text-xs text-white/60 mb-1">Organic Clicks</div>
                  <div class="text-xl font-bold">14.2k</div>
                </div>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                <div class="flex justify-between text-xs">
                  <span class="text-white/60">Google Ranking</span>
                  <span class="text-(--kc-teal) font-semibold">Page 1 (#2)</span>
                </div>
                <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div class="h-full bg-linear-to-r from-primary to-(--kc-teal) w-4/5 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FAQ Section -->
      <div class="max-w-4xl mx-auto mt-20">
        <h2 class="text-3xl font-extrabold text-default text-center mb-12">Frequently Asked Features Questions</h2>
        <div class="grid sm:grid-cols-2 gap-6">
          <div
            v-for="faq in faqItems"
            :key="faq.q"
            class="bg-elevated/40 border border-default p-6 rounded-2xl flex flex-col gap-2"
          >
            <h4 class="text-base font-bold text-default m-0 flex items-center gap-2">
              <UIcon name="i-heroicons-question-mark-circle" class="size-5 text-primary shrink-0" />
              {{ faq.q }}
            </h4>
            <p class="text-[13.5px] leading-relaxed text-muted m-0">
              {{ faq.a }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform' })

import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const platformHostname = computed(() => {
  const freeSiteDomain = config.public.freeSiteDomain
  if (!freeSiteDomain) return 'krabiclaw.com'
  try {
    const url = new URL(freeSiteDomain.startsWith('http') ? freeSiteDomain : `https://${freeSiteDomain}`)
    return url.hostname
  } catch {
    return freeSiteDomain.replace(/^https?:\/\//, '').split('/')[0] || 'krabiclaw.com'
  }
})

useBreadcrumbSchema([
  { name: 'Home', url: `https://${platformHostname.value}/` },
  { name: 'Features', url: `https://${platformHostname.value}/features` },
])

const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/features')

useSeoMeta({
  title: 'Platform Features | KrabiClaw',
  description: 'KrabiClaw features: AI-built restaurant websites, reservations with notifications, Google Business sync, multi-language support, delivery link integration, and optional WhatsApp integration for ChowBot conversations.',
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl,
  ogType: 'website',
})

const detailedFeatures = [
  {
    icon: 'i-heroicons-globe-alt',
    title: 'SEO & Custom Domains',
    description: 'Ensure local searchers find your site instantly. Our platform features edge performance and clean HTML optimized directly for search crawlers.',
    badgeColor: 'bg-primary',
    docLink: '/docs/restaurant-seo-analytics-setup-guide',
    specs: [
      'Connect custom domains with automated SSL',
      'Google Analytics 4 (GA4) Measurement sync',
      'Google Search Console site verification',
      'Auto-generated XML sitemaps & JSON-LD markup'
    ]
  },
  {
    icon: 'i-heroicons-calendar-days',
    title: 'Smart Reservations',
    description: 'Accept customer table bookings 24/7. Keep seat turn rates high while automating guest confirmations without extra staff handling.',
    badgeColor: 'bg-(--kc-coral)',
    docLink: '/docs/launch-your-restaurant-website',
    specs: [
      'Automated WhatsApp reservation confirmations',
      'Seat & table limits based on busy time settings',
      'Integrated real-time waitlist widget',
      'No commissions or per-cover booking fees'
    ]
  },
  {
    icon: 'i-heroicons-document-text',
    title: 'Digital Menus Customers Trust',
    description: 'Create high-converting, accessible menus. Allow diners to easily discover dishes, filters, and dietary details on any device.',
    badgeColor: 'bg-(--kc-teal)',
    docLink: '/docs/build-a-menu-customers-can-trust',
    specs: [
      'Spice levels, allergen, and dietary filters',
      'One-click WhatsApp menu import & sync',
      'Fast scannable section navigation (Sticky mobile)',
      'Beautiful responsive food photo galleries'
    ]
  },
  {
    icon: 'i-heroicons-sparkles',
    title: 'ChowBot AI & Content Suite',
    description: 'Unleash artificial intelligence on your operations. Generate descriptions, handle customer messages, and translate in one click.',
    badgeColor: 'bg-indigo-600',
    docLink: '/docs/set-up-restaurant-details',
    specs: [
      'Real-time automated WhatsApp conversations',
      'Instant menu translation to multi-languages',
      'AI dish description & copywriting generator',
      'ChowBot-managed guest QA answering'
    ]
  },
  {
    icon: 'i-heroicons-shopping-bag',
    title: 'Delivery & Order Links',
    description: 'Connect your Grab, Uber Eats, and FoodPanda pages so guests can order from the platform they already use — without leaving your site.',
    badgeColor: 'bg-emerald-600',
    docLink: '/docs/launch-your-restaurant-website',
    specs: [
      'Grab, Uber Eats, and FoodPanda link integration',
      'Order links visible on menu and location pages',
      'One-tap ordering for mobile guests',
      'No setup fees or platform lock-in'
    ]
  },
  {
    icon: 'i-heroicons-chart-bar',
    title: 'Real-Time Insights',
    description: 'Understand exactly how your business is performing. Access a unified dashboard of diner behaviors, sales, and reviews.',
    badgeColor: 'bg-amber-600',
    docLink: '/docs/connect-google-business-profile',
    specs: [
      'Diner cover counts & busiest hour metrics',
      'Google Review aggregation & prompt reply tools',
      'Sales and popular dish analytics tracking',
      'Audience traffic & reservation conversion logs'
    ]
  }
]

const faqItems = [
  {
    q: 'Can I map a custom domain?',
    a: 'Absolutely. Every KrabiClaw site can easily connect to custom domains (like yourrestaurant.com). We provide full, free SSL certificates and global edge routing for speed.'
  },
  {
    q: 'Are there any hidden booking fees?',
    a: 'None. Unlike OpenTable or Resy, which charge per reservation cover, KrabiClaw is flat-rate. Whether you take 10 or 10,000 bookings, you pay the same low price.'
  },
  {
    q: 'How does the Google Business Profile sync work?',
    a: 'Connect your Google Business account and KrabiClaw pulls in your verified hours, photos, reviews, and business details automatically. On Managed plans, we keep your Google Business profile up to date for you.'
  },
  {
    q: 'Is there a contract or setup fee?',
    a: 'No contracts, no setup fees. Start free, and upgrade to Growth ($49/mo) or Managed ($149/mo) month-to-month. Cancel anytime.'
  }
]
</script>
