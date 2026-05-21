<template>
  <div>
    <!-- Billing toggle -->
    <div class="flex items-center justify-center mb-16">
      <div class="inline-flex items-center gap-4 bg-elevated/80 backdrop-blur-md border border-default px-6 py-3 rounded-full shadow-sm">
        <span class="text-sm font-semibold transition-colors duration-200" :class="!annual ? 'text-primary' : 'text-muted'">Monthly</span>
        <button
          class="relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer shadow-inner"
          :class="annual ? 'bg-primary' : 'bg-muted/70'"
          role="switch"
          :aria-checked="annual"
          aria-label="Toggle annual billing"
          @click="annual = !annual"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
            :class="{ 'translate-x-6': annual }"
          />
        </button>
        <span class="text-sm font-semibold transition-colors duration-200 flex items-center gap-1.5" :class="annual ? 'text-primary' : 'text-muted'">
          Annual 
          <span class="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/50">
            Save {{ savingsPercentLabel }}
          </span>
        </span>
      </div>
    </div>

    <!-- Cards -->
    <div class="grid md:grid-cols-3 gap-8 items-stretch">
      <div
        v-for="plan in plans"
        :key="plan.id"
        :class="plan.highlighted ? 'md:-mt-4 md:mb-4' : ''"
        class="flex flex-col"
      >
        <BillingPlanCard :plan="plan" :annual="annual" class="h-full flex-1">
          <template v-if="plan.prices.length" #cta>
            <UButton
              size="xl"
              block
              :loading="upgrading === plan.id"
              class="rounded-xl font-bold cursor-pointer transition-all duration-300 shadow-sm"
              :class="[
                plan.highlighted 
                  ? 'bg-primary hover:bg-primary/95 text-white hover:scale-[1.01]' 
                  : 'text-default border-default hover:bg-primary/5 hover:border-primary/50'
              ]"
              :variant="plan.highlighted ? 'solid' : 'outline'"
              @click="handleUpgrade(plan.id)"
            >
              Get Started
            </UButton>
          </template>
        </BillingPlanCard>
      </div>
    </div>

    <!-- Checkout error -->
    <div v-if="checkoutError" class="max-w-3xl mx-auto mt-8 bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/60 rounded-2xl p-6 text-center">
      <div class="flex items-center justify-center gap-2 text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-5" />
        <span class="font-medium text-sm">{{ checkoutError }}</span>
      </div>
    </div>

    <!-- Per-location callout -->
    <div class="max-w-3xl mx-auto mt-20 relative overflow-hidden bg-gradient-to-br from-primary/5 via-elevated/40 to-(--kc-teal)/5 border border-default/70 backdrop-blur-md rounded-3xl p-8 sm:p-10 text-center shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl opacity-40"></div>
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40"></div>

      <div class="relative z-10 flex flex-col items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
          <UIcon name="i-heroicons-map-pin" class="size-6" />
        </div>
        <h3 class="text-xl font-extrabold text-default tracking-tight">Why per-location pricing?</h3>
        <p class="text-sm leading-relaxed text-muted max-w-2xl">
          A single restaurant and a chain with five locations get very different value from their website.
          Per-location pricing means you start small and only pay more as your business actually grows.
          A 5-location brand on Pro pays {{ proFiveLocationsMonthlyLabel }} — less than one hour of traditional web agency work.
        </p>
      </div>
    </div>

    <!-- Feature comparison table -->
    <div class="max-w-4xl mx-auto mt-24">
      <div class="text-center mb-10 flex flex-col items-center gap-1.5">
        <span class="text-[10px] font-extrabold tracking-widest uppercase text-(--kc-teal-600)">Deep Dive</span>
        <h3 class="text-2xl font-black text-default tracking-tight">Compare All Features</h3>
      </div>
      
      <div class="overflow-hidden border border-default/80 rounded-2xl shadow-sm bg-elevated/30 backdrop-blur-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-default bg-elevated/60 backdrop-blur-md">
                <th class="text-left py-5 px-6 text-xs font-bold uppercase tracking-wider text-muted w-1/2">Feature</th>
                <th v-for="plan in plans" :key="plan.id" class="text-center py-5 px-4 text-sm font-extrabold text-default">
                  {{ plan.name }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr 
                v-for="row in comparisonRows" 
                :key="row.feature"
                class="hover:bg-primary/5 transition-colors duration-150"
              >
                <td class="py-4 px-6 font-medium text-default">{{ row.feature }}</td>
                <td v-for="plan in plans" :key="plan.id" class="py-4 px-4 text-center">
                  <template v-if="cellValue(row, plan.id) === true">
                    <div class="inline-flex w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 items-center justify-center">
                      <UIcon name="i-heroicons-check" class="size-3.5" />
                    </div>
                  </template>
                  <template v-else-if="cellValue(row, plan.id) === false">
                    <span class="text-dimmed text-xs">—</span>
                  </template>
                  <template v-else>
                    <span class="text-xs font-bold text-muted bg-default/60 border border-default px-2.5 py-1 rounded-md">
                      {{ renderCell(cellValue(row, plan.id)) }}
                    </span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const annual = ref(false)
const { plans, proPlan, monthlyPrice } = usePlans()
const { isAuthenticated } = useAuth()
const orgSettings = useOrgSettings()
const upgrading = ref<string | null>(null)
const checkoutError = ref<string>('')

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

async function handleUpgrade(planId: string) {
  if (!isAuthenticated.value) {
    const next = encodeURIComponent(`${orgSettings.billing.value}?plan=${planId}`)
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
  { feature: 'Locations', free: '1', pro: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Custom domain', free: false, pro: true, enterprise: true },
  { feature: 'SSL certificate', free: true, pro: true, enterprise: true },
  { feature: 'Google Business sync', free: false, pro: true, enterprise: true },
  { feature: 'AI credits / month', free: '500', pro: '5,000', enterprise: '50,000' },
  { feature: 'AI menu extraction', free: true, pro: true, enterprise: true },
  { feature: 'Reservations page', free: true, pro: true, enterprise: true },
  { feature: 'Reviews display', free: true, pro: true, enterprise: true },
  { feature: 'SEO & schema markup', free: 'Basic', pro: 'Advanced', enterprise: 'Advanced' },
  { feature: 'White-label', free: false, pro: false, enterprise: true },
  { feature: 'API access', free: false, pro: false, enterprise: true },
  { feature: 'Support', free: 'Community', pro: 'Priority email', enterprise: 'Dedicated' },
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
