<template>
  <!--
    The Plan tab, in Airbnb's rows: the plan you are on with Manage, what
    Payments costs, and Cancel plan. Manage opens the plans as a sheet; the
    change itself is Better Auth's subscription flow, which Stripe confirms with
    its proration before anything is charged.
  -->
  <div class="space-y-6">
    <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-20 w-full rounded-2xl" />
      <USkeleton class="h-20 w-full rounded-2xl" />
    </div>
    <EditorNavigationList v-else :groups="groups" @act="onRowAction" />

    <!-- ChatGPT's picker in our cards: every plan for sale, the current one marked, each with what it includes. -->
    <DashboardListItemDialog v-model:open="choosing" title="Change plan" :show-actions="false" :error="sheetError">
      <div class="grid gap-4 md:grid-cols-2">
        <BillingPlanCard v-for="plan in salePlans" :key="plan.id" :plan="plan" :highlighted="plan.id === billing?.plan">
          <template #cta>
            <UButton v-if="plan.id === billing?.plan" label="Your current plan" color="neutral" variant="outline" size="xl" block disabled />
            <UButton v-else :label="`Switch to ${plan.name}`" size="xl" block :loading="busy" @click="choosePlan(`plan:${plan.id}`)" />
          </template>
        </BillingPlanCard>
      </div>
    </DashboardListItemDialog>
    <DashboardListItemDialog v-model:open="creditOpen" title="Verify credit note" :saving="busy" :save-disabled="!creditNote.trim()" :error="sheetError" save-label="Verify credit" @save="settleCredit">
      <UFormField label="Issued Stripe credit note ID"><UInput v-model="creditNote" placeholder="cn_…" :disabled="busy" class="w-full" /></UFormField>
    </DashboardListItemDialog>
  </div>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import { STARTER_PLAN_ID, isKnownBillingPlan, isNewSalePlan } from '~/shared/billing-model'
import { paymentMoney } from '~/shared/payment-display'
import { isCurrencyCode } from '~/shared/currencies'

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardOrganization()
const { trackSubscriptionCheckoutSuccess } = useAnalytics()
const { startOrganizationCheckout } = useOrganizationSubscription()
const { plans, displayPrice } = await usePlans()
const { formatExactDateTime } = useHumanTime()

const errorMessage = ref('')
const successMessage = ref('')
const sheetError = ref('')
const busy = ref(false)
const choosing = ref(false)

interface BillingStatus { organizationId: string; plan: string; stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean }
const isBillingResponse = (value: unknown): value is { success: true; billing: BillingStatus } =>
  isRecord(value) && value.success === true && isRecord(value.billing) && typeof value.billing.organizationId === 'string' && isKnownBillingPlan(value.billing.plan)
const { data: billingResponse, error: billingError, pending: loading } = await useAsyncData(
  computed(() => `dashboard-billing:${String(route.params.orgSlug || '')}`),
  () => dashboardApi('/api/billing/status', { validate: isBillingResponse }),
)
const billing = computed(() => billingResponse.value?.billing ?? null)
watch(billingError, (error) => { if (error) errorMessage.value = error.message || 'Failed to load billing' }, { immediate: true })

// What Payments costs, and the usage billing behind it, read from the same place the Earnings fees come from.
type Pricing = { captured_volume_rate_percent: string; livemode: boolean }
type Credit = { id: string; source_id: string; currency: string; amount: number }
type UsageBilling = { configured: boolean; account?: { status: string }; pricing: Pricing | null; credits: Credit[] }
const isUsageBilling = (value: unknown): value is UsageBilling => isRecord(value) && typeof value.configured === 'boolean'
  && (value.pricing === null || (isRecord(value.pricing) && typeof value.pricing.captured_volume_rate_percent === 'string' && typeof value.pricing.livemode === 'boolean'))
  && (!value.configured || (isRecord(value.account) && typeof value.account.status === 'string'))
  && Array.isArray(value.credits) && value.credits.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.source_id === 'string' && isCurrencyCode(row.currency) && Number.isSafeInteger(row.amount))
const { data: usage, refresh: refreshUsage } = await useAsyncData(() => `payments-billing:${route.params.orgSlug}`, () => dashboardApi<UsageBilling>('/api/dashboard/payments/billing', { validate: isUsageBilling }), { lazy: true })

const currentPlan = computed(() => plans.value.find(plan => plan.id === billing.value?.plan) ?? null)
const onStarter = computed(() => billing.value?.plan === STARTER_PLAN_ID)
const planSummary = computed(() => {
  const status = billing.value
  if (!status) return ''
  if (onStarter.value) return 'Free'
  const parts: string[] = []
  const price = currentPlan.value ? displayPrice(currentPlan.value, false) : null
  if (price) parts.push(`${price}/mo`)
  if (status.subscriptionStatus === 'past_due') parts.push('Payment past due')
  else if (status.currentPeriodEnd) parts.push(`${status.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formatExactDateTime(status.currentPeriodEnd)}`)
  return parts.join(' · ')
})

