<template>
  <div data-parity-root>
    <!-- The homepage: full-bleed sections, each its own band. -->
    <div v-if="page.path === '/'" class="bg-default">
      <PlatformMarketingHero v-if="hero" variant="home" v-bind="heroProps" />
      <PlatformIndustryCards v-if="industriesBlock" :eyebrow="str(industriesBlock.data.eyebrow)" :title="str(industriesBlock.data.title)" :description="str(industriesBlock.data.description)" :items="industryItems" />
      <PlatformFeatureCards v-if="featuresBlock" variant="home" :eyebrow="str(featuresBlock.data.eyebrow)" :title="str(featuresBlock.data.title)" :title-muted="str(featuresBlock.data.title_muted)" :items="featureItems" />
      <PlatformPlansSection v-if="plansBlock" variant="home" :eyebrow="str(plansBlock.data.eyebrow)" :title="str(plansBlock.data.title)" :description="str(plansBlock.data.description)" />
    </div>

    <!-- About: a narrow column of cards under two orbs. -->
    <div v-else-if="page.path === '/about'" class="relative overflow-hidden py-20 lg:py-28">
      <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
      <div class="absolute bottom-1/3 right-1/4 -z-10 w-96 h-96 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>
      <div class="container mx-auto px-4 max-w-4xl space-y-20">
        <PlatformMarketingHero v-if="hero" variant="about" v-bind="heroProps" />
        <PlatformProseCard v-if="proseBlock" :title="str(proseBlock.data.title)" :content="str(proseBlock.data.markdown)" />
        <PlatformVerticalCards v-if="verticalsBlock" :eyebrow="str(verticalsBlock.data.eyebrow)" :title="str(verticalsBlock.data.title)" :items="verticalItems" />
        <PlatformBottomCta v-if="ctaBlock" size="md" v-bind="ctaProps" />
      </div>
    </div>

    <!-- Pricing: the header, the table in its glass shell, the accordion. -->
    <div v-else-if="page.path === '/pricing'" class="relative overflow-hidden bg-default min-h-screen py-20 lg:py-28">
      <div class="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
      <div class="absolute bottom-1/3 left-1/4 -z-10 w-[500px] h-[500px] bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
        <PlatformMarketingHero v-if="hero" variant="pricing" v-bind="heroProps" />
        <PlatformPlansSection v-if="plansBlock" variant="pricing" />
        <PlatformFaqAccordion v-if="faqBlock" :eyebrow="str(faqBlock.data.eyebrow)" :title="str(faqBlock.data.title)" :items="faqs" />
      </div>
    </div>

    <!-- Features: the centered hero, the detailed cards, the analytics band, the FAQ grid. -->
    <div v-else-if="page.path === '/features'" class="relative overflow-hidden py-16 sm:py-24">
      <div class="absolute top-0 left-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60"></div>
      <div class="absolute bottom-1/4 right-1/4 -z-10 w-112.5 h-112.5 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-50"></div>
      <div class="container mx-auto px-4 max-w-7xl">
        <PlatformMarketingHero v-if="hero" variant="features" v-bind="heroProps" />
        <PlatformFeatureCards v-if="featureDetailsBlock" variant="detailed" :items="featureDetailItems" />
        <PlatformSeoBand v-if="seoBandBlock" v-bind="seoBandProps" :rows="seoBandRows" />
        <PlatformFaqGrid v-if="faqBlock" :title="str(faqBlock.data.title)" :items="faqs" spacing="mt-20" />
      </div>
    </div>

    <!-- The connection guide. -->
    <main v-else-if="page.path === '/plugin'" class="min-h-screen bg-default pb-24">
      <section class="mx-auto max-w-5xl px-4 pt-20 sm:px-6">
        <PlatformMarketingHero v-if="hero" variant="plugin" v-bind="heroProps" />
        <PlatformPluginSections v-if="capabilitiesBlock" variant="capabilities" :items="capabilityItems" />
      </section>
      <PlatformPluginSections v-if="connectBlock" variant="steps" :title="str(connectBlock.data.title)" :description="str(connectBlock.data.description)" :steps="connectSteps">
        <PlatformPluginSections v-if="firstRequestBlock" variant="callout" :title="str(firstRequestBlock.data.title)" :body="str(firstRequestBlock.data.body)" />
      </PlatformPluginSections>
    </main>

    <!--
      The vertical pages — restaurants, experiences, legal — share one shape:
      hero, comparison, workflows, the proof band, features, FAQ, CTA, in that
      order, each wearing the vertical's accent.
    -->
    <div v-else-if="vertical" class="relative overflow-hidden py-16 sm:py-24">
      <div class="absolute top-0 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60" :class="vertical === 'experiences' ? 'right-1/4' : 'left-1/4'"></div>
      <div class="absolute bottom-1/3 -z-10 w-112.5 h-112.5 rounded-full blur-3xl opacity-50" :class="vertical === 'experiences' ? 'left-1/4 bg-(--kc-teal)/10' : vertical === 'legal' ? 'right-1/4 bg-(--kc-navy)/10' : 'right-1/4 bg-(--kc-teal)/10'"></div>
      <div class="container mx-auto px-4 max-w-7xl">
        <PlatformMarketingHero v-if="hero" :variant="vertical" v-bind="heroProps" />
        <PlatformComparison v-if="againstBlock && forBlock" :accent="accent" :against="comparisonColumn(againstBlock)" :for-card="comparisonColumn(forBlock)" />
        <PlatformWorkflows v-if="workflowsBlock" :accent="accent" :eyebrow="str(workflowsBlock.data.eyebrow)" :title="str(workflowsBlock.data.title)" :description="str(workflowsBlock.data.description)" :items="workflowItems" />
        <PlatformProofBand v-if="proofBlock" :accent="accent" :pill="str(proofBlock.data.pill)" :pill-icon="icon(proofBlock.data.pill_icon)" :title="str(proofBlock.data.title)" :description="str(proofBlock.data.description)" :stats="proofStats" :card="proofCard" />
        <PlatformFeatureCards v-if="featuresBlock" variant="vertical" :eyebrow="str(featuresBlock.data.eyebrow)" :title="str(featuresBlock.data.title)" :items="featureItems" />
        <PlatformFaqGrid v-if="faqBlock" :title="str(faqBlock.data.title)" :items="faqs" />
        <PlatformBottomCta v-if="ctaBlock" v-bind="ctaProps" />
      </div>
    </div>

    <!--
      Any other platform page — one #939 adds at /mcp or /services, say — renders
      its blocks in the generic order until it is given a shape of its own.
    -->
    <TenantPageRenderer v-else :page="page" />
  </div>
