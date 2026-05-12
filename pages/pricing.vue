<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-6xl mx-auto">

      <!-- Header -->
      <div class="text-center mb-16">
        <h1 class="text-5xl font-bold text-(--ui-text) mb-6">Simple, Transparent Pricing</h1>
        <p class="text-xl text-(--ui-text-muted) max-w-3xl mx-auto">
          Start free. Pay per location as you grow. No setup fees, no long-term contracts.
        </p>
      </div>

      <!-- Billing toggle -->
      <div class="flex items-center justify-center gap-4 mb-12">
        <span class="text-(--ui-text-muted)" :class="{ 'font-semibold text-(--ui-text)': !annual }">Monthly</span>
        <button
          class="relative w-12 h-6 rounded-full transition-colors"
          :class="annual ? 'bg-(--kc-teal)' : 'bg-(--ui-bg-muted)'"
          @click="annual = !annual"
          aria-label="Toggle annual billing"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
            :class="{ 'translate-x-6': annual }"
          />
        </button>
        <span class="text-(--ui-text-muted)" :class="{ 'font-semibold text-(--ui-text)': annual }">
          Annual <span class="text-sm font-normal text-emerald-600 ml-1">Save ~30%</span>
        </span>
      </div>

      <!-- Pricing Cards -->
      <div class="grid md:grid-cols-3 gap-8 mb-16">

        <!-- Free Plan -->
        <div class="bg-(--ui-bg-elevated) rounded-2xl shadow-sm border border-(--ui-border) p-8 flex flex-col">
          <div class="mb-6">
            <h3 class="text-2xl font-bold text-(--ui-text) mb-1">Free</h3>
            <p class="text-(--ui-text-muted) text-sm">Get your restaurant online today</p>
          </div>
          <div class="mb-6">
            <span class="text-4xl font-bold text-(--ui-text)">$0</span>
            <span class="text-(--ui-text-muted)">/month</span>
          </div>
          <ul class="space-y-3 text-(--ui-text-muted) mb-8 flex-1">
            <li v-for="item in freePlan" :key="item" class="flex items-start gap-2">
              <svg class="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span>{{ item }}</span>
            </li>
          </ul>
          <UButton variant="outline" color="neutral" size="xl" class="w-full" to="/signup">Start Free</UButton>
        </div>

        <!-- Pro Plan -->
        <div class="bg-(--ui-bg-inverted) text-white rounded-2xl shadow-lg p-8 flex flex-col transform scale-105">
          <div class="flex items-start justify-between mb-6">
            <div>
              <h3 class="text-2xl font-bold mb-1">Pro</h3>
              <p class="text-white/70 text-sm">Per location, per month</p>
            </div>
            <span class="bg-(--kc-coral) text-white px-3 py-1 text-sm font-medium rounded-full shrink-0">Most Popular</span>
          </div>
          <div class="mb-6">
            <span class="text-4xl font-bold">{{ annual ? '$249' : '$29' }}</span>
            <span class="text-white/70">{{ annual ? '/location/year' : '/location/month' }}</span>
            <p v-if="annual" class="text-sm text-emerald-400 mt-1">≈ $20.75/month — save $99/year per location</p>
          </div>
          <ul class="space-y-3 text-white/85 mb-8 flex-1">
            <li v-for="item in proPlan" :key="item" class="flex items-start gap-2">
              <svg class="w-5 h-5 text-green-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span>{{ item }}</span>
            </li>
          </ul>
          <UButton size="xl" class="w-full text-white hover:opacity-90" style="background-color: var(--kc-coral)" to="/signup">
            Start 14-Day Free Trial
          </UButton>
        </div>

        <!-- Agency Plan -->
        <div class="bg-(--ui-bg-elevated) rounded-2xl shadow-sm border border-(--ui-border) p-8 flex flex-col">
          <div class="mb-6">
            <h3 class="text-2xl font-bold text-(--ui-text) mb-1">Agency</h3>
            <p class="text-(--ui-text-muted) text-sm">Unlimited sites, one flat rate</p>
          </div>
          <div class="mb-6">
            <span class="text-4xl font-bold text-(--ui-text)">{{ annual ? '$990' : '$99' }}</span>
            <span class="text-(--ui-text-muted)">{{ annual ? '/year' : '/month' }}</span>
            <p v-if="annual" class="text-sm text-emerald-600 mt-1">2 months free</p>
          </div>
          <ul class="space-y-3 text-(--ui-text-muted) mb-8 flex-1">
            <li v-for="item in agencyPlan" :key="item" class="flex items-start gap-2">
              <svg class="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span>{{ item }}</span>
            </li>
          </ul>
          <UButton variant="outline" color="neutral" size="xl" class="w-full" to="/contact">Contact Us</UButton>
        </div>

      </div>

      <!-- Per-location callout -->
      <div class="max-w-3xl mx-auto mb-16 bg-(--ui-bg-muted) rounded-2xl p-8 text-center">
        <h3 class="text-xl font-bold text-(--ui-text) mb-3">Why per-location pricing?</h3>
        <p class="text-(--ui-text-muted)">
          A single restaurant and a chain with five locations get very different value from their website.
          Per-location pricing means you start small and only pay more as your business actually grows.
          A 5-location brand on Pro pays $145/month — less than one hour of traditional web agency work.
        </p>
      </div>

      <!-- Feature Comparison -->
      <div class="max-w-4xl mx-auto mb-16 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-(--ui-border)">
              <th class="text-left py-4 text-(--ui-text-muted) font-medium w-1/2">Feature</th>
              <th class="text-center py-4 text-(--ui-text) font-semibold">Free</th>
              <th class="text-center py-4 text-(--ui-text) font-semibold">Pro</th>
              <th class="text-center py-4 text-(--ui-text) font-semibold">Agency</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--ui-border)">
            <tr v-for="row in comparisonRows" :key="row.feature">
              <td class="py-4 text-(--ui-text-muted)">{{ row.feature }}</td>
              <td class="py-4 text-center" v-html="renderCell(row.free)" />
              <td class="py-4 text-center" v-html="renderCell(row.pro)" />
              <td class="py-4 text-center" v-html="renderCell(row.agency)" />
            </tr>
          </tbody>
        </table>
      </div>

      <!-- FAQ -->
      <div class="max-w-3xl mx-auto">
        <h2 class="text-3xl font-bold text-(--ui-text) text-center mb-12">Frequently Asked Questions</h2>
        <div class="space-y-4">
          <div v-for="faq in faqs" :key="faq.q" class="bg-(--ui-bg-elevated) rounded-xl border border-(--ui-border)">
            <button
              class="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
              @click="openFaq = openFaq === faq.q ? null : faq.q"
            >
              <span class="font-semibold text-(--ui-text)">{{ faq.q }}</span>
              <UIcon :name="openFaq === faq.q ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="shrink-0 w-5 h-5 text-(--ui-text-muted)" />
            </button>
            <div v-if="openFaq === faq.q" class="px-6 pb-5 text-(--ui-text-muted)">{{ faq.a }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform' })

const annual = ref(false)
const openFaq = ref<string | null>(null)

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
  { name: 'Pricing', url: `https://${platformHostname.value}/pricing` }
])

