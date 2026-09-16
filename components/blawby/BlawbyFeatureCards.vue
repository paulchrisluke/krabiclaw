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

  <section v-else-if="features.length" class="relative bg-[var(--blawby-accent-200)] pb-16 pt-4 sm:pb-16 sm:pt-4 lg:pb-16" data-parity-section="features">
    <div class="blawby-container">
      <div class="relative z-20 mt-4 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="feature in features" :key="feature.title" class="relative h-full rounded-2xl bg-white p-6 shadow-xl shadow-slate-900/10">
          <div v-if="feature.media[0]?.public_url" class="size-16 rounded-lg">
            <img :src="feature.media[0].public_url!" :alt="feature.title" width="64" height="64" loading="lazy" class="size-16 rounded object-cover">
          </div>
          <h3 class="mt-4 blawby-display text-xl font-bold uppercase text-[var(--blawby-primary)]">{{ feature.title }}</h3>
          <p v-if="feature.description" class="mt-4 text-sm text-[var(--blawby-primary)]">{{ feature.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords } from '~/utils/tenant-page-block-data'
// The cards a Blawby page shows for a feature_grid: what the firm does, on the
// About page and on each practice area. One markup, because it is one thing —
// the practice-area version was deleted with the offering model and its
// features went unrendered until this replaced it.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

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
const isPricing = computed(() => plans.value.length > 0 || Array.isArray(calculator.value.rows))
const individualPlans = computed(() => plans.value.slice(0, 4))
const businessPlans = computed(() => plans.value.slice(4))
const table = computed(() => (calculator.value.table && typeof calculator.value.table === 'object'
  ? calculator.value.table as Record<string, unknown>
  : { rows: Array.isArray(calculator.value.rows) ? calculator.value.rows : [], notice: '' }))
const tableColumns = computed(() => (Array.isArray(table.value.columns) ? table.value.columns.map(String) : []))
const tableRows = computed(() => (Array.isArray(table.value.rows) ? table.value.rows.filter(Array.isArray) as unknown[][] : []))

const features = computed(() => blockRecords(props.block.data.items).map((item, index) => ({
  title: blockText(item.title),
  description: blockText(item.description),
  media: itemMedia(index),
})).filter(feature => feature.title))
</script>
