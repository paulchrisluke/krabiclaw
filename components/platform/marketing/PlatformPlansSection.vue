<template>
  <!-- The homepage's pricing band: a gradient wash behind a header and the table. -->
  <section v-if="variant === 'home'" id="pricing" class="relative py-24 overflow-hidden" data-parity-section="plans">
    <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg) 0%, var(--ui-bg-elevated) 100%);"></div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-4">
        <span v-if="eyebrow" class="kc-eyebrow text-muted">{{ eyebrow }}</span>
        <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0 text-default">{{ title }}</h2>
        <p v-if="description" class="text-lg leading-relaxed text-muted m-0">{{ description }}</p>
      </div>
      <BillingPricingTable v-if="plans" :plans="plans" />
      <p v-else data-billing-plans-unavailable class="rounded-2xl border border-dashed border-default p-6 text-center text-sm text-muted">Pricing is unavailable right now.</p>
    </div>
  </section>

  <!-- The Pricing page's glass shell around the same table. -->
  <div v-else class="relative bg-elevated/20 backdrop-blur-md border border-default/50 rounded-[32px] p-6 sm:p-10 shadow-2xl transition-all duration-500 hover:shadow-primary/5" data-parity-section="plans">
    <BillingPricingTable v-if="plans" :plans="plans" />
    <p v-else data-billing-plans-unavailable class="rounded-2xl border border-dashed border-default p-6 text-center text-sm text-muted">Pricing is unavailable right now.</p>
  </div>
</template>

<script setup lang="ts">
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { Plan } from '~/composables/usePlans'

/**
 * KrabiClaw's plans, published on KrabiClaw's own pages.
 *
 * The block that places this section stores a heading and `source:
 * billing_plans`, nothing else. Every amount, interval, price id and
 * entitlement comes from the Stripe-backed billing response through the same
 * `usePlans()` / `BillingPricingTable` path the dashboard reads, so the
 * published prices have exactly one source and a document cannot drift from
 * it. The OfferCatalog it publishes follows the same rule: a plan with no
 * subscription price is offered at zero because that is what it costs; a paid
 * plan whose monthly price Stripe did not return has no offer.
 */
const props = withDefaults(defineProps<{
  variant: 'home' | 'pricing'
  eyebrow?: string | null
  title?: string | null
  description?: string | null
}>(), {
  eyebrow: null,
  title: null,
  description: null,
})

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

// The catalog is stated once, from the pricing page; the homepage repeats the
// table but not the structured data.
useSchemaOrg(() => {
  if (props.variant !== 'pricing') return null
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
