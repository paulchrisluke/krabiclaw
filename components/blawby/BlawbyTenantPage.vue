<template>
  <div data-parity-root>
    <template v-if="recipe === 'about'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="about" />
      <BlawbyTeamSection :people="teamPeople" :features="teamFeatures" />
      <BlawbyShieldDivider variant="about" />
      <BlawbyImpactSection v-if="impactBlock" v-bind="impactProps" />
      <BlawbyServicesSection v-bind="servicesProps" :offerings="routeData.offerings" />
      <BlawbyFaqSection :items="routeData.qa" :decoration-url="qaDecoration" />
      <BlawbyReviewsSection :reviews="routeData.reviews" />
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" @click="trackConsultation" />
    </template>

    <template v-else-if="recipe === 'pricing'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="pricing" />
      <BlawbyShieldDivider variant="pricing" />
      <BlawbyPricingSection :plans="pricingPlans" :calculator="calculatorBlock || {}" />
      <BlawbyFaqSection :items="routeData.qa" :decoration-url="qaDecoration" />
      <BlawbyServicesSection v-bind="servicesProps" :offerings="routeData.offerings" />
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" @click="trackConsultation" />
    </template>

    <template v-else-if="recipe === 'donate'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="donate">
        <BlawbyDonationChoices
          :tiers="donationTiers"
          :destination="resolvedPage.cta_url"
          @click="trackDonation"
        />
      </BlawbyPageHero>
      <BlawbyShieldDivider variant="donate" />
      <BlawbyDonationSupport
        :impact="impactBlock ? impactProps : null"
        :support="donationSupport"
      />
      <BlawbyFaqSection :items="routeData.qa" :decoration-url="qaDecoration" />
    </template>

    <template v-else-if="recipe === 'privacy' || recipe === 'terms'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" :variant="recipe" />
      <article class="bg-white px-6 pb-12 pt-8 sm:pb-16" data-parity-section="legal-content">
        <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700">
          <p v-if="recipe === 'privacy' && legalUpdatedAt" class="text-base leading-7 text-gray-600">Last updated: {{ formatLegalDate(legalUpdatedAt) }}</p>
          <BlawbyRichText :content="resolvedPage.body" unstyled class="contents" />
        </div>
      </article>
    </template>

    <template v-else>
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="third-party-notices" />
      <article class="bg-white px-6 pb-12 pt-8 sm:pb-16" data-parity-section="notices">
        <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700"><BlawbyRichText :content="resolvedPage.body" unstyled class="contents" /></div>
      </article>
      <BlawbyConsultationCta v-if="ctaBlock" v-bind="ctaProps" @click="trackConsultation" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { BlawbyRouteRecipe } from '~/types/blawby'

const props = withDefaults(defineProps<{
  path: string
  fallbackTitle?: string
  fallbackSummary?: string
  fallbackBody?: string
  fallbackEyebrow?: string
}>(), {
  fallbackTitle: 'Page',
  fallbackSummary: '',
  fallbackBody: '',
  fallbackEyebrow: 'Information',
})

const recipeByPath: Record<string, BlawbyRouteRecipe> = {
  '/about': 'about',
  '/pricing': 'pricing',
  '/donate': 'donate',
  '/policies/privacy': 'privacy',
  '/policies/terms': 'terms',
  '/third-party-notices': 'third-party-notices',
}
const matchedRecipe = recipeByPath[props.path]
if (!matchedRecipe) throw createError({ statusCode: 404, statusMessage: 'Unsupported Blawby page recipe' })
const recipe: BlawbyRouteRecipe = matchedRecipe
const { data, error } = await useBlawbyRoute(recipe)
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page content not found' })
const resolvedPage = computed(() => page.value!)
const { identity, consultation } = await useBlawbyShell()

function block(type: string) {
  return page.value?.components.find(component => component.type === type) ?? null
}

function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}