</template>

<script setup lang="ts">
import PlatformMarketingHero from '~/components/platform/marketing/PlatformMarketingHero.vue'
import PlatformIndustryCards from '~/components/platform/marketing/PlatformIndustryCards.vue'
import PlatformFeatureCards from '~/components/platform/marketing/PlatformFeatureCards.vue'
import PlatformPlansSection from '~/components/platform/marketing/PlatformPlansSection.vue'
import PlatformProseCard from '~/components/platform/marketing/PlatformProseCard.vue'
import PlatformVerticalCards from '~/components/platform/marketing/PlatformVerticalCards.vue'
import PlatformBottomCta from '~/components/platform/marketing/PlatformBottomCta.vue'
import PlatformFaqAccordion from '~/components/platform/marketing/PlatformFaqAccordion.vue'
import PlatformFaqGrid from '~/components/platform/marketing/PlatformFaqGrid.vue'
import PlatformSeoBand from '~/components/platform/marketing/PlatformSeoBand.vue'
import PlatformPluginSections from '~/components/platform/marketing/PlatformPluginSections.vue'
import PlatformComparison from '~/components/platform/marketing/PlatformComparison.vue'
import PlatformWorkflows from '~/components/platform/marketing/PlatformWorkflows.vue'
import PlatformProofBand from '~/components/platform/marketing/PlatformProofBand.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'
import type { PlatformComparisonColumn } from '~/components/platform/marketing/PlatformComparison.vue'
import type { PlatformProofCard } from '~/components/platform/marketing/PlatformProofBand.vue'

