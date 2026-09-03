<template>
  <div data-parity-root>
    <section
      data-blawby-critical-hero
      :data-has-background="heroBackgroundSrc ? 'true' : undefined"
      class="relative overflow-hidden"
      data-parity-section="hero"
    >
      <img
        v-if="heroBackgroundSrc"
        :src="heroBackgroundSrc"
        alt=""
        width="1920"
        height="1080"
        fetchpriority="high"
        loading="eager"
        decoding="async"
        class="absolute inset-0 size-full object-cover object-center"
      >
      <div data-blawby-critical-hero-content class="blawby-container relative pb-36 pt-16 text-left min-[1920px]:pb-48 min-[1920px]:pt-24 min-[2560px]:pb-64 min-[2560px]:pt-32">
        <div data-blawby-critical-hero-columns class="flex flex-wrap gap-x-6 min-[1920px]:gap-x-12 min-[2560px]:gap-x-16">
          <div data-blawby-critical-hero-copy class="w-full lg:w-3/5">
            <h1 class="max-w-4xl whitespace-pre-line blawby-display text-5xl font-medium text-white sm:text-7xl min-[1920px]:max-w-6xl min-[1920px]:text-8xl min-[2560px]:max-w-7xl min-[2560px]:text-9xl">
              {{ heroTitle.before }}<span v-if="heroTitle.accent" class="relative whitespace-nowrap text-[var(--blawby-accent)]">{{ heroTitle.accent }}</span>{{ heroTitle.after }}
            </h1>
            <p v-if="hero.description" class="mt-6 max-w-2xl text-lg text-white min-[1920px]:max-w-3xl min-[1920px]:text-xl min-[2560px]:max-w-4xl min-[2560px]:text-2xl">{{ hero.description }}</p>
          </div>
          <div data-blawby-critical-hero-actions class="w-full lg:w-2/5">
            <div class="mt-10 flex justify-start gap-x-6 min-[1920px]:mt-16 min-[2560px]:mt-20">
              <BlawbyButton v-if="heroDestination && hero.label" :to="heroDestination" class="gap-2" @click="trackConsultation('hero', heroDestination)">
                <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
                {{ hero.label }}
              </BlawbyButton>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="services && routeData.offerings.length && (services.title || services.accent || services.description)" class="relative bg-(--blawby-bg) pb-14 pt-14 sm:pb-20 sm:pt-14 lg:pb-14" data-parity-section="services">
      <div class="blawby-container relative z-20">
        <BlawbySectionHeading
          :title="String(services.title || '')"
          :accent="String(services.accent || '')"
          :description="services.description"
          centered
        />
        <BlawbyServiceGrid :offerings="routeData.offerings" class="mt-20" />
      </div>
      <img v-if="servicesDecorationSrc" :src="servicesDecorationSrc || undefined" alt="" width="1920" height="400" loading="lazy" class="absolute inset-x-0 bottom-0 w-full object-contain">
    </section>

    <BlawbyVideoFeature
      v-if="videoFeature"
      :title="String(videoFeature.title || '')"
      :accent="asOptionalString(videoFeature.accent)"
      :video-url="asOptionalString(videoFeature.video_url)"
      :video-title="asOptionalString(videoFeature.video_title)"
      :features="videoFeatures"
      :images="videoImages"
    />

    <BlawbyFaqSection :items="routeData.qa" :decoration-url="qaDecorationSrc" />
    <BlawbyReviewsSection :reviews="routeData.reviews" :description="reviewsDescription" />

    <div v-if="routeData.posts.length" class="mx-auto my-8 max-w-7xl px-6 lg:px-8" data-parity-section="articles">
      <BlawbySectionHeading title="From the" accent="Blog" centered />
      <BlawbyArticleGrid :posts="routeData.posts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
    </div>
    <div v-if="routeData.posts.length" class="my-4 mb-8 flex justify-center" data-parity-section="articles-more">
      <BlawbyButton :to="localePath('/blog')">See All</BlawbyButton>
    </div>

    <BlawbyConsultationCta
      v-if="ctaBlock && ctaBlock.title && ctaBlock.label && ctaBlock.url"
      :title="String(ctaBlock.title || '')"
      :description="asOptionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || '')"
      :destination="String(ctaBlock.url || '')"
      :background-url="ctaBackgroundSrc"
      :featured-url="ctaFeaturedSrc"
      @click="trackConsultation('cta_section', String(ctaBlock.url || ''))"
    />
  </div>
</template>

<script setup lang="ts">
import type { BlawbyDocumentPayload } from '~/utils/blawby-document-contract'

const data = inject<Ref<BlawbyDocumentPayload>>('blawby-document')
const { localePath } = useI18n()
if (!data) throw createError({ statusCode: 500, statusMessage: 'Blawby document context is unavailable' })
if (!data.value?.route.page) throw createError({ statusCode: 404, statusMessage: 'Homepage content not found' })
const identity = computed(() => data.value!.shell.identity)
const consultation = computed(() => data.value!.shell.consultation)
const compliance = computed(() => data.value!.shell.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)
const criticalPage = computed(() => data.value!.route.page!)
const routeData = computed(() => data.value!.route)