const freePlan = computed(() => [
  `Subdomain (your-restaurant.${platformHostname.value})`,
  'Saya restaurant theme',
  'Visual content editor',
  'Menu management',
  'Basic SEO (schema markup, sitemap)',
  'Mobile-responsive design',
  '500 AI credits / month',
  '1 location',
])

const proPlan = [
  'Everything in Free, plus:',
  'Custom domain + free SSL',
  'Google Business Profile sync',
  'Auto-sync reviews, hours & photos',
  'Advanced SEO tools',
  '5,000 AI credits / month',
  'Unlimited locations (billed per location)',
  'Priority email support',
]

const agencyPlan = [
  'Everything in Pro, plus:',
  'Unlimited sites at one flat rate',
  'API access',
  'White-label ready',
  'Dedicated account manager',
  '50,000 AI credits / month',
  'Custom theme development on request',
]

const comparisonRows = [
  { feature: 'Locations', free: '1', pro: 'Unlimited', agency: 'Unlimited' },
  { feature: 'Custom domain', free: false, pro: true, agency: true },
  { feature: 'SSL certificate', free: true, pro: true, agency: true },
  { feature: 'Google Business sync', free: false, pro: true, agency: true },
  { feature: 'AI credits / month', free: '500', pro: '5,000', agency: '50,000' },
  { feature: 'AI menu extraction', free: true, pro: true, agency: true },
  { feature: 'Reservations page', free: true, pro: true, agency: true },
  { feature: 'Reviews display', free: true, pro: true, agency: true },
  { feature: 'SEO & schema markup', free: 'Basic', pro: 'Advanced', agency: 'Advanced' },
  { feature: 'White-label', free: false, pro: false, agency: true },
  { feature: 'API access', free: false, pro: false, agency: true },
  { feature: 'Support', free: 'Community', pro: 'Priority email', agency: 'Dedicated' },
]

