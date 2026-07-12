<template>
  <div>
    <!-- Primary plans -->
    <div
      class="grid grid-cols-1 gap-6 items-stretch mx-auto"
      :class="mainPlans.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2 max-w-3xl'"
    >
      <div
        v-for="plan in mainPlans"
        :key="plan.id"
        :class="plan.highlighted ? 'sm:-mt-4 sm:mb-4' : ''"
        class="flex flex-col"
      >
        <BillingPlanCard :plan="plan" :annual="false" class="h-full flex-1">
          <template v-if="plan.prices.length" #cta>
            <PlatformButton
              size="xl"
              block
              :loading="upgrading === plan.id"
              :variant="plan.highlighted ? 'solid' : 'outline'"
              class="font-bold shadow-sm transition-all duration-300"
              @click="handleUpgrade(plan.id)"
            >
              Get Started
            </PlatformButton>
          </template>
        </BillingPlanCard>
      </div>
    </div>

    <!-- SEO Accelerator — premium add-on -->
    <div v-if="seoAcceleratorPlan" class="mt-6 rounded-2xl border border-default bg-elevated/30 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-bold uppercase tracking-widest text-primary">Premium Add-on</span>
          <PlatformBadge v-if="seoAcceleratorPlan.badge" color="primary">{{ seoAcceleratorPlan.badge }}</PlatformBadge>
        </div>
        <h3 class="text-xl font-bold text-highlighted">{{ seoAcceleratorPlan.name }}</h3>
        <p class="mt-1 text-sm text-muted">{{ seoAcceleratorPlan.tagline }}</p>
        <ul class="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <li v-for="f in seoAcceleratorPlan.features" :key="f" class="flex items-start gap-2 text-sm text-default">
            <PlatformIcon name="check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ f }}</span>
          </li>
        </ul>
      </div>
      <div class="shrink-0 flex flex-col items-start sm:items-end gap-3">
        <p class="text-3xl font-bold text-highlighted">
          <template v-if="seoAcceleratorMonthlyPrice">
            ${{ seoAcceleratorMonthlyPrice.amount / 100 }}
            <span class="text-base font-normal text-muted">/mo</span>
          </template>
          <template v-else>
            <span class="text-error">No monthly price configured</span>
          </template>
        </p>
        <PlatformButton
          size="lg"
          :loading="upgrading === seoAcceleratorPlan.id"
          class="font-bold"
          @click="handleUpgrade(seoAcceleratorPlan.id)"
        >
          Get SEO Accelerator
        </PlatformButton>
      </div>
    </div>

    <!-- Checkout error -->
    <div v-if="checkoutError" class="max-w-3xl mx-auto mt-8 bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/60 rounded-2xl p-6 text-center">
      <div class="flex items-center justify-center gap-2 text-error-600 dark:text-error-400">
        <PlatformIcon name="exclamation-triangle" class="size-5" />
        <span class="font-medium text-sm">{{ checkoutError }}</span>
      </div>
    </div>


    <!-- Feature comparison table -->
    <div class="max-w-5xl mx-auto mt-24">
      <div class="text-center mb-10 flex flex-col items-center gap-1.5">
        <span class="text-[10px] font-extrabold tracking-widest uppercase text-(--kc-teal-600)">Deep Dive</span>
        <h3 class="text-2xl font-black text-default tracking-tight">Compare All Features</h3>
      </div>

      <div class="overflow-hidden border border-default/80 rounded-2xl shadow-sm bg-elevated/30 backdrop-blur-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-default bg-elevated/60 backdrop-blur-md">
                <th class="text-left py-5 px-6 text-xs font-bold uppercase tracking-wider text-muted w-1/3">Feature</th>
                <th v-for="plan in mainPlans" :key="plan.id" class="text-center py-5 px-4 text-sm font-extrabold text-default">
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
                <td v-for="plan in mainPlans" :key="plan.id" class="py-4 px-4 text-center">
                  <template v-if="cellValue(row, plan.id) === true">
                    <div class="inline-flex w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 items-center justify-center">
                      <PlatformIcon name="check" class="size-3.5" />
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
import type { Plan } from '~/server/api/billing/plans.get'

const props = defineProps<{
  plans?: Plan[] | null
}>()

const planList = computed(() => props.plans ?? [])

const MAIN_PLAN_IDS = ['free', 'growth', 'managed']
const mainPlans = computed(() => planList.value.filter(p => MAIN_PLAN_IDS.includes(p.id)))
const seoAcceleratorPlan = computed(() => planList.value.find(p => p.id === 'seo_accelerator') ?? null)
const seoAcceleratorMonthlyPrice = computed(() => {
  const plan = seoAcceleratorPlan.value
  if (!plan) return null
  return plan.prices.find(p => p.interval === 'month') || null
})
const { isAuthenticated } = useAuth()
const orgSettings = useOrgSettings()
const upgrading = ref<string | null>(null)
const checkoutError = ref<string>('')

async function handleUpgrade(planId: string) {
  const billingUrl = `${orgSettings.billing.value}?plan=${encodeURIComponent(planId)}`
  if (!isAuthenticated.value) {
    const next = encodeURIComponent(billingUrl)
    await navigateTo(`/login?next=${next}`)
    return
  }
  await navigateTo(billingUrl)
}

type CellValue = boolean | string
type ComparisonRow = { feature: string } & Record<string, CellValue>

const comparisonRows: ComparisonRow[] = [
  { feature: 'AI site builder (live in minutes)', free: true,    growth: true,      managed: true },
  { feature: 'WhatsApp content updates',          free: false,   growth: true,      managed: true },
  { feature: 'Bookings & experiences',            free: true,    growth: true,      managed: true },
  { feature: 'AI content generation',             free: '500 credits', growth: '2,000 credits', managed: 'Unlimited' },
  { feature: 'LLM-ready SEO (get found by AI)',   free: 'Basic', growth: 'Advanced', managed: 'Advanced' },
  { feature: 'Custom domain',                     free: false,   growth: true,      managed: true },
  { feature: 'Facebook auto-sync',                free: false,   growth: true,      managed: true },
  { feature: 'Google Business sync',              free: false,   growth: true,  managed: true },
  { feature: 'Post-booking review requests',      free: true,   growth: true,      managed: true },
  { feature: 'WhatsApp notifications',            free: false,   growth: true,      managed: true },
  { feature: 'Support',                           free: 'Community', growth: 'Priority', managed: 'Priority' },
]

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