/**
 * KrabiClaw's own marketing pages, rendered from their page documents.
 *
 * The same shape as BlawbyCanonicalPage: the template branches on the path and
 * composes named sections; the script is adapters that pick each section's
 * block by type and `data.section` and hand its fields to the component. The
 * markup lives in the sections, the words live in the document, and the
 * presentation this page had before it was a document is what the sections
 * draw.
 */
const props = defineProps<{ page: PublicTenantPage }>()

type Block = PublicTenantPage['blocks'][number]
type RecordValue = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
function icon(value: unknown): PlatformIconName | null {
  return str(value) ? str(value) as PlatformIconName : null
}
function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as RecordValue[] : []
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}
function block(type: string, section?: string): Block | null {
  return props.page.blocks.find(candidate => candidate.type === type && (!section || str(candidate.data.section) === section)) ?? null
}

const VERTICALS = { '/restaurants': 'restaurants', '/experiences': 'experiences', '/legal': 'legal' } as const
const vertical = computed(() => VERTICALS[props.page.path as keyof typeof VERTICALS] ?? null)
const accent = computed<'primary' | 'teal' | 'navy'>(() => (vertical.value === 'experiences' ? 'teal' : vertical.value === 'legal' ? 'navy' : 'primary'))

// ── Hero ────────────────────────────────────────────────────────────
const hero = computed(() => block('hero', 'hero'))
const heroProps = computed(() => ({
  eyebrow: str(hero.value?.data.eyebrow) || null,
  eyebrowIcon: icon(hero.value?.data.eyebrow_icon),
  title: str(hero.value?.data.title),
  highlight: str(hero.value?.data.highlight) || null,
  subtitle: str(hero.value?.data.subtitle) || null,
  ctaLabel: str(hero.value?.data.cta_label) || null,
  ctaUrl: str(hero.value?.data.cta_url) || null,
  secondaryLabel: str(hero.value?.data.secondary_label) || null,
  secondaryUrl: str(hero.value?.data.secondary_url) || null,
}))

// ── Grids ───────────────────────────────────────────────────────────
const industriesBlock = computed(() => block('feature_grid', 'industries'))
const industryItems = computed(() => records(industriesBlock.value?.data.items).map(item => ({
  title: str(item.title),
  description: str(item.description),
  url: str(item.url),
  icon: (icon(item.icon) ?? 'sparkles') as PlatformIconName,
  linkLabel: str(item.link_label),
})).filter(item => item.title && item.url))

const featuresBlock = computed(() => block('feature_grid', 'features'))
const featureItems = computed(() => records(featuresBlock.value?.data.items).map(item => ({
  title: str(item.title),
  description: str(item.description),
  icon: (icon(item.icon) ?? 'sparkles') as PlatformIconName,
})).filter(item => item.title))

const featureDetailsBlock = computed(() => block('feature_grid', 'feature-details'))
const featureDetailItems = computed(() => records(featureDetailsBlock.value?.data.items).map(item => ({
  title: str(item.title),
  description: str(item.description),
  icon: (icon(item.icon) ?? 'sparkles') as PlatformIconName,
  specs: strings(item.specs),
  url: str(item.url) || null,
})).filter(item => item.title))

const verticalsBlock = computed(() => block('feature_grid', 'verticals'))
const verticalItems = computed(() => records(verticalsBlock.value?.data.items).map(item => ({
  title: str(item.title),
  description: str(item.description),
  icon: (icon(item.icon) ?? 'sparkles') as PlatformIconName,
})).filter(item => item.title))

const plansBlock = computed(() => block('feature_grid', 'plans') ?? props.page.blocks.find(candidate => candidate.type === 'feature_grid' && str(candidate.data.source) === 'billing_plans') ?? null)

