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

    <!-- The legal documents: a shield, then the prose they are. -->
    <template v-else-if="legalVariant">
      <BlawbyPageHero :title="heroTitle" :description="heroDescription" :variant="legalVariant" />
      <BlawbyShieldDivider :variant="legalVariant" />
      <section v-if="bodyBlocks.length" class="blawby-container mx-auto max-w-4xl bg-white py-8 text-gray-900" data-parity-section="legal-body">
        <TenantPageRichTextBlock v-for="bodyBlock in bodyBlocks" :key="bodyBlock.id" :block="bodyBlock" :page-title="page.title" />
      </section>
      <BlawbyFaqSection v-if="faqs.length" :items="faqs" :decoration-url="faqDecoration" />
      <BlawbyConsultationCta v-if="ctaBlock && ctaProps.title && ctaProps.label && ctaProps.destination" v-bind="ctaProps" />
    </template>

    <!--
      Every other page: a practice area, and any leaf a writer adds beside
      them. The gallery beside the title, the feature list as a tablist whose
      panel is that feature's own image — the shape the offering detail page
      had before a practice area became a document, rebuilt on the blocks the
      document carries.
    -->
    <template v-else>
      <section
        class="mx-auto mb-8 max-w-7xl border-b border-slate-200 pt-8 sm:px-6 md:flex lg:px-8"
        :class="gallery.length ? '' : 'mt-8'"
        data-parity-section="service-overview"
      >
        <BlawbyMediaGallery v-if="gallery.length" v-model="activeMedia" :media="gallery" :fallback-alt="page.title" />

        <div :class="gallery.length ? 'flex-1' : ''">
          <div class="blawby-container pb-8 pt-8">
            <h1 v-if="heroTitle" class="mx-auto max-w-4xl blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl md:mt-2">{{ heroTitle }}</h1>
            <div class="mt-6">
              <div class="prose prose-p:text-[var(--blawby-primary)]">
                <p v-if="heroDescription" class="mx-auto mt-6 max-w-2xl text-left text-lg text-[var(--blawby-primary)]">{{ heroDescription }}</p>
                <template v-for="bodyBlock in bodyBlocks" :key="bodyBlock.id">
                  <h2 v-if="headingText(bodyBlock)" class="mx-auto mt-8 max-w-2xl blawby-display text-2xl font-bold text-[var(--blawby-primary)]">{{ headingText(bodyBlock) }}</h2>
                  <BlawbyRichText
                    v-else-if="markdownText(bodyBlock)"
                    unstyled
                    class="mx-auto mt-6 max-w-2xl text-left text-lg text-[var(--blawby-primary)]"
                    :content="markdownText(bodyBlock)"
                  />
                </template>
              </div>
            </div>
            <div v-if="ctaProps.label && ctaProps.destination" class="mt-10 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <BlawbyButton :to="ctaProps.destination" class="w-full gap-2">
                <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
                {{ ctaProps.label }}
              </BlawbyButton>
            </div>
          </div>
        </div>
      </section>

      <section v-if="pageFeatures.length" class="overflow-hidden pb-20 pt-2" data-parity-section="features">
        <div class="relative">
          <div class="mx-auto mt-2 max-w-7xl">
            <div class="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2 lg:items-start lg:gap-y-0">
              <div class="px-6 lg:px-0 lg:pr-4">
                <div class="max-w-2xl">
                  <div class="grid gap-y-6" role="tablist" aria-label="Service features" @keydown="onTabKeydown">
                    <button
                      v-for="(feature, index) in pageFeatures"
                      :key="feature.title"
                      :ref="element => setTabRef(element, index)"
                      type="button"
                      role="tab"
                      :tabindex="index === activeFeature ? 0 : -1"
                      :aria-selected="index === activeFeature"
                      :aria-controls="`feature-panel-${index}`"
                      class="relative flex cursor-pointer items-start pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)]"
                      :class="index === activeFeature ? 'text-[var(--blawby-primary)]' : 'text-gray-500 hover:text-gray-700'"
                      @click="activeFeature = index"
                    >
                      <span class="flex h-full flex-col items-center pr-4 pt-1">
                        <BlawbyFeatureIcon
                          v-if="feature.icon"
                          :name="feature.icon"
                          class="size-5"
                          :class="index === activeFeature ? 'text-[var(--blawby-accent)]' : 'text-gray-600'"
                        />
                        <span
                          class="mt-1 w-0.5 bg-[var(--blawby-accent)] transition-[height] duration-500"
                          :class="index === activeFeature ? 'h-full' : 'h-0'"
                        />
                      </span>
                      <span class="grow">
                        <span class="inline font-semibold" :class="index === activeFeature ? 'text-[var(--blawby-primary)]' : 'text-gray-500'">{{ feature.title }}.</span>
                        <span> {{ feature.description }}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="activeFeatureMedia" :id="`feature-panel-${activeFeature}`" role="tabpanel" class="relative max-w-2xl">
                <img :src="activeFeatureMedia.url" :alt="activeFeatureMedia.alt" width="2432" height="1442" loading="lazy" class="w-full rounded-xl">
              </div>
            </div>
          </div>
        </div>
      </section>

      <!--
        The heading is the section's own: the deleted page passed
        "Frequently asked questions about <name>" into a component that adds
        the gold "questions" itself, and every practice area read
        "…about Family law questions".
      -->
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

