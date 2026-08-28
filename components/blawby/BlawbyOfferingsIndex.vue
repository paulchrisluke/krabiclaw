<template>
  <div data-parity-root>
    <BlawbyServicesSection
      :offerings="routeData.offerings"
      :title="String(servicesBlock.title || page?.title || '')"
      :accent="String(servicesBlock.accent || '')"
      :description="String(servicesBlock.description || page?.summary || '')"
      :decoration-url="servicesDecoration"
    />
    <BlawbyFaqSection :items="routeData.qa" :decoration-url="mediaUrl(qaBlock, 'decoration')" />
    <BlawbyConsultationCta
      v-if="ctaBlock && ctaBlock.title && ctaBlock.label && ctaBlock.url"
      :title="String(ctaBlock.title || '')"
      :description="optionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || '')"
      :destination="String(ctaBlock.url || '')"
      :background-url="mediaUrl(ctaBlock, 'background')"
      :featured-url="mediaUrl(ctaBlock, 'featured')"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
import { findTenantPageBlock } from '~/utils/tenant-page-blocks'

const { data, shell } = await useBlawbyRoute('services')
const identity = computed(() => shell.value.identity)
const consultation = computed(() => shell.value.consultation)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Services content not found' })

function block(type: string) {
  if (!page.value) return null
  const canonicalType = type === 'services_intro' ? 'offering_grid' : type === 'consultation_cta' ? 'contact_cta' : type === 'qa' ? 'faq' : undefined
  return findTenantPageBlock(page.value.blocks, type, canonicalType)
}

function mediaUrl(value: ApiRecord | null | undefined, slot: string) {
  const media = value?.media
  const item = media?.find((candidate: unknown) => candidate && typeof candidate === 'object' && (candidate as ApiRecord).slot === slot) as ApiRecord | undefined
  return typeof item?.public_url === 'string' ? item.public_url : null
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

const servicesBlock = computed(() => block('services_intro') ?? {})
const ctaBlock = computed(() => block('consultation_cta'))
const qaBlock = computed(() => block('qa'))
const servicesDecoration = computed(() => mediaUrl(servicesBlock.value, 'decoration'))
const { trackConsultationClick } = useSiteConversionTracking(consultation)

function trackConsultation() {
  trackConsultationClick('services_list', '/services', optionalString(ctaBlock.value?.url) || consultation.value.schedule_path)
}

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/services',
  title: page.value?.seo_title || `Services | ${identity.value.brand_name}`,
  description: page.value?.seo_description || page.value?.summary || '',
  brand: {
    siteName: identity.value.brand_name,
    logoUrl: identity.value.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: identity.value.media.find(item => item.slot === 'favicon')?.public_url || null,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'services-index',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: page.value?.seo_title || page.value?.title || '',
  pageDescription: page.value?.seo_description || page.value?.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Services', url: canonicalUrl.value },
  ],
  faqs: routeData.value.qa
    .map(item => ({ question: item.question.trim(), answer: item.answer?.trim() ?? '' }))
    .filter(item => item.question && item.answer),
  items: routeData.value.offerings.map(offering => ({
    name: offering.name,
    url: offering.canonical_path,
    description: offering.short_description || offering.summary || undefined,
  })),
}))
</script>
