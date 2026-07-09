<template>
  <section class="border border-[var(--blawby-border)] bg-white p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--blawby-accent-strong)]">Estimate</p>
        <h2 class="mt-3 font-display text-3xl text-[var(--blawby-primary)]">{{ title }}</h2>
      </div>
      <p class="font-display text-4xl text-[var(--blawby-primary)]">{{ formatCurrency(estimatedTotal) }}</p>
    </div>

    <div class="mt-8 grid gap-6 md:grid-cols-3">
      <label class="block">
        <span class="text-sm font-semibold text-[var(--blawby-primary)]">Household size</span>
        <input v-model.number="householdSize" type="number" min="1" max="12" class="mt-2 w-full border border-[var(--blawby-border)] px-3 py-2">
      </label>
      <label class="block">
        <span class="text-sm font-semibold text-[var(--blawby-primary)]">Monthly income</span>
        <input v-model.number="monthlyIncome" type="number" min="0" step="100" class="mt-2 w-full border border-[var(--blawby-border)] px-3 py-2">
      </label>
      <label class="block">
        <span class="text-sm font-semibold text-[var(--blawby-primary)]">Case complexity</span>
        <select v-model.number="complexity" class="mt-2 w-full border border-[var(--blawby-border)] px-3 py-2">
          <option :value="0">Basic</option>
          <option :value="1">Moderate</option>
          <option :value="2">Complex</option>
        </select>
      </label>
    </div>

    <p class="mt-5 text-sm leading-7 text-slate-600">
      {{ note }}
    </p>
  </section>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  note?: string
  baseAmount?: number
  perPersonAmount?: number
  complexityStep?: number
}>(), {
  title: 'Eligibility and cost calculator',
  note: 'This estimate is informational only. A consultation can confirm eligibility, availability, and the best next step.',
  baseAmount: 0,
  perPersonAmount: 0,
  complexityStep: 0,
})

const householdSize = ref(1)
const monthlyIncome = ref(0)
const complexity = ref(0)

const estimatedTotal = computed(() =>
  Math.max(0, props.baseAmount + householdSize.value * props.perPersonAmount + complexity.value * props.complexityStep + monthlyIncome.value * 0),
)

function formatCurrency(value: number) {
  if (value <= 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}
</script>
