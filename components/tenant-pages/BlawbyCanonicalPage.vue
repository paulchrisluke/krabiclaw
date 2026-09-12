<template>
  <div data-parity-root>
    <template v-if="page.path === '/about'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="about" />
      <BlawbyFeatureCards :features="pageFeatures" />
      <BlawbyTeamSection :people="teamPeople" />
      <BlawbyShieldDivider variant="about" />
      <BlawbyImpactSection v-if="impactBlock" v-bind="impactProps" />
      <BlawbyServicesSection v-if="servicesBlock" v-bind="servicesProps" :items="serviceItems" />
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyReviewsSection :reviews="reviews" :description="reviewsDescription" />
      <BlawbyConsultationCta v-if="ctaBlock && ctaProps.title && ctaProps.label && ctaProps.destination" v-bind="ctaProps" />
    </template>

    <template v-else-if="page.path === '/services'">
      <BlawbyServicesSection v-if="servicesBlock" v-bind="servicesProps" :items="serviceItems" />
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyConsultationCta v-if="ctaBlock && ctaProps.title && ctaProps.label && ctaProps.destination" v-bind="ctaProps" />
    </template>

    <template v-else-if="page.path === '/pricing'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="pricing" />
      <BlawbyShieldDivider variant="pricing" />
      <BlawbyPricingSection :plans="pricingPlans" :calculator="pricingCalculator" />
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyServicesSection v-if="servicesBlock" v-bind="servicesProps" :items="serviceItems" />
      <BlawbyConsultationCta v-if="ctaBlock && ctaProps.title && ctaProps.label && ctaProps.destination" v-bind="ctaProps" />
    </template>

    <template v-else-if="page.path === '/donate'">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="donate">
        <BlawbyDonationChoices :tiers="donationTiers" :destination="donationDestination" @click="trackDonation" />
      </BlawbyPageHero>
      <BlawbyShieldDivider variant="donate" />
      <BlawbyImpactSection v-if="impactBlock" v-bind="impactProps" />
      <section v-if="supportBlock" class="bg-white py-16" data-parity-section="donation-support">
        <div class="blawby-container mx-auto max-w-4xl">
          <h2 class="blawby-display text-3xl font-bold text-[var(--blawby-primary-dark)]">{{ stringValue(supportBlock.data.title) }}</h2>
          <p class="mt-4 text-lg leading-8 text-gray-600">{{ stringValue(supportBlock.data.body) }}</p>
          <div class="mt-8 flex flex-wrap gap-3">
            <BlawbyButton v-for="button in supportButtons" :key="button.url" :to="localePath(button.url)">{{ button.label }}</BlawbyButton>
          </div>
        </div>
      </section>
      <BlawbyFaqSection :items="faqs" :decoration-url="faqDecoration" />
    </template>

    <!--
      Every other page: the legal documents and the practice areas. Each
      section renders when the page carries that block, so a practice area
      shows its feature cards and its questions — which went unrendered when
      the offering detail component was deleted — and a policy page, carrying
      neither, still shows only its prose.
    -->
    <template v-else>
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" :variant="heroVariant" />
      <BlawbyShieldDivider v-if="dividerVariant" :variant="dividerVariant" />
      <section v-if="bodyBlocks.length" class="blawby-container mx-auto max-w-4xl bg-white py-8 text-gray-900" data-parity-section="legal-body">
        <TenantPageRichTextBlock v-for="bodyBlock in bodyBlocks" :key="bodyBlock.id" :block="bodyBlock" :page-title="page.title" />
      </section>
      <BlawbyFeatureCards :features="pageFeatures" />
      <BlawbyFaqSection v-if="faqs.length" :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyConsultationCta v-if="ctaBlock && ctaProps.title && ctaProps.label && ctaProps.destination" v-bind="ctaProps" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { BlawbyShieldVariant,  PublicSiteQa, PublicSiteReview } from '~/types/blawby'

type RecordValue = Record<string, unknown>

const props = defineProps<{ page: PublicTenantPage }>()
const { localePath } = useI18n()
const { trackDonationClick } = useSiteConversionTracking()

function trackDonation(choice: { label: string; amount: number | null }) {
  trackDonationClick(props.page.id, props.page.path, choice.label, choice.amount)
}

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

// Every caller of mediaUrl() renders the result into a plain <img>, and these
// slots accept either image or video assets — so a video match returns its
// poster (thumbnail_url) instead of the raw video URL, which an <img> can't
// display. Callers that actually want video playback should read block.media
// directly rather than going through this helper.
function mediaUrl(block: PublicTenantPage['blocks'][number] | null | undefined, slot: string): string | null {
  const item = block?.media.find(candidate => candidate.slot === slot)
  if (!item) return null
  return (item.kind === 'video' ? item.thumbnail_url : item.public_url) || null
}

/**
 * A block's items with the media each one carries.
 *
 * One slot spelling for every grid: `items.<index>.image`. Position in the
 * array is the item's identity, so the slot names the index rather than any
 * value inside the item.
 */
function itemsWithMedia(source: PublicTenantPage['blocks'][number] | null | undefined) {
  return arrayRecords(source?.data.items).map((item, index) => ({
    item,
    media: source?.media.filter(asset => asset.slot === `items.${index}.image`) ?? [],
  }))
}

const heroBlock = computed(() => block('hero'))
const bodyBlocks = computed(() => props.page.blocks.filter(candidate => candidate.type === 'heading' || candidate.type === 'markdown'))
const heroTitle = computed(() => stringValue(heroBlock.value?.data.title) ?? '')
const heroDescription = computed(() => stringValue(heroBlock.value?.data.subtitle))

