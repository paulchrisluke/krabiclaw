<template>
  <div data-parity-root>
    <section class="relative isolate overflow-hidden bg-[var(--blawby-primary-dark)]" data-parity-section="schedule-hero">
      <div class="blawby-container relative z-20 py-24 text-center sm:py-32 lg:py-40 min-[1920px]:py-48 min-[2560px]:py-64">
        <div class="mx-auto max-w-4xl min-[1920px]:max-w-6xl min-[2560px]:max-w-7xl">
          <p class="font-bold uppercase text-[var(--blawby-accent)]">{{ identity.brand_name }}</p>
          <h1 class="blawby-display text-5xl font-medium text-white sm:text-7xl min-[1920px]:text-8xl min-[2560px]:text-9xl">
            {{ scheduleTitle.before }}<span v-if="scheduleTitle.accent" class="text-[var(--blawby-accent)]">{{ scheduleTitle.accent }}</span>{{ scheduleTitle.after }}
          </h1>
          <p class="mt-6 text-lg leading-8 text-gray-300 sm:text-xl min-[1920px]:text-2xl">{{ scheduleHero?.description || page.summary }}</p>
          <p v-if="scheduleHero?.priceLine" class="mt-6 text-lg font-bold text-[var(--blawby-accent)] sm:text-xl min-[1920px]:text-2xl">{{ scheduleHero.priceLine }}</p>
          <BlawbyButton :to="consultation.external_url || String(scheduleHero?.buttonUrl || consultation.schedule_path)" class="mt-10 w-full px-8 py-4 text-lg min-[1920px]:px-4 min-[1920px]:py-4 min-[1920px]:text-base min-[2560px]:px-5 min-[2560px]:py-5 min-[2560px]:text-lg" @click="trackConsultation('schedule_hero')">
            <svg class="-ml-0.5 mr-2 size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
            {{ scheduleHero?.buttonText || consultation.cta_label }}
          </BlawbyButton>
          <p v-if="scheduleHero?.notice" class="mt-6 text-sm leading-6 text-gray-300">{{ scheduleHero.notice }}</p>
        </div>
      </div>
    </section>

    <section v-if="guidanceBlock" class="relative overflow-hidden bg-white pb-16 pt-16 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20" data-parity-section="guidance">
      <div class="blawby-container relative z-20">
        <div class="mx-auto max-w-4xl">
          <div class="mx-auto max-w-3xl text-center">
            <h2 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">{{ guidanceBlock.title }}</h2>
            <div class="mt-5 space-y-4 text-left text-lg leading-8 text-gray-700 sm:text-xl">
              <p v-for="paragraph in guidanceParagraphs" :key="paragraph">{{ paragraph }}</p>
            </div>
          </div>
          <div class="mx-auto mt-12 max-w-3xl divide-y divide-[var(--blawby-primary-200)]">
            <section v-for="section in guidanceSections" :key="section.title" class="py-8 first:pt-0">
              <h3 class="blawby-display text-2xl font-bold text-[var(--blawby-primary)] sm:text-[1.75rem]">{{ section.title }}</h3>
              <ul v-if="section.items.length" class="mt-4 list-disc space-y-2 pl-6 text-lg leading-8 text-gray-700 sm:text-xl"><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
              <p v-else class="mt-4 text-lg leading-8 text-gray-700 sm:text-xl">{{ section.text }}</p>
            </section>
          </div>
        </div>
      </div>
      <div v-if="guidanceDecoration" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 overflow-hidden opacity-80">
        <img :src="guidanceDecoration" alt="" width="1920" height="400" loading="lazy" class="absolute bottom-0 w-full object-contain object-bottom">
      </div>
    </section>

    <BlawbyFaqSection :items="scheduleQa" :decoration-url="assetUrl(qaBlock?.decoration)" />
    <BlawbyReviewsSection :reviews="routeData.reviews" />
    <BlawbyScheduleRedirect
      v-if="scheduleCta"
      :title="String(scheduleCta.title || 'Request a Legal Consultation')"
      :description="String(scheduleCta.description || '')"
      :price-line="optionalString(scheduleCta.priceLine)"
      :notice="optionalString(scheduleCta.notice)"
      :label="String(scheduleCta.buttonText || consultation.cta_label)"
      :destination="consultation.external_url || String(scheduleCta.buttonUrl || consultation.schedule_path)"
      :background-url="assetUrl(scheduleCta.background)"
      @click="trackConsultation('schedule_cta')"
    />
  </div>
</template>

<script setup lang="ts">
import type { PublicSiteQa } from '~/types/blawby'

const { data, error } = await useBlawbyRoute('schedule')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page!)
if (!routeData.value.page) throw createError({ statusCode: 404, statusMessage: 'Schedule content not found' })
const { identity, consultation } = await useBlawbyShell()

function block(type: string) {
  return page.value.components.find(component => component.type === type) ?? null
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}

const scheduleHero = computed(() => block('schedule_hero'))
const scheduleTitle = computed(() => {
  const title = String(scheduleHero.value?.title || page.value.title)
  const accent = 'Legal Consultation'
  const index = title.indexOf(accent)
  return index >= 0 ? { before: title.slice(0, index), accent, after: title.slice(index + accent.length) } : { before: title, accent: '', after: '' }
})
const guidanceBlock = computed(() => block('schedule_guidance'))
const guidanceContent = computed(() => stripLeadingTitleHeading(
  String(guidanceBlock.value?.content || guidanceBlock.value?.description || ''),
  optionalString(guidanceBlock.value?.title),
))
const guidanceParagraphs = computed(() => guidanceContent.value
  .split(/\n\n+/)
  .map(paragraph => paragraph.trim())
  .filter(paragraph => paragraph && !paragraph.startsWith('#')))
const guidanceDecoration = computed(() => assetUrl(guidanceBlock.value?.decoration))
const scheduleCta = computed(() => block('schedule_cta'))
const qaBlock = computed(() => block('schedule_qa'))
const guidanceSections = computed(() => guidanceBlock.value ? [
  { title: String(guidanceBlock.value.prepTitle || ''), items: arrayStrings(guidanceBlock.value.prepItems), text: '' },
  { title: String(guidanceBlock.value.expectationsTitle || ''), items: arrayStrings(guidanceBlock.value.expectationItems), text: '' },
  { title: String(guidanceBlock.value.detailsTitle || ''), items: [], text: String(guidanceBlock.value.detailsText || '') },
  { title: String(guidanceBlock.value.trustTitle || ''), items: [], text: String(guidanceBlock.value.trustText || '') },
].filter(section => section.title) : [])
const scheduleQa = computed<PublicSiteQa[]>(() => {
  const items = block('schedule_qa')?.items
  return Array.isArray(items) ? items.map((item: ApiRecord, index: number) => ({ id: `schedule-qa-${index}`, question: String(item.question || ''), answer: optionalString(item.answer), sort_order: index })) : []
})

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : []
}

const { trackConsultationClick } = useBlawbyConversionTracking(consultation)
function trackConsultation(pageType: string) {
  trackConsultationClick(pageType, '/schedule', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => page.value.seo_title || `Consultation | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value.seo_description || page.value.summary || ''),
})
const canonicalUrl = useSeoUrl(() => '/schedule')
useHead(() => ({ link: [{ rel: 'canonical', href: canonicalUrl.value }] }))
</script>
