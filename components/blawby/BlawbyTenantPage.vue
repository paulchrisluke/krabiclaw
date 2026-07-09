<template>
  <article class="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">{{ eyebrow }}</p>
    <h1 class="mt-4 blawby-display text-5xl leading-tight text-[var(--blawby-primary)]">{{ pageTitle }}</h1>
    <p v-if="pageSummary" class="mt-5 text-lg leading-8 text-slate-600">{{ pageSummary }}</p>

    <BlawbyRichText v-if="pageBody" class="mt-10" :content="pageBody" />

    <div v-if="calculatorBlock" class="mt-12">
      <BlawbyPricingCalculator
        :title="String(calculatorBlock.title || 'Eligibility and cost calculator')"
        :note="String(calculatorBlock.note || 'This estimate is informational only. A consultation can confirm the best next step.')"
        :base-amount="Number(calculatorBlock.baseAmount || 0)"
        :per-person-amount="Number(calculatorBlock.perPersonAmount || 0)"
        :complexity-step="Number(calculatorBlock.complexityStep || 0)"
      />
    </div>

    <div v-if="pageCtaUrl" class="mt-10">
      <BlawbyButton :to="pageCtaUrl">{{ pageCtaLabel }}</BlawbyButton>
    </div>
  </article>
</template>

<script setup lang="ts">
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

const { pageByPath } = useBlawbySite()
const { site } = useTenantSite()
const page = computed(() => pageByPath(props.path))
const calculatorBlock = computed(() => page.value?.components.find((component: ApiRecord) => component.type === 'pricing_calculator') ?? null)

const eyebrow = computed(() => props.fallbackEyebrow)
const pageTitle = computed(() => page.value?.title || props.fallbackTitle)
const pageSummary = computed(() => page.value?.summary || props.fallbackSummary)
const pageBody = computed(() => page.value?.body || props.fallbackBody)
const pageCtaLabel = computed(() => page.value?.cta_label || 'Learn more')
const pageCtaUrl = computed(() => page.value?.cta_url || null)

useSeoMeta({
  title: computed(() => page.value?.seo_title || `${pageTitle.value} | ${site?.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || pageSummary.value || `${pageTitle.value} from ${site?.brand_name || 'this organization'}.`),
})

useHead(() => ({
  link: page.value?.canonical_url ? [{ rel: 'canonical', href: page.value.canonical_url }] : [],
  meta: page.value?.robots ? [{ name: 'robots', content: page.value.robots }] : [],
}))
</script>
