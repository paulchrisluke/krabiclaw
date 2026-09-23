<template>
  <section v-if="isPricing" class="bg-white py-16" data-parity-section="pricing">
    <div class="blawby-container">
      <template v-if="individualPlans.length">
        <div class="mx-4 mb-12 text-center"><h2 class="mb-2 text-3xl font-semibold text-[var(--blawby-primary)]">Pricing for Individuals &amp; Families</h2><p class="text-base text-[var(--blawby-primary)]/80">Income-based sliding scale rates</p></div>
        <div class="mx-4 mb-12 grid grid-cols-1 gap-y-10 sm:mx-auto lg:grid-cols-2 lg:gap-x-8 xl:grid-cols-3"><BlawbyPricePlan v-for="plan in individualPlans" :key="`${plan.discount}-${plan.price}`" :plan="plan" /></div>
      </template>
      <template v-if="businessPlans.length">
        <div class="mx-4 mb-12 text-center"><h2 class="mb-2 text-3xl font-semibold text-[var(--blawby-primary)]">Pricing for Small Business &amp; Nonprofits</h2><p class="text-base text-[var(--blawby-primary)]/80">Discounted rates for organizations</p></div>
        <div class="mx-4 mb-12 grid grid-cols-1 gap-y-10 sm:mx-auto lg:grid-cols-2 lg:gap-x-8 xl:grid-cols-3"><BlawbyPricePlan v-for="plan in businessPlans" :key="`${plan.discount}-${plan.price}`" :plan="plan" /></div>
      </template>

      <BlawbyPricingCalculator v-if="calculator.enabled && tableRows.length" :rows="tableRows" :note="String(calculator.note || '')" />

      <div v-if="tableRows.length" class="mt-12 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div><h3 class="text-lg font-semibold text-[var(--blawby-primary)]">Federal Poverty Level Guidelines</h3><p class="mt-2 text-sm leading-6 text-gray-600">{{ table.notice }}</p></div>
        <div class="overflow-x-auto rounded-lg shadow ring-1 ring-black/5">
          <table class="min-w-full divide-y divide-[var(--blawby-primary-100)]">
            <thead class="bg-[var(--blawby-primary-100)]"><tr><th v-for="column in tableColumns" :key="column" scope="col" class="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-[var(--blawby-primary)]">{{ column }}</th></tr></thead>
            <tbody class="divide-y divide-[var(--blawby-primary-100)] bg-white"><tr v-for="(row, index) in tableRows" :key="index"><td v-for="cell in row" :key="String(cell)" class="whitespace-nowrap px-4 py-4 text-sm text-[var(--blawby-primary)]">{{ cell }}</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!--
    A grid reading the site's published posts is the blog set. Its items are
    the posts, resolved onto the block by the page loader.
  -->
  <div v-else-if="isArticles && posts.length" class="mx-auto my-8 max-w-7xl px-6 lg:px-8" data-parity-section="articles">
    <BlawbySectionHeading v-if="heading" :title="heading" accent="" centered />
    <BlawbyArticleGrid :posts="posts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
  </div>

  <!--
    A grid whose every item names an icon is a practice area's list of what the
    firm does there, and it is drawn as one: the icons led a two-column list
    beside the selected item's picture. The About page's grid names no icons and
    stays cards, which is the same reading as `isPricing` and `isArticles` above
    — the content says which it is, and no field in it names a component.
  -->
  <BlawbyPracticeAreaFeatures v-else-if="isPracticeArea" :features="features" :cta-label="ctaLabel" :cta-url="ctaUrl" />

  <section v-else-if="features.length" class="relative bg-[var(--blawby-accent-200)] pb-16 pt-4 sm:pb-16 sm:pt-4 lg:pb-16" data-parity-section="features">
    <div class="blawby-container">
      <div class="relative z-20 mt-4 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="(feature, index) in features" :key="index" class="relative h-full rounded-2xl bg-white p-6 shadow-xl shadow-slate-900/10">
          <div v-if="feature.media[0]?.public_url" class="size-16 rounded-lg">
            <img :src="feature.media[0].public_url!" :alt="feature.title" width="64" height="64" loading="lazy" class="size-16 rounded object-cover">
          </div>
          <h3 class="mt-4 blawby-display text-xl font-bold uppercase text-[var(--blawby-primary)]">{{ feature.title }}</h3>
          <BlawbyRichText v-if="feature.body" unstyled class="mt-4 text-sm text-[var(--blawby-primary)]" :content="feature.body" />
          <p v-else-if="feature.description" class="mt-4 text-sm text-[var(--blawby-primary)]">{{ feature.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import type { PublicBlogSummary } from '~/types/blawby'
import { blockText, blockTextOrNull, blockRecords } from '~/utils/tenant-page-block-data'
// The cards a Blawby page shows for a feature_grid: what the firm does, on the
// About page and on each practice area. One markup, because it is one thing —
// the practice-area version was deleted with the offering model and its
// features went unrendered until this replaced it.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()

/** One slot spelling for every grid: `items.<index>.image`. */
function itemMedia(index: number) {
  return props.block.media.filter(asset => asset.slot === `items.${index}.image`)
}

/**
 * A grid whose items carry a price is a price list, and one that carries a
 * calculator is the calculator. Both were their own component chosen by a
 * `section` string; the content says it plainly enough.
 */
const plans = computed(() => blockRecords(props.block.data.items)
  .map(item => ({
    discount: blockText(item.title),
    price: blockText(item.value),
    description: blockText(item.description),
    features: blockText(item.description) ? [blockText(item.description)] : [],
  }))
  .filter(plan => plan.price))
const calculator = computed(() => {
  const value = props.block.data.calculator
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
})
const isPricing = computed(() => plans.value.length > 0 || tableRows.value.length > 0)
const individualPlans = computed(() => plans.value.slice(0, 4))
const businessPlans = computed(() => plans.value.slice(4))
const table = computed(() => (calculator.value.table && typeof calculator.value.table === 'object'
  ? calculator.value.table as Record<string, unknown>
  : { rows: Array.isArray(calculator.value.rows) ? calculator.value.rows : [], notice: '' }))
const tableColumns = computed(() => (Array.isArray(table.value.columns) ? table.value.columns.map(String) : []))
const tableRows = computed(() => (Array.isArray(table.value.rows) ? table.value.rows.filter(Array.isArray) as unknown[][] : []))

const isArticles = computed(() => blockText(props.block.data.source) === 'site_posts')
const heading = computed(() => blockText(props.block.data.title))
const posts = computed<PublicBlogSummary[]>(() => blockRecords(props.block.data.items).map((item) => {
  const media = Array.isArray(item.media) ? item.media[0] as Record<string, unknown> | undefined : undefined
  return {
    id: blockText(item.id),
    title: blockText(item.title),
    slug: blockText(item.url).split('/').pop() ?? '',
    excerpt: blockText(item.description) || null,
    category: null,
    tags: [],
    published_at: null,
    canonical_url: blockText(item.url),
    cover: media
      ? {
          asset_id: blockText(media.asset_id),
          public_url: blockTextOrNull(media.public_url),
          thumbnail_url: blockTextOrNull(media.thumbnail_url),
          kind: blockTextOrNull(media.kind),
          alt_text: blockTextOrNull(media.alt_text),
          width: null,
          height: null,
        }
      : null,
    social_image: null,
  }
}).filter(post => post.title))

const features = computed(() => blockRecords(props.block.data.items).map((item, index) => ({
  title: blockText(item.title),
  description: blockText(item.description),
  body: blockText(item.body),
  icon: blockText(item.icon),
  media: itemMedia(index),
})).filter(feature => feature.title || feature.body))

/**
 * Every item names an icon, so this is a practice area's feature list rather
 * than the cards the About page shows. The icons were carried through the
 * migration and read by nothing until now.
 */
const isPracticeArea = computed(() => features.value.length > 0 && features.value.every(feature => feature.icon))

/**
 * The button the block carries. An internal route is localized so a translated
 * page keeps its own locale; an absolute URL belongs to someone else and is
 * left as written — the same reading BlawbyPageHero gives a block's button.
 */
const ctaLabel = computed(() => blockTextOrNull(props.block.data.cta_label))
const ctaUrl = computed(() => {
  const url = blockTextOrNull(props.block.data.cta_url)
  return url && url.startsWith('/') ? localePath(url) : url
})
</script>
