<template>
  <div>
    <!-- Primary 3 plans -->
    <div class="grid sm:grid-cols-3 gap-6 items-stretch">
      <div
        v-for="plan in mainPlans"
        :key="plan.id"
        :class="plan.highlighted ? 'sm:-mt-4 sm:mb-4' : ''"
        class="flex flex-col"
      >
        <BillingPlanCard :plan="plan" :annual="false" class="h-full flex-1">
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

    <!-- SEO Accelerator — premium add-on -->
    <div v-if="seoAcceleratorPlan" class="mt-6 rounded-2xl border border-default bg-elevated/30 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-bold uppercase tracking-widest text-primary">Premium Add-on</span>
          <UBadge v-if="seoAcceleratorPlan.badge" :label="seoAcceleratorPlan.badge" color="primary" variant="soft" size="xs" />
        </div>
        <h3 class="text-xl font-bold text-highlighted">{{ seoAcceleratorPlan.name }}</h3>
        <p class="mt-1 text-sm text-muted">{{ seoAcceleratorPlan.tagline }}</p>
        <ul class="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <li v-for="f in seoAcceleratorPlan.features" :key="f" class="flex items-start gap-2 text-sm text-default">
            <UIcon name="i-heroicons-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
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
        <UButton
          size="lg"
          :loading="upgrading === seoAcceleratorPlan.id"
          class="font-bold"
          @click="handleUpgrade(seoAcceleratorPlan.id)"
        >
          Get SEO Accelerator
        </UButton>
      </div>
    </div>

    <!-- Checkout error -->
    <div v-if="checkoutError" class="max-w-3xl mx-auto mt-8 bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/60 rounded-2xl p-6 text-center">
      <div class="flex items-center justify-center gap-2 text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-5" />
        <span class="font-medium text-sm">{{ checkoutError }}</span>
      </div>
    </div>

    <!-- Managed service callout -->
    <UCard class="max-w-3xl mx-auto mt-20 relative overflow-hidden text-center bg-linear-to-br from-primary/5 via-elevated/40 to-(--kc-teal)/5 border-default/70 rounded-3xl shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div class="p-8 sm:p-10">
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl opacity-40" />
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40" />

      <div class="relative z-10 flex flex-col items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
          <UIcon name="i-heroicons-sparkles" class="size-6" />
        </div>
        <h3 class="text-xl font-extrabold text-default tracking-tight">Send us a WhatsApp. We handle the rest.</h3>
        <p class="text-sm leading-relaxed text-muted max-w-2xl">
          On Managed or SEO Accelerator, Paul & Julia own your online presence.
          Content update? Voice note us. New season or offerings? We update it. Visitors can't find you? We fix it.
          Less than one hour of agency work per month — at a fraction of the cost.
        </p>
      </div>
      </div>
    </UCard>

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
const { plans } = usePlans()

const MAIN_PLAN_IDS = ['free', 'growth', 'managed']
const mainPlans = computed(() => (plans.value ?? []).filter(p => MAIN_PLAN_IDS.includes(p.id)))
const seoAcceleratorPlan = computed(() => (plans.value ?? []).find(p => p.id === 'seo_accelerator') ?? null)
const seoAcceleratorMonthlyPrice = computed(() => {
  const plan = seoAcceleratorPlan.value
  if (!plan) return null
  return plan.prices.find(p => p.interval === 'month') || null
})
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
      body: { plan: planId, interval: 'month' }
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
type ComparisonRow = { feature: string } & Record<string, CellValue>

const comparisonRows: ComparisonRow[] = [
  { feature: 'AI site builder (live in minutes)', free: true,    growth: true,      managed: true },
  { feature: 'WhatsApp content updates',          free: false,   growth: true,      managed: true },
  { feature: 'Bookings & experiences',            free: true,    growth: true,      managed: true },
  { feature: 'Order & delivery links',            free: true,    growth: true,      managed: true },
  { feature: 'AI content generation',             free: '500 credits', growth: '2,000 credits', managed: 'Unlimited' },
  { feature: 'LLM-ready SEO (get found by AI)',   free: 'Basic', growth: 'Advanced', managed: 'Advanced' },
  { feature: 'Multi-language support',            free: false,   growth: '1 language', managed: 'Unlimited' },
  { feature: 'Custom domain',                     free: false,   growth: true,      managed: true },
  { feature: 'Facebook auto-sync',                free: false,   growth: false,     managed: true },
  { feature: 'Google Business sync',              free: false,   growth: 'Basics',  managed: 'Full management' },
  { feature: 'WhatsApp notifications',            free: false,   growth: true,      managed: true },
  { feature: 'Managed by Paul & Julia',           free: false,   growth: false,     managed: true },
  { feature: 'Support',                           free: 'Community', growth: 'WhatsApp', managed: 'Priority WhatsApp' },
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
