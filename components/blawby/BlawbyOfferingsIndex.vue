<template>
  <div data-parity-root>
    <BlawbyServicesSection
      :offerings="routeData.offerings"
      :title="String(servicesBlock.title || page?.title || 'Our')"
      :accent="String(servicesBlock.accent || 'Services')"
      :description="String(servicesBlock.description || page?.summary || '')"
      :decoration-url="servicesDecoration"
    />
    <BlawbyFaqSection :items="routeData.qa" :decoration-url="assetUrl(qaBlock?.decoration)" />
    <BlawbyConsultationCta
      v-if="ctaBlock"
      :title="String(ctaBlock.title || 'Get started today')"
      :description="optionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || consultation.cta_label)"
      :destination="consultation.external_url || String(ctaBlock.url || consultation.schedule_path)"
      :background-url="assetUrl(ctaBlock.background)"
      :featured-url="assetUrl(ctaBlock.featured)"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
const { data } = await useBlawbyRoute('services')
const { identity, consultation } = await useBlawbyShell()
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Services content not found' })

function block(type: string) {
  return page.value?.components.find(component => component.type === type) ?? null
}

function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

const servicesBlock = computed(() => block('services_intro') ?? {})
const ctaBlock = computed(() => block('consultation_cta'))
const qaBlock = computed(() => block('qa'))
const servicesDecoration = computed(() => assetUrl(servicesBlock.value.decoration))
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

function trackConsultation() {
  trackConsultationClick('services_list', '/services', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => page.value?.seo_title || `Services | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || page.value?.summary || ''),
})
const canonicalUrl = useSeoUrl(() => '/services')
useHead(() => ({ link: [{ rel: 'canonical', href: canonicalUrl.value }] }))
</script>