const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'billing',
  items: [
    { id: 'plan', label: currentPlan.value?.name ?? 'Plan', summary: planSummary.value, action: { label: onStarter.value ? 'Choose a plan' : 'Manage' } },
    ...(usage.value?.pricing ? [{ id: 'fees', label: 'Payments fees', summary: `${usage.value.pricing.captured_volume_rate_percent}% of each payment, plus Stripe’s fees. Fees aren’t returned after a refund or dispute.` }] : []),
    ...(usage.value && usage.value.configured === false && billing.value?.plan === 'commerce' ? [{ id: 'usage:provision', label: 'Payments billing', summary: 'Not set up yet. Payments can’t be accepted until it is.', status: 'error' as const, action: { label: 'Set up' } }] : []),
    ...(usage.value?.account && ['servicing', 'closing'].includes(usage.value.account.status) ? [{ id: 'usage:finalize', label: 'Previous Payments billing', summary: 'Charges from earlier payments still apply; end it once they are settled.', action: { label: 'End' } }] : []),
    ...(usage.value?.credits ?? []).map(credit => ({ id: `credit:${credit.id}`, label: `Pending credit ${paymentMoney(-credit.amount, credit.currency)}`, summary: 'Issue the credit in Stripe, then verify its credit note here.', action: { label: 'Verify' } })),
    ...(!onStarter.value && billing.value && !billing.value.cancelAtPeriodEnd ? [{ id: 'cancel', label: 'Cancel plan', summary: 'If you cancel, you keep full access to your plan features until the end of your billing period.', action: { label: 'Cancel' } }] : []),
  ],
}])

const salePlans = computed(() => plans.value.filter(plan => isNewSalePlan(plan.id)))

const organizationId = () => {
  const id = dashboard.organization.value?.id
  if (!id) throw new Error('Organization context is unavailable')
  return id
}

async function onRowAction(id: string) {
  if (busy.value) return
  errorMessage.value = ''
  if (id === 'plan') { sheetError.value = ''; choosing.value = true; return }
  if (id.startsWith('credit:')) { creditId.value = id.slice('credit:'.length); creditNote.value = ''; sheetError.value = ''; return }
  busy.value = true
  try {
    if (id === 'cancel') await startOrganizationCheckout(organizationId(), STARTER_PLAN_ID)
    else if (id === 'usage:provision') { await dashboardApi('/api/dashboard/payments/billing', { method: 'POST', body: { action: 'provision' }, validate: (value: unknown): value is Record<string, unknown> => isRecord(value) && typeof value.metronome_contract_id === 'string' }); await refreshUsage() }
    else if (id === 'usage:finalize') { await dashboardApi('/api/dashboard/payments/billing', { method: 'POST', body: { action: 'finalize' }, validate: (value: unknown): value is Record<string, unknown> => isRecord(value) && value.closed === true }); await refreshUsage() }
    else if (id !== 'fees') throw new Error('Unknown billing action')
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Billing is unavailable right now')
  } finally {
    busy.value = false
  }
}

async function choosePlan(id: string) {
  if (busy.value || !id.startsWith('plan:')) return
  const plan = id.slice('plan:'.length)
  if (!isNewSalePlan(plan)) return
  busy.value = true
  sheetError.value = ''
  try {
    await startOrganizationCheckout(organizationId(), plan)
  } catch (error) {
    sheetError.value = getErrorMessage(error, 'The plan could not be changed')
  } finally {
    busy.value = false
  }
}

const creditId = ref<string | null>(null)
const creditNote = ref('')
const creditOpen = computed({ get: () => creditId.value !== null, set: (open: boolean) => { if (!open) { creditId.value = null; creditNote.value = '' } } })
async function settleCredit() {
  if (busy.value || !creditId.value || !creditNote.value.trim()) return
  busy.value = true
  sheetError.value = ''
  try {
    await dashboardApi('/api/dashboard/payments/billing', { method: 'POST', body: { action: 'reconcile_credit', event_id: creditId.value, credit_note_id: creditNote.value.trim() }, validate: (value: unknown): value is Record<string, unknown> => isRecord(value) && value.settled === true })
    await refreshUsage()
    creditOpen.value = false
  } catch (error) {
    sheetError.value = getErrorMessage(error, 'The credit note could not be verified')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const { success, plan, canceled, ...restQuery } = route.query
  if (success === 'true') {
    const id = dashboard.organization.value?.id
    if (id) trackSubscriptionCheckoutSuccess(id, typeof plan === 'string' ? plan : undefined)
    successMessage.value = typeof plan === 'string' && billing.value?.plan === plan
      ? 'Payment confirmed. Your plan has been updated.'
      : 'Payment is processing. Your plan will activate after Stripe confirms the subscription.'
  }
  if (canceled === 'true') errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  if (success || plan || canceled) await router.replace({ query: restQuery })
  // Stripe sends the plan back with success or canceled: that checkout is over. Only /api/post-login?plan=... arrives with the plan still to buy.
  if (success || canceled) return
  const planId = Array.isArray(plan) ? plan[0] : plan
  if (typeof planId === 'string' && planId && isNewSalePlan(planId) && !busy.value) await choosePlan(`plan:${planId}`)
})
</script>
