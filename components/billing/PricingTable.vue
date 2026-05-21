<template>
  <div>
    <!-- Plan cards — 4 cols on large screens -->
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
      <div
        v-for="plan in plans"
        :key="plan.id"
        :class="plan.highlighted ? 'lg:-mt-4 lg:mb-4' : ''"
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

    <!-- Checkout error -->
    <div v-if="checkoutError" class="max-w-3xl mx-auto mt-8 bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/60 rounded-2xl p-6 text-center">
      <div class="flex items-center justify-center gap-2 text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-5" />
        <span class="font-medium text-sm">{{ checkoutError }}</span>
      </div>
    </div>

    <!-- Managed service callout -->
    <div class="max-w-3xl mx-auto mt-20 relative overflow-hidden bg-gradient-to-br from-primary/5 via-elevated/40 to-(--kc-teal)/5 border border-default/70 backdrop-blur-md rounded-3xl p-8 sm:p-10 text-center shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl opacity-40" />
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40" />

      <div class="relative z-10 flex flex-col items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
          <UIcon name="i-heroicons-sparkles" class="size-6" />
        </div>
        <h3 class="text-xl font-extrabold text-default tracking-tight">Send us a WhatsApp. We handle the rest.</h3>
        <p class="text-sm leading-relaxed text-muted max-w-2xl">
          On Managed or SEO Accelerator, Paul & Julia own your restaurant's online presence.
          Menu change? Voice note us. New seasonal menu? We update it. Tourists can't find you? We fix it.
          Less than one hour of agency work per month — at a fraction of the cost.
        </p>
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
const { plans } = usePlans()
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
  { feature: 'Site & menu',            free: true,        growth: true,         managed: true,       seo_accelerator: true },
  { feature: 'Translation',            free: false,       growth: '1 language', managed: 'Unlimited', seo_accelerator: 'Unlimited' },
  { feature: 'Menu updates',           free: 'Self',      growth: 'Via WhatsApp', managed: 'We do it', seo_accelerator: 'We do it' },
  { feature: 'Google Business',        free: false,       growth: 'Basics',     managed: 'Full mgmt', seo_accelerator: 'Full mgmt' },
  { feature: 'SEO & schema markup',    free: 'Basic',     growth: 'Basic',      managed: 'Advanced', seo_accelerator: 'Expert' },
  { feature: 'Custom domain',          free: false,       growth: false,        managed: true,       seo_accelerator: true },
  { feature: 'AI credits / month',     free: '500',       growth: '2,000',      managed: 'Unlimited', seo_accelerator: 'Unlimited' },
  { feature: 'Monthly report',         free: false,       growth: true,         managed: true,       seo_accelerator: true },
  { feature: 'Content cadence',        free: false,       growth: false,        managed: false,      seo_accelerator: true },
  { feature: 'Keyword targeting',      free: false,       growth: false,        managed: false,      seo_accelerator: true },
  { feature: 'Support',                free: 'Community', growth: 'WhatsApp',   managed: 'Priority WhatsApp', seo_accelerator: 'Dedicated' },
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
