<template>
  <div data-parity-root>
    <section class="relative isolate overflow-hidden bg-[var(--blawby-primary-dark)]" data-parity-section="schedule-hero">
      <div class="blawby-container relative z-20 py-24 text-center sm:py-32 lg:py-40 min-[1920px]:py-48 min-[2560px]:py-64">
        <div class="mx-auto max-w-4xl min-[1920px]:max-w-6xl min-[2560px]:max-w-7xl">
          <p class="font-bold uppercase text-[var(--blawby-accent)]">{{ identity.name }}</p>
          <h1 v-if="scheduleTitle.before || scheduleTitle.accent" class="blawby-display text-5xl font-medium text-white sm:text-7xl min-[1920px]:text-8xl min-[2560px]:text-9xl">
            {{ scheduleTitle.before }}<span v-if="scheduleTitle.accent" class="text-[var(--blawby-accent)]">{{ scheduleTitle.accent }}</span>{{ scheduleTitle.after }}
          </h1>
          <p v-if="scheduleHero?.subtitle" class="mt-6 text-lg leading-8 text-gray-300 sm:text-xl min-[1920px]:text-2xl">{{ scheduleHero.subtitle }}</p>
          <p v-if="priceLine" class="mt-6 text-lg font-bold text-[var(--blawby-accent)] sm:text-xl min-[1920px]:text-2xl">{{ priceLine }}</p>
          <BlawbyButton :to="scheduleHeroDestination" class="mt-10 w-full px-8 py-4 text-lg min-[1920px]:px-4 min-[1920px]:py-4 min-[1920px]:text-base min-[2560px]:px-5 min-[2560px]:py-5 min-[2560px]:text-lg" @click="trackConsultation('schedule_hero', scheduleHeroDestination)">
            <svg class="-ml-0.5 mr-2 size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
            {{ scheduleHero?.cta_label || consultation.cta_label }}
          </BlawbyButton>
          <p v-if="notice" class="mt-6 text-sm leading-6 text-gray-300">{{ notice }}</p>
        </div>
      </div>
    </section>

    <section v-if="guidanceBlock" class="relative overflow-hidden bg-white pb-16 pt-16 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20" data-parity-section="guidance">
      <div class="blawby-container relative z-20">
        <BlawbyRichText :content="guidanceMarkdown" class="mx-auto max-w-3xl text-lg sm:text-xl" />
      </div>
      <div v-if="guidanceDecoration" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 overflow-hidden opacity-80">
        <img :src="guidanceDecoration" alt="" width="1920" height="400" loading="lazy" class="absolute bottom-0 w-full object-contain object-bottom">
      </div>
    </section>

    <BlawbyFaqSection v-if="qaBlockRaw" :block="qaBlockRaw" :page="page!" />
    <BlawbyReviewsSection v-if="reviewsBlockRaw" :block="reviewsBlockRaw" :page="page!" />
    <BlawbyScheduleRedirect
      v-if="scheduleCta"
      :title="String(scheduleCta.title || '')"
      :description="String(scheduleCta.description || '')"
      :price-line="priceLine"
      :notice="notice"
      :label="String(scheduleCta.label || consultation.cta_label)"
      :destination="scheduleCtaDestination"
      :background-url="mediaUrl(scheduleCta, 'background')"
      @click="trackConsultation('schedule_cta', scheduleCtaDestination)"
    />
  </div>
</template>

<script setup lang="ts">
import type { PublicOrganizationQa } from '~/types/blawby'
import { findTenantPageBlock } from '~/utils/tenant-page-blocks'

const { data, error, shell } = await useBlawbyRoute('schedule')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page!)
if (!routeData.value.page) throw createError({ statusCode: 404, statusMessage: 'Schedule content not found' })
const identity = computed(() => shell.value.identity)
const consultation = computed(() => shell.value.consultation)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function mediaUrl(value: ApiRecord | null | undefined, slot: string) {
  const media = value?.media
  const item = media?.find((candidate: unknown) => candidate && typeof candidate === 'object' && (candidate as ApiRecord).slot === slot) as ApiRecord | undefined
  return typeof item?.public_url === 'string' ? item.public_url : null
}

const scheduleHero = computed(() => findTenantPageBlock(page.value.blocks, 'hero'))
const scheduleHeroDestination = computed(() => consultation.value.external_url || String(scheduleHero.value?.cta_url || consultation.value.schedule_path))
const scheduleTitle = computed(() => {
  const title = String(scheduleHero.value?.title ?? '')
  const accent = 'Legal Consultation'
  const index = title.indexOf(accent)
  return index >= 0 ? { before: title.slice(0, index), accent, after: title.slice(index + accent.length) } : { before: title, accent: '', after: '' }
})
const guidanceBlock = computed(() => findTenantPageBlock(page.value.blocks, 'markdown'))
const guidanceMarkdown = computed(() => optionalString(guidanceBlock.value?.markdown))
const guidanceDecoration = computed(() => mediaUrl(guidanceBlock.value, 'decoration'))
const scheduleCta = computed(() => findTenantPageBlock(page.value.blocks, 'booking_cta'))
const scheduleCtaDestination = computed(() => consultation.value.external_url || String(scheduleCta.value?.url || consultation.value.schedule_path))
/**
 * What a consultation costs and what booking one does not create. Both belong
 * to the booking prompt, which is the block that declares them; they were read
 * off the hero as `priceLine` and `notice`, keys no list declared, so the page
 * said them twice from two different places and neither could be translated.
 */
const priceLine = computed(() => optionalString(scheduleCta.value?.price_line))
const notice = computed(() => optionalString(scheduleCta.value?.notice))
const scheduleQa = computed<PublicOrganizationQa[]>(() => {
  return routeData.value.qa
})

const { trackConsultationClick } = useOrganizationConversionTracking(consultation)
function trackConsultation(pageType: string, destination: string) {
  trackConsultationClick(pageType, '/schedule', destination)
}

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/schedule',
  title: page.value.seo_title || `Consultation | ${identity.value.name}`,
  description: page.value.seo_description || page.value.summary || '',
  brand: {
    organizationName: identity.value.name,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'schedule',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: page.value.seo_title || page.value.title,
  pageDescription: page.value.seo_description || page.value.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Schedule', url: canonicalUrl.value },
  ],
  faqs: scheduleQa.value.map(item => ({ question: item.question, answer: item.answer })),
  consultationUrl: scheduleHeroDestination.value,
}))

/**
 * The block itself, by type. Each of these appears once on this page, which is
 * what naming the content properly bought: the lookup no longer needs a
 * `section` string in the document to tell two blocks of one type apart.
 */
function rawBlock(canonicalType: string) {
  return page.value?.blocks.find(candidate => candidate.type === canonicalType) ?? null
}
const qaBlockRaw = computed(() => rawBlock('faq'))
const reviewsBlockRaw = computed(() => rawBlock('testimonial_grid'))
</script>
