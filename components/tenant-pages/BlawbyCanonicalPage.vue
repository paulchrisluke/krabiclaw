<template>
  <div data-parity-root>
    <template v-if="page.path === '/about'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="about" />
      <BlawbyTeamSection :people="teamPeople" :features="teamFeatures" />
      <BlawbyShieldDivider variant="about" />
      <BlawbyImpactSection v-if="impactBlock" v-bind="impactProps" />
      <BlawbyServicesSection v-if="servicesBlock" v-bind="servicesProps" :offerings="offerings" />
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyReviewsSection :reviews="reviews" :description="reviewsDescription" />
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" />
    </template>

    <template v-else-if="page.path === '/pricing'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="pricing" />
      <BlawbyShieldDivider variant="pricing" />
      <BlawbyPricingSection :plans="pricingPlans" :calculator="pricingCalculator" />
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyServicesSection v-if="servicesBlock" v-bind="servicesProps" :offerings="offerings" />
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" />
    </template>

    <template v-else-if="page.path === '/donate'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="donate">
        <BlawbyDonationChoices :tiers="donationTiers" :destination="donationDestination" />
      </BlawbyPageHero>
      <BlawbyShieldDivider variant="donate" />
      <BlawbyImpactSection v-if="impactBlock" v-bind="impactProps" />
      <section v-if="supportBlock" class="bg-white py-16" data-parity-section="donation-support">
        <div class="blawby-container mx-auto max-w-4xl">
          <h2 class="blawby-display text-3xl font-bold text-[var(--blawby-primary-dark)]">{{ stringValue(supportBlock.data.title) }}</h2>
          <p class="mt-4 text-lg leading-8 text-gray-600">{{ stringValue(supportBlock.data.body) }}</p>
          <div class="mt-8 flex flex-wrap gap-3">
            <BlawbyButton v-for="button in supportButtons" :key="button.url" :to="button.url">{{ button.label }}</BlawbyButton>
          </div>
        </div>
      </section>
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
    </template>

    <template v-else>
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" :variant="legalVariant" />
      <BlawbyShieldDivider :variant="legalVariant" />
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { BlawbyShieldVariant, PublicOfferingSummary, PublicSiteQa, PublicSiteReview } from '~/types/blawby'

type RecordValue = Record<string, unknown>

const props = defineProps<{ page: PublicTenantPage }>()

function recordValue(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function arrayRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as RecordValue[] : []
}

function block(type: string, predicate?: (_data: RecordValue) => boolean) {
  return props.page.blocks.find(candidate => candidate.type === type && (!predicate || predicate(candidate.data))) ?? null
}

function assetUrl(value: unknown): string | null {
  const record = recordValue(value)
  return stringValue(record.url) || null
}

const heroBlock = computed(() => block('hero'))
const heroTitle = computed(() => stringValue(heroBlock.value?.data.title) || props.page.title)
const heroDescription = computed(() => stringValue(heroBlock.value?.data.description) || props.page.summary || '')

const teamBlock = computed(() => block('feature_grid', data => data.type === 'team' || Array.isArray(data.people)))
const teamFeatures = computed(() => arrayRecords(teamBlock.value?.data.features).map(feature => ({
  title: stringValue(feature.title),
  description: stringValue(feature.description),
  icon_url: assetUrl(feature.icon),
})).filter(feature => feature.title))
const teamPeople = computed(() => arrayRecords(teamBlock.value?.data.people).map(person => ({
  first_name: stringValue(person.first_name),
  last_name: stringValue(person.last_name),
  title: stringValue(person.title) || null,
  bio: stringValue(person.bio) || null,
  url: stringValue(person.url) || null,
  image_url: assetUrl(person.image),
})).filter(person => person.first_name || person.last_name))

const impactBlock = computed(() => block('feature_grid', data => data.section === 'donation' && Array.isArray(data.items)))
const impactProps = computed(() => ({
  title: stringValue(impactBlock.value?.data.title) || 'Our Impact in Numbers',
  description: stringValue(impactBlock.value?.data.description) || null,
  additionalDescription: stringValue(impactBlock.value?.data.additionalDescription) || null,
  statistics: arrayRecords(impactBlock.value?.data.items).map(item => ({ value: stringValue(item.value), label: stringValue(item.title) })).filter(item => item.value && item.label),
}))

