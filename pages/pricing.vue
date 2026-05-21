<template>
  <div class="relative overflow-hidden bg-default min-h-screen py-20 lg:py-28">
    <!-- Ambient Mesh Background Lights -->
    <div class="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
    <div class="absolute bottom-1/3 left-1/4 -z-10 w-[500px] h-[500px] bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>

    <div class="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
      
      <!-- Header -->
      <div class="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center gap-4">
        <!-- Eyebrow -->
        <span class="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/25">
          <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-ping" />
          Simple, Flexible Plans
        </span>
        
        <h1 class="text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.05] tracking-tight text-default text-balance m-0 mt-2">
          Simple, <span class="bg-gradient-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">transparent</span> pricing.
        </h1>
        
        <p class="text-lg leading-relaxed text-muted m-0 max-w-2xl mt-2">
          Start free. Pay per location as you grow. No setup fees, no hidden hooks, cancel at any time.
        </p>
      </div>

      <!-- Main pricing table component -->
      <div class="relative bg-elevated/20 backdrop-blur-md border border-default/50 rounded-[32px] p-6 sm:p-10 shadow-2xl transition-all duration-500 hover:shadow-primary/5">
        <BillingPricingTable />
      </div>

      <!-- FAQ Section -->
      <div class="max-w-3xl mx-auto mt-28">
        <div class="text-center mb-12 flex flex-col items-center gap-2">
          <span class="text-xs font-bold tracking-widest uppercase text-primary">Got Questions?</span>
          <h2 class="text-3xl font-extrabold tracking-tight text-default mt-1">Frequently Asked Questions</h2>
        </div>

        <div class="space-y-4">
          <div
            v-for="faq in faqs"
            :key="faq.q"
            class="group rounded-2xl border transition-all duration-300 bg-elevated/40 backdrop-blur-sm"
            :class="openFaq === faq.q ? 'border-primary/45 bg-elevated/70 shadow-lg shadow-primary/5' : 'border-default hover:border-primary/25 hover:bg-elevated/60'"
          >
            <button
              class="w-full text-left px-6 py-5 flex items-center justify-between gap-4 cursor-pointer"
              @click="openFaq = openFaq === faq.q ? null : faq.q"
            >
              <span 
                class="font-bold text-[15px] transition-colors duration-200"
                :class="openFaq === faq.q ? 'text-primary' : 'text-default group-hover:text-primary/90'"
              >
                {{ faq.q }}
              </span>
              <div 
                class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                :class="openFaq === faq.q ? 'bg-primary/10 text-primary rotate-180' : 'bg-default text-muted group-hover:bg-primary/5 group-hover:text-primary'"
              >
                <UIcon
                  name="i-heroicons-chevron-down"
                  class="shrink-0 w-5 h-5"
                />
              </div>
            </button>
            
            <div 
              v-if="openFaq === faq.q" 
              class="px-6 pb-6 pt-1 text-[14px] leading-relaxed text-muted border-t border-default/30 animate-[fadeIn_0.2s_ease-out]"
            >
              {{ faq.a }}
            </div>
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
    a: 'All major credit and debit cards (Visa, Mastercard, Amex) via Stripe. Enterprise plans can be invoiced by bank transfer.',
  },
  {
    q: 'What are AI credits used for?',
    a: 'AI credits power menu extraction from photos, content generation, and the ChowBot AI assistant. Credits reset monthly. Additional top-ups are available from Dashboard → Billing.',
  },
]
const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/pricing')

useSeoMeta({
  title: 'Pricing | KrabiClaw',
  description: 'Per-location pricing for restaurant websites. Free forever, or upgrade to Pro at $29/location/month as you grow. No setup fees, no contracts.',
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl,
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
        {
          '@type': 'Offer',
          name: 'Pro',
          priceCurrency: 'USD',
          priceSpecification: [
            { '@type': 'UnitPriceSpecification', price: '29', priceCurrency: 'USD', billingDuration: 'P1M' },
          ],
          description: 'Professional features per location per month',
        },
        {
          '@type': 'Offer',
          name: 'Enterprise',
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