const faqs = [
  {
    q: 'What counts as a location?',
    a: 'Each physical restaurant address is one location. A brand with two restaurants pays for two Pro locations ($58/month). Your website and dashboard are shared across all locations — only the billing scales.'
  },
  {
    q: 'Can I add or remove locations anytime?',
    a: 'Yes. Additions are prorated immediately. Removals take effect at the end of your current billing period. You can manage everything from Dashboard → Billing.'
  },
  {
    q: 'Is there a free trial for Pro?',
    a: 'Yes — Pro comes with a 14-day free trial. No credit card required to start.'
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 30-day money-back guarantee on all paid plans. Email hello@krabiclaw.com within 30 days of your first payment.'
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major credit and debit cards (Visa, Mastercard, Amex) via Stripe. Agency plans can be invoiced by bank transfer.'
  },
  {
    q: 'What are AI credits used for?',
    a: 'AI credits power menu extraction from photos, content generation, and the ChowBot AI assistant. Credits reset monthly. Additional top-ups are available from Dashboard → Billing.'
  },
]

function renderCell(val: boolean | string) {
  if (val === true) return '<svg class="w-5 h-5 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>'
  if (val === false) return '<span class="text-(--ui-text-dimmed)">—</span>'
  return `<span class="text-(--ui-text-muted)">${val}</span>`
}

useSeoMeta({
  title: 'Pricing | KrabiClaw',
  description: 'Per-location pricing for restaurant websites. Start free, pay $29/location/month as you grow. No setup fees, 14-day free trial.',
  ogImage: '/og-image.jpg',
  ogUrl: computed(() => `https://${platformHostname.value}/pricing`),
  ogType: 'website'
})

useSchemaOrg([
  ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'KrabiClaw Pricing Plans',
    mainEntity: {
      '@type': 'OfferCatalog',
      name: 'KrabiClaw Pricing Plans',
      itemListElement: [
        {
          '@type': 'Offer',
          name: 'Free',
          price: '0',
          priceCurrency: 'USD',
          description: 'Get started free with basic features'
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '29',
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          description: 'Professional features per location per month'
        },
        {
          '@type': 'Offer',
          name: 'Agency',
          priceCurrency: 'USD',
          priceSpecification: [
            {
              '@type': 'UnitPriceSpecification',
              price: '99',
              priceCurrency: 'USD',
              billingDuration: 'P1M'
            },
            {
              '@type': 'UnitPriceSpecification',
              price: '990',
              priceCurrency: 'USD',
              billingDuration: 'P1Y'
            }
          ],
          description: 'Unlimited sites and advanced features'
        }
      ]
    }
  })
])
</script>
