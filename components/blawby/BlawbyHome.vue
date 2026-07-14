<template>
  <div data-parity-root>
    <section class="relative overflow-hidden" data-parity-section="hero">
      <img
        v-if="heroBackground"
        :src="heroBackground"
        alt=""
        width="1920"
        height="1080"
        fetchpriority="high"
        class="absolute inset-0 size-full object-cover object-center"
      >
      <div class="blawby-container relative pb-36 pt-16 text-left min-[1920px]:pb-48 min-[1920px]:pt-24 min-[2560px]:pb-64 min-[2560px]:pt-32">
        <div class="flex flex-wrap gap-x-6 min-[1920px]:gap-x-12 min-[2560px]:gap-x-16">
          <div class="w-full lg:w-3/5">
            <h1 class="max-w-4xl whitespace-pre-line blawby-display text-5xl font-medium text-white sm:text-7xl min-[1920px]:max-w-6xl min-[1920px]:text-8xl min-[2560px]:max-w-7xl min-[2560px]:text-9xl">
              {{ heroTitle.before }}<span v-if="heroTitle.accent" class="relative whitespace-nowrap text-[var(--blawby-accent)]">{{ heroTitle.accent }}</span>{{ heroTitle.after }}
            </h1>
            <p v-if="hero.description" class="mt-6 max-w-2xl text-lg text-white min-[1920px]:max-w-3xl min-[1920px]:text-xl min-[2560px]:max-w-4xl min-[2560px]:text-2xl">{{ hero.description }}</p>
          </div>
          <div class="w-full lg:w-2/5">
            <div class="mt-10 flex justify-start gap-x-6 min-[1920px]:mt-16 min-[2560px]:mt-20">
              <BlawbyButton :to="heroDestination" class="gap-2" @click="trackConsultation('hero', heroDestination)">
                <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
                {{ hero.label || consultation.cta_label }}
              </BlawbyButton>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="relative bg-(--blawby-bg) pb-14 pt-14 sm:pb-20 sm:pt-14 lg:pb-14" data-parity-section="services">
      <div class="blawby-container relative z-20">
        <BlawbySectionHeading
          :title="services.title || 'Our'"
          :accent="services.accent || 'Services'"
          :description="services.description"
          centered
        />
        <BlawbyServiceGrid :offerings="routeData.offerings" class="mt-20" />
      </div>
      <img v-if="servicesDecoration" :src="servicesDecoration" alt="" width="1920" height="400" loading="lazy" class="absolute inset-x-0 bottom-0 w-full object-contain">
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

    <BlawbyFaqSection :items="routeData.qa" :decoration-url="assetUrl(qaBlock?.decoration)" />
    <BlawbyReviewsSection :reviews="routeData.reviews" :description="reviewsDescription" />

    <div v-if="routeData.posts.length" class="mx-auto my-8 max-w-7xl px-6 lg:px-8" data-parity-section="articles">
      <BlawbySectionHeading title="From the" accent="Blog" centered />
      <BlawbyArticleGrid :posts="routeData.posts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
    </div>
    <div v-if="routeData.posts.length" class="my-4 mb-8 flex justify-center" data-parity-section="articles-more">
      <BlawbyButton to="/blog">See All</BlawbyButton>
    </div>

    <BlawbyConsultationCta
      v-if="ctaBlock"
      :title="String(ctaBlock.title || 'Get started today')"
      :description="asOptionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || consultation.cta_label)"
      :destination="String(ctaBlock.url || consultation.schedule_path)"
      :background-url="assetUrl(ctaBlock.background)"
      :featured-url="assetUrl(ctaBlock.featured)"
      @click="trackConsultation('cta_section', String(ctaBlock.url || consultation.schedule_path))"
    />
  </div>
</template>

<script setup lang="ts">
const { data } = await useBlawbyRoute('home')
const { identity, consultation, compliance } = await useBlawbyShell()
const org = useBlawbyOrgIdentity(identity, compliance)
const routeData = computed(() => data.value)

if (!routeData.value.page) throw createError({ statusCode: 404, statusMessage: 'Homepage content not found' })

function block(type: string) {
  return routeData.value.page?.components.find(component => component.type === type) ?? null
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string'
    ? String((value as ApiRecord).url)
    : null
}

const hero = computed(() => block('home_hero') ?? {})
const services = computed(() => block('services_intro') ?? {})
const videoFeature = computed(() => block('video_feature'))
const reviewsBlock = computed(() => block('reviews'))
const qaBlock = computed(() => block('qa'))
const ctaBlock = computed(() => block('consultation_cta'))
const heroBackground = computed(() => assetUrl(hero.value.background))
const servicesDecoration = computed(() => assetUrl(services.value.decoration))
const heroDestination = computed(() => String(hero.value.url || consultation.value.schedule_path))
const heroTitle = computed(() => {
  const title = String(hero.value.title || identity.value.brand_name || 'Professional services')
  const accent = String(hero.value.accent || '')
  const index = accent ? title.indexOf(accent) : -1
  return index >= 0
    ? { before: title.slice(0, index), accent, after: title.slice(index + accent.length) }
    : { before: title, accent: '', after: '' }
})
const videoFeatures = computed(() => Array.isArray(videoFeature.value?.features)
  ? videoFeature.value.features.map((item: ApiRecord) => ({ name: String(item.name || ''), desc: String(item.desc || '') }))
  : [])
const videoImages = computed(() => Array.isArray(videoFeature.value?.images)
  ? videoFeature.value.images
      .map((item: ApiRecord) => ({ url: assetUrl(item) || '', alt: asOptionalString(item.alt) }))
      .filter((item: { url: string }) => item.url)
  : [])
const reviewsDescription = computed(() => String(reviewsBlock.value?.description || ''))

const { trackConsultationClick } = useBlawbyConversionTracking(consultation)
function trackConsultation(pageType: string, destination: string) {
  trackConsultationClick(pageType, '/', destination)
}

useSeoMeta({
  title: computed(() => routeData.value.page?.seo_title || identity.value.brand_name || 'Professional services'),
  description: computed(() => routeData.value.page?.seo_description || routeData.value.page?.summary || identity.value.brand_description || ''),
  ogImage: computed(() => heroBackground.value || undefined),
  ogType: 'website',
})
const canonicalUrl = useSeoUrl(() => '/')
useHead(() => ({ link: [{ rel: 'canonical', href: canonicalUrl.value }] }))

useProfessionalServiceSchema(() => ({
  recipe: 'home',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: routeData.value.page?.seo_title || identity.value.brand_name || 'Professional services',
  pageDescription: routeData.value.page?.seo_description || routeData.value.page?.summary || identity.value.brand_description || null,
  imageUrl: heroBackground.value,
  faqs: routeData.value.qa.map(item => ({ question: item.question, answer: item.answer })),
  items: routeData.value.offerings.map(offering => ({
    name: offering.name,
    url: offering.canonical_path,
    description: offering.short_description || offering.summary || undefined,
  })),
}))
</script>