function block(type: string): ApiRecord | null {
  const canonicalType = {
    home_hero: 'hero',
    services_intro: 'offering_grid',
    video_feature: 'feature_grid',
    qa: 'faq',
    reviews: 'testimonial_grid',
    consultation_cta: 'contact_cta',
  }[type]
  const pageBlock = criticalPage.value.blocks.find(candidate => {
    if (candidate.type !== canonicalType) return false
    const section = candidate.data.section
    if (type === 'home_hero') return section === 'hero'
    if (type === 'services_intro') return section === 'services'
    if (type === 'video_feature') return section === 'approach'
    if (type === 'qa') return section === 'qa'
    if (type === 'reviews') return section === 'reviews'
    if (type === 'consultation_cta') return section === 'consultation'
    return true
  })
  if (!pageBlock) return null
  const data = { ...pageBlock.data }
  if (type === 'home_hero') {
    data.label = data.cta_label ?? data.label
    data.url = data.cta_url ?? data.url
  }
  return { ...data, media: pageBlock.media }
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function mediaUrl(value: ApiRecord | null | undefined, slot: string) {
  const media = value?.media
  const item = media?.find((candidate: unknown) => candidate && typeof candidate === 'object' && (candidate as ApiRecord).slot === slot) as ApiRecord | undefined
  return typeof item?.public_url === 'string' ? item.public_url : null
}

const heroBlock = block('home_hero')
if (!heroBlock) throw createError({ statusCode: 502, statusMessage: 'Blawby homepage hero content is invalid' })
const hero = computed(() => heroBlock)
const services = computed(() => block('services_intro'))
const videoFeature = computed(() => block('video_feature'))
const reviewsBlock = computed(() => block('reviews'))
const qaBlock = computed(() => block('qa'))
const ctaBlock = computed(() => block('consultation_cta'))
const heroBackground = computed(() => mediaUrl(hero.value, 'media'))
const heroBackgroundSrc = heroBackground
const servicesDecoration = computed(() => mediaUrl(services.value, 'decoration'))
const servicesDecorationSrc = servicesDecoration
const qaDecorationSrc = computed(() => mediaUrl(qaBlock.value, 'decoration'))
const ctaBackgroundSrc = computed(() => mediaUrl(ctaBlock.value, 'background'))
const ctaFeaturedSrc = computed(() => mediaUrl(ctaBlock.value, 'featured'))
const heroDestination = computed(() => String(hero.value.url || ''))
const heroTitle = computed(() => {
  const title = String(hero.value.title || '')
  const accent = String(hero.value.accent || '')
  const index = accent ? title.indexOf(accent) : -1
  return index >= 0
    ? { before: title.slice(0, index), accent, after: title.slice(index + accent.length) }
    : { before: title, accent: '', after: '' }
})
const videoFeatures = computed(() => Array.isArray(videoFeature.value?.features)
  ? videoFeature.value.features.map((item: ApiRecord) => ({ name: String(item.name || ''), desc: String(item.desc || '') }))
  : [])
const videoImages = computed(() => (Array.isArray(videoFeature.value?.media) ? videoFeature.value.media : [])
  .filter((item: unknown): item is ApiRecord => Boolean(item && typeof item === 'object' && String((item as ApiRecord).slot).startsWith('images.')))
  .sort((a: ApiRecord, b: ApiRecord) => String(a.slot).localeCompare(String(b.slot), undefined, { numeric: true }))
  .map((item: ApiRecord) => ({ url: typeof item.public_url === 'string' ? item.public_url : '', alt: asOptionalString(item.alt_text) }))
  .filter((item: { url: string }) => item.url))
const reviewsDescription = computed(() => String(reviewsBlock.value?.description || ''))

const { trackConsultationClick } = useSiteConversionTracking(consultation)
function trackConsultation(pageType: string, destination: string) {
  trackConsultationClick(pageType, '/', destination)
}

const seoTitle = computed(() => criticalPage.value.seo_title || identity.value.brand_name || '')
const seoDescription = computed(() => criticalPage.value.seo_description || criticalPage.value.summary || identity.value.brand_description || '')

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/',
  title: seoTitle.value,
  description: seoDescription.value,
  brand: {
    siteName: identity.value.brand_name || '',
  },
}))

useProfessionalServiceSchema(() => ({
  recipe: 'home',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: criticalPage.value.seo_title || identity.value.brand_name || '',
  pageDescription: criticalPage.value.seo_description || criticalPage.value.summary || identity.value.brand_description || null,
  imageUrl: heroBackground.value,
  faqs: (routeData.value?.qa ?? [])
    .map(item => ({ question: item.question.trim(), answer: item.answer?.trim() ?? '' }))
    .filter(item => item.question && item.answer),
  items: (routeData.value?.offerings ?? []).map(offering => ({
    name: offering.name,
    url: offering.canonical_path,
    description: offering.short_description || offering.summary || undefined,
  })),
}))
</script>
