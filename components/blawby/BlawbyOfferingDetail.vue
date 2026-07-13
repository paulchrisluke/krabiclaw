<template>
  <article data-parity-root>
    <section
      class="mx-auto mb-8 max-w-7xl border-b border-slate-200 pt-8 sm:px-6 md:flex lg:px-8"
      :class="gallery.length ? '' : 'mt-8'"
      data-parity-section="service-overview"
    >
      <BlawbyMediaGallery v-if="gallery.length" v-model="activeMedia" :media="gallery" :fallback-alt="offering.name" />

      <div :class="gallery.length ? 'flex-1' : ''">
        <div class="blawby-container pb-8 pt-8">
          <h1 class="mx-auto max-w-4xl blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl md:mt-2">
            <span class="flex items-center text-yellow-400" aria-label="5 out of 5 stars">
              <svg v-for="star in 5" :key="star" class="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="m10 1.8 2.42 4.9 5.4.78-3.91 3.81.92 5.38L10 14.13l-4.83 2.54.92-5.38-3.91-3.81 5.4-.78L10 1.8Z" /></svg>
            </span>
            {{ offering.name }}
          </h1>
          <div class="mt-6">
            <div class="prose prose-p:text-[var(--blawby-primary)]">
              <BlawbyRichText unstyled class="mx-auto mt-6 max-w-2xl text-left text-lg text-[var(--blawby-primary)]" :content="offering.body || offering.summary" />
            </div>
          </div>
          <div class="mt-10 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <BlawbyButton :to="offering.cta_url || consultation.schedule_path" class="w-full gap-2" @click="trackConsultation(offering.cta_url || consultation.schedule_path)">
            <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
            Schedule Call
          </BlawbyButton>
          <BlawbyButton to="/contact" variant="outline" class="w-full gap-2">
            <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            Contact Us
          </BlawbyButton>
          </div>
        </div>
      </div>
    </section>

    <section v-if="offering.features.length" class="overflow-hidden pb-20 pt-2" data-parity-section="features">
      <div class="relative">
        <div class="mx-auto mt-2 max-w-7xl">
          <div class="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2 lg:items-start lg:gap-y-0">
            <div class="px-6 lg:px-0 lg:pr-4">
              <div class="max-w-2xl">
                <div class="grid gap-y-6" role="tablist" aria-label="Service features" @keydown="onTabKeydown">
            <button
              v-for="(feature, index) in offering.features"
              :key="`${feature.sort_order}-${feature.title}`"
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
            <div v-if="activeFeatureItem" :id="`feature-panel-${activeFeature}`" role="tabpanel" class="relative max-w-2xl">
              <img v-if="activeFeatureItem.image_url" :src="activeFeatureItem.image_url" :alt="activeFeatureItem.title" width="2432" height="1442" loading="lazy" class="w-full rounded-xl">
              <div v-if="activeFeatureItem.image_url" class="absolute inset-0 flex flex-col items-center justify-end p-8 pb-16">
                <BlawbyButton :to="consultation.schedule_path" class="gap-2" @click="trackConsultation(consultation.schedule_path)">
                  <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
                  Schedule your call
                </BlawbyButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <BlawbyReviewsSection :reviews="routeData.reviews" />
    <BlawbyFaqSection :items="offeringQa" :heading="`Frequently asked questions about ${offering.name}`" :decoration-url="assetUrl(qaBlock?.decoration)" />

    <BlawbyServicesSection
      v-if="routeData.offerings.length"
      :offerings="routeData.offerings"
      :title="String(servicesBlock?.title || 'Our')"
      :accent="String(servicesBlock?.accent || 'Services')"
      :description="optionalString(servicesBlock?.description) || ''"
      :decoration-url="assetUrl(servicesBlock?.decoration)"
      parity-section="related-services"
    />

    <BlawbyConsultationCta
      :title="String(ctaBlock?.title || 'Get started today')"
      :description="optionalString(ctaBlock?.description)"
      :label="String(ctaBlock?.label || consultation.cta_label)"
      :destination="String(ctaBlock?.url || consultation.schedule_path)"
      :background-url="assetUrl(ctaBlock?.background)"
      :featured-url="assetUrl(ctaBlock?.featured)"
      @click="trackConsultation(String(ctaBlock?.url || consultation.schedule_path))"
    />
  </article>