const servicesBlock = computed(() => block('offering_grid', data => data.section === 'services'))
const offerings = computed<PublicOfferingSummary[]>(() => arrayRecords(servicesBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  name: stringValue(item.title),
  slug: stringValue(item.url).replace(/^\/services\//, ''),
  label: stringValue(item.label) || null,
  summary: stringValue(item.description) || null,
  short_description: stringValue(item.description) || null,
  thumbnail_url: stringValue(item.image_url) || null,
  canonical_path: stringValue(item.url),
  sort_order: 0,
  featured: false,
})).filter(item => item.id && item.name && item.slug))
const servicesProps = computed(() => ({
  title: stringValue(servicesBlock.value?.data.title) || 'Our',
  accent: stringValue(servicesBlock.value?.data.accent) || 'Services',
  description: stringValue(servicesBlock.value?.data.description),
  decorationUrl: assetUrl(servicesBlock.value?.data.decoration),
}))

const faqBlock = computed(() => block('faq'))
const faqs = computed<PublicSiteQa[]>(() => arrayRecords(faqBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  question: stringValue(item.title),
  answer: stringValue(item.description) || null,
  sort_order: 0,
})).filter(item => item.id && item.question))
const faqDecoration = computed(() => assetUrl(faqBlock.value?.data.decoration))

const reviewsBlock = computed(() => block('testimonial_grid'))
const reviewsDescription = computed(() => stringValue(reviewsBlock.value?.data.description) || undefined)
const reviews = computed<PublicSiteReview[]>(() => arrayRecords(reviewsBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  author_name: stringValue(item.title),
  reviewer_photo_url: null,
  rating: Number(item.value) || 5,
  title: null,
  content: stringValue(item.description),
  original_review_date: null,
  verified: true,
})).filter(item => item.id && item.author_name))

const pricingBlock = computed(() => block('offering_grid', data => data.section === 'pricing'))
const pricingPlans = computed(() => arrayRecords(pricingBlock.value?.data.items).map(item => ({
  discount: stringValue(item.title),
  price: stringValue(item.value),
  description: stringValue(item.description),
  features: stringValue(item.description) ? [stringValue(item.description)] : [],
})))
const calculatorBlock = computed(() => block('feature_grid', data => recordValue(data.calculator).rows !== undefined))
const pricingCalculator = computed(() => {
  const calculator = recordValue(calculatorBlock.value?.data.calculator)
  return {
    enabled: Array.isArray(calculator.rows),
    note: stringValue(calculator.note),
    table: { rows: Array.isArray(calculator.rows) ? calculator.rows : [] },
  }
})

const donationBlock = computed(() => block('donation_choices'))
const donationDestination = computed(() => stringValue(donationBlock.value?.data.destination) || null)
const donationTiers = computed(() => arrayRecords(donationBlock.value?.data.tiers).map(tier => ({
  amount: Number(tier.amount) || 0,
  title: stringValue(tier.title),
  description: stringValue(tier.description),
  featured: tier.featured === true,
  icon: stringValue(tier.icon) || 'ScaleIcon',
})).filter(tier => tier.amount > 0 && tier.title))
const supportBlock = computed(() => block('callout', data => Boolean(data.title || data.body || data.buttons)))
const supportButtons = computed(() => arrayRecords(supportBlock.value?.data.buttons).map(button => ({ label: stringValue(button.label), url: stringValue(button.url) })).filter(button => button.label && button.url))

const ctaBlock = computed(() => block('contact_cta'))
const ctaProps = computed(() => ({
  title: stringValue(ctaBlock.value?.data.title) || 'Get started today',
  description: stringValue(ctaBlock.value?.data.description) || null,
  label: stringValue(ctaBlock.value?.data.label) || 'Contact us',
  destination: stringValue(ctaBlock.value?.data.url) || '/contact',
  backgroundUrl: assetUrl(ctaBlock.value?.data.background),
  featuredUrl: assetUrl(ctaBlock.value?.data.featured),
}))

const legalVariant = computed<BlawbyShieldVariant>(() => {
  if (props.page.path === '/policies/privacy') return 'privacy'
  if (props.page.path === '/policies/terms') return 'terms'
  return 'third-party-notices'
})
</script>
