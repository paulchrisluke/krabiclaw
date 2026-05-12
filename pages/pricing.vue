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

      <BillingPricingTable />

      <!-- FAQ -->
      <div class="max-w-3xl mx-auto mt-20">
        <h2 class="text-3xl font-bold text-(--ui-text) text-center mb-12">Frequently Asked Questions</h2>
        <div class="space-y-4">
          <div v-for="faq in faqs" :key="faq.q" class="bg-(--ui-bg-elevated) rounded-xl border border-(--ui-border)">
            <button
              class="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
              @click="openFaq = openFaq === faq.q ? null : faq.q"
            >
              <span class="font-semibold text-(--ui-text)">{{ faq.q }}</span>
              <UIcon
                :name="openFaq === faq.q ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="shrink-0 w-5 h-5 text-(--ui-text-muted)"
              />
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
  { name: 'Pricing', url: `https://${platformHostname.value}/pricing` },
])

const faqs = [
  {
    q: 'What counts as a location?',
    a: 'Each physical restaurant address is one location. A brand with two restaurants pays for two Pro locations ($58/month). Your website and dashboard are shared across all locations — only the billing scales.',
  },
  {
    q: 'Can I add or remove locations anytime?',
    a: 'Yes. Additions are prorated immediately. Removals take effect at the end of your current billing period. You can manage everything from Dashboard → Billing.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. The Free plan is free forever — no credit card required. You only need a card when you upgrade to Pro.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 30-day money-back guarantee on all paid plans. Email hello@krabiclaw.com within 30 days of your first payment.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major credit and debit cards (Visa, Mastercard, Amex) via Stripe. Agency plans can be invoiced by bank transfer.',
  },
  {
    q: 'What are AI credits used for?',
    a: 'AI credits power menu extraction from photos, content generation, and the ChowBot AI assistant. Credits reset monthly. Additional top-ups are available from Dashboard → Billing.',
  },
]

useSeoMeta({
  title: 'Pricing | KrabiClaw',
  description: 'Per-location pricing for restaurant websites. Free forever, or upgrade to Pro at $29/location/month as you grow. No setup fees, no contracts.',
  ogImage: '/og-image.jpg',
  ogUrl: computed(() => `https://${platformHostname.value}/pricing`),
  ogType: 'website',
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
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', description: 'Get started free with basic features' },
        { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD', billingDuration: 'P1M', description: 'Professional features per location per month' },
        {
          '@type': 'Offer',
          name: 'Agency',
          priceCurrency: 'USD',
          priceSpecification: [
            { '@type': 'UnitPriceSpecification', price: '99', priceCurrency: 'USD', billingDuration: 'P1M' },
            { '@type': 'UnitPriceSpecification', price: '990', priceCurrency: 'USD', billingDuration: 'P1Y' },
          ],
          description: 'Unlimited sites and advanced features',
        },
      ],
    },
  }),
])
</script>