</template>

<script setup lang="ts">
import { serializeJsonLd } from '~/utils/json-ld'

import type { PublicBlawbyRouteData, PublicSiteQa } from '~/types/blawby'

const props = defineProps<{ routeData: PublicBlawbyRouteData }>()
const offering = computed(() => props.routeData.offering!)
const { identity, consultation } = await useBlawbyShell()
const activeMedia = ref(0)
const activeFeature = ref(0)
const tabRefs = ref<Array<HTMLButtonElement | null>>([])
const gallery = computed(() => {
  const media = [...offering.value.media]
  if (!media.length && offering.value.hero_image_url) media.push({ id: 'hero', url: offering.value.hero_image_url, kind: 'image', alt_text: offering.value.name, width: null, height: null })
  if (!media.length && offering.value.thumbnail_url) media.push({ id: 'thumbnail', url: offering.value.thumbnail_url, kind: 'image', alt_text: offering.value.name, width: null, height: null })
  return media.filter(item => item.kind === 'image')
})
const activeFeatureItem = computed(() => offering.value.features[activeFeature.value] ?? null)
function pageBlock(type: string) {
  return props.routeData.page?.components.find(component => component.type === type) ?? null
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}
const servicesBlock = computed(() => pageBlock('services_intro'))
const ctaBlock = computed(() => pageBlock('consultation_cta'))
const qaBlock = computed(() => pageBlock('qa'))
const offeringQa = computed<PublicSiteQa[]>(() => offering.value.faqs.map((faq, index) => ({
  id: `${offering.value.id}-faq-${index}`,
  question: faq.question,
  answer: faq.answer,
  sort_order: index,
})))

function setTabRef(element: unknown, index: number) {
  tabRefs.value[index] = element as HTMLButtonElement | null
}

function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const last = offering.value.features.length - 1
  if (event.key === 'Home') activeFeature.value = 0
  else if (event.key === 'End') activeFeature.value = last
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') activeFeature.value = activeFeature.value === last ? 0 : activeFeature.value + 1
  else activeFeature.value = activeFeature.value === 0 ? last : activeFeature.value - 1
  nextTick(() => tabRefs.value[activeFeature.value]?.focus())
}

const { trackConsultationClick } = useBlawbyConversionTracking(consultation)
const canonicalUrl = useSeoUrl(() => offering.value.canonical_path || `/services/${offering.value.slug}`)
const homeUrl = useSeoUrl(() => '/')
const servicesUrl = useSeoUrl(() => '/services')
function trackConsultation(destination: string) {
  trackConsultationClick('service', `/services/${offering.value.slug}`, destination)
}

useSeoMeta({
  title: computed(() => offering.value.seo_title || `${offering.value.name} | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => offering.value.seo_description || offering.value.summary || ''),
  ogImage: computed(() => offering.value.hero_image_url || offering.value.thumbnail_url || undefined),
})
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  script: [
    { type: 'application/ld+json', children: serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': offering.value.schema_type || 'LegalService',
      name: offering.value.name,
      description: offering.value.seo_description || offering.value.summary || undefined,
      url: canonicalUrl.value,
      provider: { '@type': 'Organization', name: identity.value.brand_name || 'Professional services' },
      image: offering.value.hero_image_url || offering.value.thumbnail_url || undefined,
    }) },
    { type: 'application/ld+json', children: serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl.value },
        { '@type': 'ListItem', position: 2, name: 'Services', item: servicesUrl.value },
        { '@type': 'ListItem', position: 3, name: offering.value.name, item: canonicalUrl.value },
      ],
    }) },
    ...(offeringQa.value.length ? [{ type: 'application/ld+json', children: serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: offeringQa.value.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    }) }] : []),
  ],
}))
</script>
