<template>
  <section class="bg-white py-16" data-parity-section="pricing">
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
</template>

<script setup lang="ts">
const props = defineProps<{
  plans: ApiRecord[]
  calculator: ApiRecord
}>()

const individualPlans = computed(() => props.plans.slice(0, 4))
const businessPlans = computed(() => props.plans.slice(4))
const table = computed(() => props.calculator.table && typeof props.calculator.table === 'object' ? props.calculator.table as ApiRecord : {})
const tableColumns = computed(() => Array.isArray(table.value.columns) ? table.value.columns.map(String) : [])
const tableRows = computed(() => Array.isArray(table.value.rows) ? table.value.rows.filter(Array.isArray) as unknown[][] : [])
</script>