// Two blocks, because they are two things: what the firm does, and who does
// it. They used to be one feature_grid holding `features` beside `people` —
// keys no writer declares, so neither could be edited and every reader had to
// know the private spelling.
const featuresBlock = computed(() => block('feature_grid', data => data.section === 'features'))
const pageFeatures = computed(() => itemsWithMedia(featuresBlock.value).map(({ item, media }) => ({
  title: stringValue(item.title),
  description: stringValue(item.description),
  media,
})).filter(feature => feature.title))

const teamBlock = computed(() => block('team_grid'))
const teamPeople = computed(() => itemsWithMedia(teamBlock.value).map(({ item, media }) => ({
  first_name: stringValue(item.first_name),
  last_name: stringValue(item.last_name),
  title: stringValue(item.title) || null,
  bio: stringValue(item.bio) || null,
  url: stringValue(item.url) || null,
  media,
})).filter(person => person.first_name || person.last_name))

const impactBlock = computed(() => block('feature_grid', data => data.section === 'donation' && Array.isArray(data.items)))
const impactProps = computed(() => ({
  title: stringValue(impactBlock.value?.data.title),
  description: stringValue(impactBlock.value?.data.description) || null,
  additionalDescription: stringValue(impactBlock.value?.data.additionalDescription) || null,
  statistics: arrayRecords(impactBlock.value?.data.items).map(item => ({ value: stringValue(item.value), label: stringValue(item.title) })).filter(item => item.value && item.label),
}))

const servicesBlock = computed(() => block('page_grid', data => data.section === 'services'))
/**
 * The pages this section links to, exactly as the block resolved them.
 *
 * No reshaping into an "offering" shape: the block already carries the title,
 * summary, route and media for each page it names, and re-deriving a slug from
 * the route was how a service card pointed at a path nobody published.
 */
const serviceItems = computed(() => arrayRecords(servicesBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  title: stringValue(item.title),
  description: stringValue(item.description) || undefined,
  url: stringValue(item.url),
  media: (Array.isArray(item.media) ? item.media : []).map(media => ({
    slot: stringValue(media.slot),
    public_url: stringValue(media.public_url),
  })).filter(media => media.slot && media.public_url),
})).filter(item => item.id && item.title && item.url))
const servicesProps = computed(() => ({
  title: stringValue(servicesBlock.value?.data.title),
  accent: stringValue(servicesBlock.value?.data.accent),
  description: stringValue(servicesBlock.value?.data.description),
  decorationUrl: mediaUrl(servicesBlock.value, 'decoration'),
}))

const faqBlock = computed(() => block('faq'))
const faqs = computed<PublicSiteQa[]>(() => arrayRecords(faqBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  question: stringValue(item.title),
  answer: stringValue(item.description) || null,
  sort_order: 0,
})).filter(item => item.id && item.question))
const faqDecoration = computed(() => mediaUrl(faqBlock.value, 'decoration'))

const reviewsBlock = computed(() => block('testimonial_grid'))
const reviewsDescription = computed(() => stringValue(reviewsBlock.value?.data.description) || undefined)
const reviews = computed<PublicSiteReview[]>(() => arrayRecords(reviewsBlock.value?.data.items).map(item => ({
  id: stringValue(item.id),
  author_name: stringValue(item.title),
  media: [],
  rating: Number(item.value) || 5,
  title: null,
  content: stringValue(item.description),
  original_review_date: null,
  verified: false,
  source: null,
  original_reference: null,
  google_review_metadata: null,
})).filter(item => item.id && item.author_name))

// Sliding-scale tiers the firm wrote, not catalog rows: a product_grid's items
// are replaced by the products it references, so authored cards live in a
// feature_grid like every other authored card set on this page.
const pricingBlock = computed(() => block('feature_grid', data => data.section === 'pricing'))
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
  icon: stringValue(tier.icon),
})).filter(tier => tier.amount > 0 && tier.title && tier.icon))
const supportBlock = computed(() => block('callout', data => Boolean(data.title || data.body || data.buttons)))
const supportButtons = computed(() => arrayRecords(supportBlock.value?.data.buttons).map(button => ({ label: stringValue(button.label), url: stringValue(button.url) })).filter(button => button.label && button.url))

const ctaBlock = computed(() => block('contact_cta'))
const ctaProps = computed(() => {
  const destination = stringValue(ctaBlock.value?.data.url)
  return {
    title: stringValue(ctaBlock.value?.data.title),
    description: stringValue(ctaBlock.value?.data.description) || null,
    label: stringValue(ctaBlock.value?.data.label),
    destination: destination ? localePath(destination) : '',
    backgroundUrl: mediaUrl(ctaBlock.value, 'background'),
    featuredUrl: mediaUrl(ctaBlock.value, 'featured'),
  }
})

// A divider belongs to a page that has one. The legal documents each have
// their own; a practice area has none, and returning the third-party-notices
// shield for "anything else" was a default standing in for an answer.
const LEGAL_VARIANTS: Readonly<Record<string, BlawbyShieldVariant>> = {
  '/policies/privacy': 'privacy',
  '/policies/terms': 'terms',
  '/third-party-notices': 'third-party-notices',
}
const dividerVariant = computed<BlawbyShieldVariant | null>(() => LEGAL_VARIANTS[props.page.path] ?? null)
// The hero's variant is a background tint, and every page in this branch has
// to pick one. A practice area reads as part of the firm's own story, so it
// takes the same tint the About page does.
const heroVariant = computed<BlawbyShieldVariant>(() => LEGAL_VARIANTS[props.page.path] ?? 'about')
</script>
