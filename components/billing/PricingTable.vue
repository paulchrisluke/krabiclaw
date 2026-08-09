<template>
  <div>
    <!-- Primary plans -->
    <div
      class="grid grid-cols-1 gap-6 items-stretch mx-auto lg:grid-cols-2 max-w-3xl"
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
import { NEW_SALE_PLAN_ID, STARTER_PLAN_ID } from '~/shared/billing-model'

const props = defineProps<{
  plans: Plan[]
}>()

const planList = computed(() => props.plans)

const MAIN_PLAN_IDS: ReadonlySet<string> = new Set([STARTER_PLAN_ID, NEW_SALE_PLAN_ID])
const mainPlans = computed(() => planList.value.filter(p => MAIN_PLAN_IDS.has(p.id)))
const upgrading = ref<string | null>(null)
const checkoutError = ref<string>('')

async function handleUpgrade(planId: string) {
  upgrading.value = planId
  checkoutError.value = ''
  try {
    const [{ authClient }, { useOrgSettings }] = await Promise.all([
      import('~/lib/auth-client'),
      import('~/composables/useOrgSettings'),
    ])
    const session = await authClient.getSession()
    if (!session.data?.user) {
      await navigateTo({ path: '/login', query: { redirect: `/pricing?plan=${encodeURIComponent(planId)}` } })
      return
    }
    const billingPath = useOrgSettings().billing.value
    if (!billingPath) throw new Error('Organization context is required to upgrade a plan')
    const billingUrl = `${billingPath}?plan=${encodeURIComponent(planId)}`
    await navigateTo(billingUrl)
  } catch (error) {
    checkoutError.value = error instanceof Error ? error.message : 'Unable to open billing. Please try again.'
  } finally {
    upgrading.value = null
  }
}

type CellValue = boolean | string
type ComparisonRow = { feature: string } & Record<string, CellValue>

const comparisonRows: ComparisonRow[] = [
  { feature: 'AI site builder (live in minutes)', free: true, growth: true },
  { feature: 'WhatsApp content updates', free: false, growth: true },
  { feature: 'Bookings & experiences', free: true, growth: true },
  { feature: 'Shared organization usage credits', free: '500 / UTC week', growth: '2,000 / UTC week' },
  { feature: 'Custom domain', free: false, growth: true },
  { feature: 'Facebook auto-sync', free: false, growth: true },
  { feature: 'Google Business sync', free: false, growth: true },
  { feature: 'Post-booking review requests', free: false, growth: true },
  { feature: 'Messaging notifications', free: false, growth: true },
  { feature: 'Support', free: 'Community', growth: 'Priority' },
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