/** A heading block's own text. A heading with none is not a heading. */
function headingText(source: PublicTenantPage['blocks'][number]) {
  return source.type === 'heading' ? stringValue(source.data.text) : ''
}

function markdownText(source: PublicTenantPage['blocks'][number]) {
  return source.type === 'markdown' ? stringValue(source.data.markdown) : ''
}

/**
 * The images the page itself carries, in the order it carries them.
 *
 * The document's own placements, not a block's: `cover` is the picture of this
 * page and `gallery` is the rest of the set, which is what the gallery beside
 * the title has always shown.
 */
const gallery = computed(() => props.page.media
  .filter(item => item.kind === 'image' && (item.slot === 'cover' || item.slot === 'gallery'))
  .map(item => ({
    asset_id: item.asset_id,
    public_url: item.public_url,
    alt_text: item.alt_text,
    width: item.width,
    height: item.height,
  })))
const activeMedia = ref(0)

// Two blocks, because they are two things: what the firm does, and who does
// it. They used to be one feature_grid holding `features` beside `people` —
// keys no writer declares, so neither could be edited and every reader had to
// know the private spelling.
const featuresBlock = computed(() => block('feature_grid', data => data.section === 'features'))
const pageFeatures = computed(() => itemsWithMedia(featuresBlock.value).map(({ item, media }) => ({
  title: stringValue(item.title),
  description: stringValue(item.description),
  icon: stringValue(item.icon),
  media,
})).filter(feature => feature.title))

/**
 * The feature list as a tablist: one tab per feature, and the panel is that
 * feature's own image at `items.<index>.image`. A feature without one shows no
 * panel rather than the previous feature's picture.
 */
const activeFeature = ref(0)
const tabRefs = ref<Array<{ focus: () => void } | null>>([])
const activeFeatureMedia = computed(() => {
  const feature = pageFeatures.value[activeFeature.value]
  if (!feature) return null
  const asset = feature.media[0]
  return asset?.public_url ? { url: asset.public_url, alt: asset.alt_text ?? feature.title } : null
})

function setTabRef(element: unknown, index: number) {
  tabRefs.value[index] = element && typeof element === 'object' && 'focus' in element && typeof element.focus === 'function'
    ? element as { focus: () => void }
    : null
}

function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const last = pageFeatures.value.length - 1
  if (event.key === 'Home') activeFeature.value = 0
  else if (event.key === 'End') activeFeature.value = last
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') activeFeature.value = activeFeature.value === last ? 0 : activeFeature.value + 1
  else activeFeature.value = activeFeature.value === 0 ? last : activeFeature.value - 1
  nextTick(() => tabRefs.value[activeFeature.value]?.focus())
}

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

// A shield belongs to a page that has one, and each legal document has its
// own. It is also what says this page is a legal document rather than a leaf:
// a practice area has no shield, no hero band, and its own layout below.
const LEGAL_VARIANTS: Readonly<Record<string, BlawbyShieldVariant>> = {
  '/policies/privacy': 'privacy',
  '/policies/terms': 'terms',
  '/third-party-notices': 'third-party-notices',
}
const legalVariant = computed<BlawbyShieldVariant | null>(() => LEGAL_VARIANTS[props.page.path] ?? null)
</script>
