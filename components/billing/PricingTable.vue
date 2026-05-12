<template>
  <div>
    <!-- Billing toggle -->
    <div class="flex items-center justify-center gap-4 mb-12">
      <span class="text-(--ui-text-muted)" :class="{ 'font-semibold text-(--ui-text)': !annual }">Monthly</span>
      <button
        class="relative w-12 h-6 rounded-full transition-colors"
        :class="annual ? 'bg-(--kc-teal)' : 'bg-(--ui-bg-muted)'"
        role="switch"
        :aria-checked="annual"
        aria-label="Toggle annual billing"
        @click="annual = !annual"
      >
        <span
          class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
          :class="{ 'translate-x-6': annual }"
        />
      </button>
      <span class="text-(--ui-text-muted)" :class="{ 'font-semibold text-(--ui-text)': annual }">
        Annual <span class="text-sm font-normal text-emerald-600 ml-1">Save {{ savingsPercentLabel }}</span>
      </span>
    </div>

    <!-- Cards -->
    <div class="grid md:grid-cols-3 gap-8">
      <div
        v-for="plan in plans"
        :key="plan.id"
        :class="plan.highlighted ? 'md:-mt-4 md:mb-4' : ''"
      >
        <BillingPlanCard :plan="plan" :annual="annual" class="h-full" />
      </div>
    </div>

    <!-- Per-location callout -->
    <div class="max-w-3xl mx-auto mt-16 bg-(--ui-bg-muted) rounded-2xl p-8 text-center">
      <h3 class="text-xl font-bold text-(--ui-text) mb-3">Why per-location pricing?</h3>
      <p class="text-(--ui-text-muted)">
        A single restaurant and a chain with five locations get very different value from their website.
        Per-location pricing means you start small and only pay more as your business actually grows.
        A 5-location brand on Pro pays {{ proFiveLocationsMonthlyLabel }} — less than one hour of traditional web agency work.
      </p>
    </div>

    <!-- Feature comparison table -->
    <div class="max-w-4xl mx-auto mt-16 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-(--ui-border)">
            <th class="text-left py-4 text-(--ui-text-muted) font-medium w-1/2">Feature</th>
            <th v-for="plan in plans" :key="plan.id" class="text-center py-4 text-(--ui-text) font-semibold">
              {{ plan.name }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-(--ui-border)">
          <tr v-for="row in comparisonRows" :key="row.feature">
            <td class="py-4 text-(--ui-text-muted)">{{ row.feature }}</td>
            <td v-for="plan in plans" :key="plan.id" class="py-4 text-center">
              <template v-if="cellValue(row, plan.id) === true">
                <svg class="w-5 h-5 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </template>
              <template v-else-if="cellValue(row, plan.id) === false">
                <span class="text-(--ui-text-dimmed)">—</span>
              </template>
              <template v-else>
                <span class="text-(--ui-text-muted)">{{ renderCell(cellValue(row, plan.id)) }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
const annual = ref(false)
const { plans, proPlan, monthlyPrice } = usePlans()

type CellValue = boolean | string
type ComparisonRow = {
  feature: string
} & Record<string, CellValue>

const comparisonRows: ComparisonRow[] = [
  { feature: 'Locations', free: '1', pro: 'Unlimited', agency: 'Unlimited' },
  { feature: 'Custom domain', free: false, pro: true, agency: true },
  { feature: 'SSL certificate', free: true, pro: true, agency: true },
  { feature: 'Google Business sync', free: false, pro: true, agency: true },
  { feature: 'AI credits / month', free: '500', pro: '5,000', agency: '50,000' },
  { feature: 'AI menu extraction', free: true, pro: true, agency: true },
  { feature: 'Reservations page', free: true, pro: true, agency: true },
  { feature: 'Reviews display', free: true, pro: true, agency: true },
  { feature: 'SEO & schema markup', free: 'Basic', pro: 'Advanced', agency: 'Advanced' },
  { feature: 'White-label', free: false, pro: false, agency: true },
  { feature: 'API access', free: false, pro: false, agency: true },
  { feature: 'Support', free: 'Community', pro: 'Priority email', agency: 'Dedicated' },
]

const savingsPercentLabel = computed(() => {
  const pro = proPlan.value
  if (!pro) return '~0%'
  const monthly = monthlyPrice(pro)
  const annualPriceCents = pro.prices.find((p: { interval: string, amount: number }) => p.interval === 'year')?.amount ?? null
  if (!monthly || !annualPriceCents) return '~0%'
  const fullYearMonthly = monthly * 12
  if (!fullYearMonthly) return '~0%'
  const pct = Math.round(((fullYearMonthly - annualPriceCents) / fullYearMonthly) * 100)
  return `~${pct}%`
})

const proFiveLocationsMonthlyLabel = computed(() => {
  const pro = proPlan.value
  if (!pro) return '$0/month'
  const monthly = monthlyPrice(pro)
  if (!monthly) return '$0/month'
  const amount = (monthly * 5) / 100
  return `$${amount.toLocaleString('en-US')}/month`
})

function cellValue(row: ComparisonRow, planId: string): CellValue {
  const value = row[planId]
  if (typeof value === 'boolean' || typeof value === 'string') return value
  return false
}

function renderCell(val: CellValue): string {
  if (typeof val === 'string' && val.length > 0) return val
  return '—'
}
</script>