// ── Vertical page sections ──────────────────────────────────────────
const againstBlock = computed(() => block('feature_grid', 'comparison-against'))
const forBlock = computed(() => block('feature_grid', 'comparison-for'))
function comparisonColumn(source: Block): PlatformComparisonColumn {
  return {
    pill: str(source.data.pill),
    pillIcon: icon(source.data.pill_icon),
    title: str(source.data.title),
    items: records(source.data.items).map(item => ({ title: str(item.title), description: str(item.description) })).filter(item => item.title),
  }
}

const workflowsBlock = computed(() => block('feature_grid', 'workflows'))
const workflowItems = computed(() => records(workflowsBlock.value?.data.items).map(item => ({
  title: str(item.title),
  icon: (icon(item.icon) ?? 'sparkles') as PlatformIconName,
  prompt: str(item.value),
  description: str(item.description),
})).filter(item => item.title))

const proofBlock = computed(() => block('feature_grid', 'proof'))
const proofStats = computed(() => records(proofBlock.value?.data.items).map(item => ({ value: str(item.value), label: str(item.title) })).filter(stat => stat.value && stat.label))
const proofCardBlock = computed(() => block('feature_grid', 'proof-card'))
const proofCard = computed<PlatformProofCard | null>(() => {
  const source = proofCardBlock.value
  if (!source) return null
  return {
    title: str(source.data.title),
    badge: str(source.data.badge) || null,
    rows: records(source.data.items).map(item => ({ label: str(item.title), value: str(item.description) })).filter(row => row.label),
    ctaLabel: str(source.data.cta_label) || null,
    ctaUrl: str(source.data.cta_url) || null,
  }
})

// ── About, Features, plugin one-offs ────────────────────────────────
const proseBlock = computed(() => block('markdown', 'prose'))

const seoBandBlock = computed(() => block('feature_grid', 'seo-band'))
const seoBandProps = computed(() => ({
  pill: str(seoBandBlock.value?.data.pill) || null,
  pillIcon: icon(seoBandBlock.value?.data.pill_icon),
  title: str(seoBandBlock.value?.data.title),
  description: str(seoBandBlock.value?.data.description) || null,
  ctaLabel: str(seoBandBlock.value?.data.cta_label) || null,
  ctaUrl: str(seoBandBlock.value?.data.cta_url) || null,
  secondaryLabel: str(seoBandBlock.value?.data.secondary_label) || null,
  secondaryUrl: str(seoBandBlock.value?.data.secondary_url) || null,
  cardBadge: str(seoBandBlock.value?.data.badge) || null,
}))
const seoBandRows = computed(() => records(seoBandBlock.value?.data.items).map(item => ({ label: str(item.title), value: str(item.description) })).filter(row => row.label))

const capabilitiesBlock = computed(() => block('feature_grid', 'capabilities'))
const capabilityItems = computed(() => records(capabilitiesBlock.value?.data.items).map(item => ({ title: str(item.title), description: str(item.description) })).filter(item => item.title))
const connectBlock = computed(() => block('how_to', 'connect'))
const connectSteps = computed(() => records(connectBlock.value?.data.steps).map(step => ({ name: str(step.name), text: str(step.text) })).filter(step => step.name))
const firstRequestBlock = computed(() => block('callout', 'first-request'))

// ── FAQ and CTA ─────────────────────────────────────────────────────
// The questions are the page's own Q&A records, resolved onto the block by
// the public page loader.
const faqBlock = computed(() => block('faq'))
const faqs = computed(() => records(faqBlock.value?.data.items).map(item => ({
  question: str(item.title) || str(item.question),
  answer: str(item.description) || str(item.answer),
})).filter(item => item.question && item.answer))

const ctaBlock = computed(() => block('cta', 'cta') ?? block('cta'))
const ctaProps = computed(() => ({
  title: str(ctaBlock.value?.data.title),
  description: str(ctaBlock.value?.data.description) || null,
  label: str(ctaBlock.value?.data.label) || null,
  url: str(ctaBlock.value?.data.url) || null,
  secondaryLabel: str(ctaBlock.value?.data.secondary_label) || null,
  secondaryUrl: str(ctaBlock.value?.data.secondary_url) || null,
}))
</script>
