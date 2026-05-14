<template>
  <div>
    <!-- Billing toggle -->
    <div class="flex items-center justify-center gap-4 mb-12">
      <span class="text-muted" :class="{ 'font-semibold text-default': !annual }">Monthly</span>
      <button
        class="relative w-12 h-6 rounded-full transition-colors"
        :class="annual ? 'bg-(--kc-teal)' : 'bg-muted'"
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
      <span class="text-muted" :class="{ 'font-semibold text-default': annual }">
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
        <BillingPlanCard :plan="plan" :annual="annual" class="h-full">
          <template v-if="plan.prices.length" #cta>
            <UButton
              size="xl"
              block
              :loading="upgrading === plan.id"
              :class="plan.highlighted ? 'text-white hover:opacity-90' : ''"
              :style="plan.highlighted ? 'background-color: var(--kc-coral)' : ''"
              :variant="plan.highlighted ? 'solid' : 'outline'"
              color="neutral"
              @click="handleUpgrade(plan.id)"
            >
              Get Started
            </UButton>
          </template>
        </BillingPlanCard>
      </div>
    </div>

    <!-- Checkout error -->
    <div v-if="checkoutError" class="max-w-3xl mx-auto mt-8 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-2xl p-6 text-center">
      <div class="flex items-center justify-center gap-2 text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-5" />
        <span class="font-medium">{{ checkoutError }}</span>
      </div>
    </div>

    <!-- Per-location callout -->
    <div class="max-w-3xl mx-auto mt-16 bg-muted rounded-2xl p-8 text-center">
      <h3 class="text-xl font-bold text-default mb-3">Why per-location pricing?</h3>
      <p class="text-muted">
        A single restaurant and a chain with five locations get very different value from their website.
        Per-location pricing means you start small and only pay more as your business actually grows.
        A 5-location brand on Pro pays {{ proFiveLocationsMonthlyLabel }} — less than one hour of traditional web agency work.
      </p>
    </div>

    <!-- Feature comparison table -->
    <div class="max-w-4xl mx-auto mt-16 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default">
            <th class="text-left py-4 text-muted font-medium w-1/2">Feature</th>
            <th v-for="plan in plans" :key="plan.id" class="text-center py-4 text-default font-semibold">
              {{ plan.name }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="row in comparisonRows" :key="row.feature">
            <td class="py-4 text-muted">{{ row.feature }}</td>
            <td v-for="plan in plans" :key="plan.id" class="py-4 text-center">
              <template v-if="cellValue(row, plan.id) === true">
                <svg class="w-5 h-5 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </template>
              <template v-else-if="cellValue(row, plan.id) === false">
                <span class="text-dimmed">—</span>
              </template>
              <template v-else>
                <span class="text-muted">{{ renderCell(cellValue(row, plan.id)) }}</span>
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
const { isAuthenticated } = useAuth()
const upgrading = ref<string | null>(null)
const checkoutError = ref<string>('')

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

async function handleUpgrade(planId: string) {
  if (!isAuthenticated.value) {
    const next = encodeURIComponent(`/dashboard/billing?plan=${planId}`)
    await navigateTo(`/login?next=${next}`)
    return
  }
  checkoutError.value = ''
  upgrading.value = planId
  try {
    const res = await $fetch<{ checkoutUrl: string }>('/api/billing/checkout', {
      method: 'POST',
      body: { plan: planId, interval: annual.value ? 'year' : 'month' }
    })
    if (res.checkoutUrl) {
      await navigateTo(res.checkoutUrl, { external: true })
    } else {
      checkoutError.value = 'Unable to start checkout. Please try again.'
    }
  } catch (err) {
    checkoutError.value = getErrorMessage(err, 'Checkout failed. Please try again.')
    console.error('Checkout failed:', err)
  } finally {
    upgrading.value = null
  }
}

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
  const pct = Math.max(0, Math.round(((fullYearMonthly - annualPriceCents) / fullYearMonthly) * 100))
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
