<template>
  <!-- A row on Menu, with its own controls: nothing here saves from a footer. -->
  <DashboardLeafPanel id="organization-billing" title="Billing" :footer="false">
    <div class="space-y-6">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="errorMessage"
      />

      <UAlert
        v-if="successMessage"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        :description="successMessage"
      />

      <div v-if="loading" class="space-y-3">
        <USkeleton class="h-20 w-full rounded-2xl" />
        <USkeleton class="h-20 w-full rounded-2xl" />
      </div>

      <!--
        Two value rows, the Personal information shape. The plan row says what the
        business is on and what happens next; everything else about money — the
        card, receipts, invoices, cancelling — is Stripe's hosted portal, which is
        the only surface the Better Auth Stripe plugin exposes for it.
      -->
      <EditorNavigationList v-else :groups="groups" @act="onRowAction" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { NEW_SALE_PLAN_ID, STARTER_PLAN_ID, isKnownBillingPlan } from '~/shared/billing-model'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardOrganization()
const { trackSubscriptionCheckoutSuccess } = useAnalytics()
const { startOrganizationCheckout, openBillingPortal } = useOrganizationSubscription()
const { plans, displayPrice } = usePlans()
const { formatExactDateTime } = useHumanTime()

const errorMessage = ref('')
const successMessage = ref('')
const busy = ref(false)

interface BillingStatus {
  organizationId: string
  plan: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}
const isBillingResponse = (value: unknown): value is { success: true; billing: BillingStatus } =>
  isRecord(value)
  && value.success === true
  && isRecord(value.billing)
  && typeof value.billing.organizationId === 'string'
  && isKnownBillingPlan(value.billing.plan)

const { data: billingResponse, error: billingError, pending: loading } = await useAsyncData(
  computed(() => `dashboard-billing:${String(route.params.orgSlug || '')}`),
  () => dashboardApi('/api/billing/status', { validate: isBillingResponse }),
)
const billing = computed(() => billingResponse.value?.billing ?? null)
watch(billingError, (error) => { if (error) errorMessage.value = error.message || 'Failed to load billing' }, { immediate: true })

const currentPlan = computed(() => plans.value?.find(plan => plan.id === billing.value?.plan) ?? null)
const onStarter = computed(() => billing.value?.plan === STARTER_PLAN_ID)

/** One line: the price, then what happens on the period boundary. */
const planSummary = computed(() => {
  const status = billing.value
  if (!status) return ''
  if (onStarter.value) return 'Free'
  const parts: string[] = []
  const price = currentPlan.value ? displayPrice(currentPlan.value, false) : null
  if (price) parts.push(`${price}/mo`)
  if (status.subscriptionStatus === 'past_due') parts.push('Payment past due')
  else if (status.currentPeriodEnd) {
    parts.push(`${status.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formatExactDateTime(status.currentPeriodEnd)}`)
  }
  return parts.join(' · ')
})

const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'billing',
  items: [
    {
      id: 'plan',
      label: currentPlan.value?.name ?? 'Plan',
      summary: planSummary.value,
      action: { label: onStarter.value ? 'Upgrade' : 'Manage' },
    },
    ...(billing.value?.stripeCustomerId
      ? [{ id: 'portal', label: 'Payment and invoices', summary: 'Card, receipts and invoices at Stripe', action: { label: 'Open' } }]
      : []),
  ],
}])

async function onRowAction(id: string) {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    if (id === 'plan' && onStarter.value) await upgrade(NEW_SALE_PLAN_ID)
    else await openBillingPortal()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Billing is unavailable right now'
  } finally {
    busy.value = false
  }
}

// One business: the site the subscription is metadata on is the one this
// dashboard is for.
async function upgrade(plan: string) {
  const organizationId = dashboard.organization.value?.id
  if (!organizationId) throw new Error('Site context is unavailable')
  await startOrganizationCheckout(organizationId, plan)
}

onMounted(async () => {
  const { success, plan, canceled, ...restQuery } = route.query

  if (success === 'true') {
    trackSubscriptionCheckoutSuccess(typeof plan === 'string' ? plan : undefined)
    // The plan the guest paid for is in the query; the refreshed billing row says what Stripe has confirmed.
    successMessage.value = typeof plan === 'string' && billing.value?.plan === plan
      ? 'Payment confirmed. Your plan has been updated.'
      : 'Payment is processing. Your plan will activate after Stripe confirms the subscription.'
  }
  if (canceled === 'true') errorMessage.value = 'Payment was canceled. Your plan was not changed.'

  if (success || plan || canceled) await router.replace({ query: restQuery })

  // Stripe sends the plan back with success or canceled: that checkout is
  // over. Only /api/post-login?plan=growth arrives with the plan still to buy.
  if (success || canceled) return
  const planId = Array.isArray(plan) ? plan[0] : plan
  if (typeof planId === 'string' && planId && !busy.value) {
    busy.value = true
    try {
      await upgrade(planId)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to create checkout session'
    } finally {
      busy.value = false
    }
  }
})

useSeoMeta({ title: 'Billing | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