const pageHero = computed(() => block('page_hero'))
const heroTitle = computed(() => String(pageHero.value?.title || page.value?.title || props.fallbackTitle))
const heroDescription = computed(() => {
  const description = pageHero.value?.description
  if (Array.isArray(description)) return description.join('\n\n')
  return String(description || page.value?.summary || props.fallbackSummary)
})
const teamPeople = computed(() => {
  const people = block('team')?.people
  if (!Array.isArray(people)) return []
  return people.map((person: ApiRecord) => ({
    first_name: String(person.first_name || ''),
    last_name: String(person.last_name || ''),
    title: typeof person.title === 'string' ? person.title : null,
    bio: typeof person.bio === 'string' ? person.bio : null,
    url: typeof person.url === 'string' ? person.url : null,
    image_url: assetUrl(person.image),
  }))
})
const teamFeatures = computed(() => {
  const features = block('team')?.features
  if (!Array.isArray(features)) return []
  return features.map((feature: ApiRecord) => ({
    title: String(feature.title || ''),
    description: String(feature.description || ''),
    icon_url: assetUrl(feature.icon),
  }))
})
const impactBlock = computed(() => block('impact'))
const impactProps = computed(() => ({
  title: String(impactBlock.value?.title || 'Our Impact in Numbers'),
  description: typeof impactBlock.value?.description === 'string' ? impactBlock.value.description : null,
  additionalDescription: typeof impactBlock.value?.additionalDescription === 'string' ? impactBlock.value.additionalDescription : null,
  statistics: Array.isArray(impactBlock.value?.statistics)
    ? impactBlock.value.statistics.map((stat: ApiRecord) => ({ value: String(stat.value || ''), label: String(stat.label || '') }))
    : [],
}))
const pricingPlans = computed(() => Array.isArray(block('pricing_plans')?.plans) ? block('pricing_plans')!.plans as ApiRecord[] : [])
const calculatorBlock = computed(() => block('pricing_calculator'))
const donationTiers = computed(() => {
  const tiers = block('donation_choices')?.tiers
  if (!Array.isArray(tiers)) return []
  return tiers.map((tier: ApiRecord) => ({
    amount: Number(tier.amount || 0),
    title: String(tier.title || ''),
    description: String(tier.description || ''),
    featured: tier.featured === true,
    icon: String(tier.icon || 'ScaleIcon'),
  })).filter(tier => tier.amount > 0 && tier.title)
})
const donationSupport = computed(() => block('donation_support') as {
  difference: { title: string; description: string; items: string[] }
  other_ways: { title: string; description: string; items: Array<{ title: string; description: string; url: string; icon: string }> }
} | null)
const legalUpdatedAt = computed(() => {
  const value = block('legal_meta')?.updated_at
  return typeof value === 'string' ? value : null
})
const servicesBlock = computed(() => block('services_intro'))
const ctaBlock = computed(() => block('consultation_cta'))
const qaDecoration = computed(() => assetUrl(block('qa')?.decoration))
const servicesProps = computed(() => ({
  title: String(servicesBlock.value?.title || 'Our'),
  accent: String(servicesBlock.value?.accent || 'Services'),
  description: String(servicesBlock.value?.description || ''),
  decorationUrl: assetUrl(servicesBlock.value?.decoration),
}))

const { trackConsultationClick, trackDonationClick } = useBlawbyConversionTracking(consultation)
const canonicalUrl = useSeoUrl(() => page.value?.canonical_url || props.path)
const ctaProps = computed(() => ({
  title: String(ctaBlock.value?.title || 'Get started today'),
  description: String(ctaBlock.value?.description || ''),
  label: String(ctaBlock.value?.label || consultation.value.cta_label),
  destination: consultation.value.external_url || String(ctaBlock.value?.url || consultation.value.schedule_path),
  backgroundUrl: assetUrl(ctaBlock.value?.background),
  featuredUrl: assetUrl(ctaBlock.value?.featured),
}))

function trackConsultation() {
  trackConsultationClick(recipe, props.path, consultation.value.external_url || consultation.value.schedule_path)
}

function trackDonation() {
  if (page.value?.cta_url) trackDonationClick(props.path, page.value.cta_url)
}

function formatLegalDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
}

useSeoMeta({
  title: computed(() => page.value?.seo_title || `${heroTitle.value} | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || page.value?.summary || ''),
  ogUrl: canonicalUrl,
})
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  meta: page.value?.robots ? [{ name: 'robots', content: page.value.robots }] : [],
}))
</script>
