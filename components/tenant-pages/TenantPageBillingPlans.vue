<template>
  <section data-billing-plans class="my-12">
    <h2 v-if="title" class="mb-6 text-2xl font-semibold">{{ title }}</h2>
    <BillingPricingTable v-if="plans" :plans="plans" />
    <p v-else data-billing-plans-unavailable class="rounded-2xl border border-dashed border-default p-6 text-sm text-muted">
      Pricing is unavailable right now.
    </p>
  </section>
</template>

<script setup lang="ts">
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { Plan } from '~/composables/usePlans'

/**
 * The platform presentation of a `feature_grid` whose source is `billing_plans`.
 *
 * The block stores a heading and nothing else. Every amount, interval, price id
 * and entitlement on this page comes from the Stripe-backed billing response
 * through the same `usePlans()` / `BillingPricingTable` path the dashboard
 * reads, so KrabiClaw's published prices have exactly one source and the CMS
 * document cannot drift from it.
 */
defineProps<{ title?: string | null }>()

const { plans, monthlyPrice } = usePlans()
const config = useRuntimeConfig()
const requestURL = useRequestURL()
const pageUrl = resolveSeoUrl('/pricing', config.public.siteUrl || requestURL.origin)

const OFFER_DESCRIPTIONS: Record<string, string> = {
  free: 'Free business website with offerings and basic SEO',
  growth: 'Custom domain, messaging notifications, and Google Places imports',
}

function offerFor(plan: Plan) {
  const description = OFFER_DESCRIPTIONS[plan.id] ?? plan.tagline
  // A plan with no subscription price is the canonical no-subscription plan and
  // is offered at zero. A paid plan whose monthly price Stripe did not return
  // has no offer to publish — the previous `price: '0'` here advertised a paid
  // plan as free in structured data whenever the catalog was incomplete.
  if (plan.prices.length === 0) {
    return { '@type': 'Offer', name: plan.name, priceCurrency: 'USD', price: '0', description }
  }
  const monthly = monthlyPrice(plan)
  if (monthly === null) return null
  return {
    '@type': 'Offer',
    name: plan.name,
    priceCurrency: 'USD',
    priceSpecification: [{ '@type': 'UnitPriceSpecification', price: String(monthly / 100), priceCurrency: 'USD', billingDuration: 'P1M' }],
    description,
  }
}

useSchemaOrg(() => {
  const available = plans.value
  if (!available) return null
  const offers = available.map(offerFor).filter((offer): offer is NonNullable<ReturnType<typeof offerFor>> => offer !== null)
  if (!offers.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    '@id': `${pageUrl}#offers`,
    name: 'KrabiClaw Pricing Plans',
    itemListElement: offers,
  }
})
</script>
