<template>
  <OrganizationSettingsShell detail-title="Billing">
    <div v-if="loading" class="space-y-6">
        <USkeleton class="h-28 w-full" />
        <div class="grid gap-4 lg:grid-cols-3">
          <USkeleton class="h-64" />
          <USkeleton class="h-64" />
          <USkeleton class="h-64" />
        </div>
      </div>

      <div v-else class="space-y-6">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="errorMessage"
        />

        <UCard v-if="sites.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Sites</h2>
              <UButton
                v-if="sites.some(s => s.plan !== 'free')"
                size="xs"
                color="neutral"
                variant="ghost"
                :loading="portalLoading"
                @click="openBillingPortal"
              >
                Manage subscriptions
              </UButton>
            </div>
          </template>

          <ul class="-mx-4 -mb-4 sm:-mx-6 sm:-mb-6 divide-y divide-default">
            <li
              v-for="s in sites"
              :key="s.siteId"
              class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted truncate">{{ s.brandName ?? s.subdomain }}</p>
                <p class="text-xs text-muted">
                  {{ s.subdomain }}
                  <span v-if="s.currentPeriodEnd"> · Renews {{ formatDate(s.currentPeriodEnd) }}</span>
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge :color="s.plan === 'free' ? 'neutral' : 'primary'" variant="soft" class="capitalize">
                  {{ s.plan }}
                </UBadge>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :class="selectedSiteId === s.siteId ? 'ring-2 ring-primary' : ''"
                  @click="selectedSiteId = s.siteId"
                >
                  Change plan
                </UButton>
              </div>
            </li>
          </ul>
        </UCard>

        <!-- Payment method -->
        <UCard v-if="sites.some(s => s.plan !== 'free') || savedCard">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-credit-card" class="size-4 text-primary" />
                <h2 class="font-semibold">Payment method</h2>
              </div>
              <UButton
                v-if="sites.some(s => s.plan !== 'free')"
                size="xs"
                color="neutral"
                variant="ghost"
                :loading="portalLoading"
                @click="openBillingPortal"
              >
                Manage
              </UButton>
            </div>
          </template>

          <div v-if="savedCard" class="flex items-center gap-4">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-default bg-elevated text-xs font-bold uppercase tracking-wide text-muted">
              {{ savedCard.brand.slice(0, 4) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-highlighted">•••• •••• •••• {{ savedCard.last4 }}</p>
              <p class="text-xs text-muted">Expires {{ savedCard.exp_month }}/{{ savedCard.exp_year }}</p>
            </div>
            <UBadge label="Default" color="success" variant="soft" size="xs" />
          </div>
          <p v-else class="text-sm text-muted">No payment method saved. Add one when you subscribe or upgrade your plan.</p>
        </UCard>

        <!-- Shared organization usage quota -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bot" class="size-4 text-primary" />
                <h2 class="font-semibold">Shared usage credits</h2>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="credits" class="text-sm text-muted">
                  <template v-if="credits.reconciliationRequired">Usage unavailable pending approved reconciliation</template>
                  <template v-else-if="credits.unlimited">Unlimited this UTC week</template>
                  <template v-else-if="credits.periodRemaining !== null">{{ credits.periodRemaining.toLocaleString() }} remaining this UTC week</template>
                  <template v-else>Allowance unavailable</template>
                </span>
                <UButton v-else size="xs" color="primary" variant="soft" icon="i-lucide-zap" @click="openServiceUpsell('growth', 'billing-credits')">
                  Upgrade for more
                </UButton>
              </div>
            </div>
          </template>

          <USkeleton v-if="creditsLoading" class="h-32 w-full" />

          <div v-else-if="credits" class="space-y-4">
            <div v-if="credits.reconciliationRequired" class="rounded-lg border border-warning-200 bg-warning-50 px-3 py-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-200">
              <p class="font-medium">Shared usage quota unavailable pending approved reconciliation</p>
              <p class="mt-1 text-xs">Current allowance and remaining quota are unavailable until the older credit projection receives an approved billing adjustment.</p>
            </div>
            <div v-else-if="credits.unlimited" class="rounded-lg bg-elevated px-3 py-3 text-sm">
              <p class="font-medium text-highlighted">Unlimited shared usage credits</p>
              <p class="mt-1 text-xs text-muted">The organization plan has no finite weekly allowance.</p>
            </div>
            <div v-else-if="credits.periodRemaining !== null">
              <div class="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{{ credits.periodUsed.toLocaleString() }} used this UTC week</span>
                <span>{{ credits.periodRemaining.toLocaleString() }} remaining</span>
              </div>
              <p class="text-xs text-muted">
                Effective current allowance:
                <span v-if="credits.periodAllowance !== null">{{ credits.periodAllowance.toLocaleString() }} credits</span>
                <span v-else>unavailable</span>
                for this period.
              </p>
            </div>

            <div class="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Plan allowance</p>
                <p class="mt-0.5 font-semibold tabular-nums">
                  <span v-if="credits.planAllowance !== null">{{ credits.planAllowance.toLocaleString() }} / UTC week</span>
                  <span v-else-if="credits.unlimited">Unlimited</span>
                  <span v-else>Unavailable</span>
                </p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Effective current allowance</p>
                <p class="mt-0.5 font-semibold tabular-nums">
                  <span v-if="credits.periodAllowance !== null">{{ credits.periodAllowance.toLocaleString() }} credits</span>
                  <span v-else-if="credits.unlimited">Unlimited</span>
                  <span v-else>Unavailable</span>
                </p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Used this UTC week</p>
                <p class="mt-0.5 font-semibold tabular-nums">{{ credits.periodUsed.toLocaleString() }}</p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Remaining this UTC week</p>
                <p class="mt-0.5 font-semibold tabular-nums">
                  <span v-if="credits.periodRemaining !== null">{{ credits.periodRemaining.toLocaleString() }}</span>
                  <span v-else-if="credits.unlimited">Unlimited</span>
                  <span v-else>Unavailable</span>
                </p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Current UTC-week period</p>
                <p class="mt-0.5 font-semibold">{{ formatDate(credits.periodStart) }} – {{ formatDate(credits.periodEnd) }}</p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Lifetime usage</p>
                <p class="mt-0.5 font-semibold tabular-nums">{{ credits.lifetimeUsed.toLocaleString() }}</p>
              </div>
              <div class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-muted">Per-chat cap</p>
                <p class="mt-0.5 font-semibold tabular-nums">
                  <span v-if="credits.sessionLimit !== null">{{ credits.sessionLimit.toLocaleString() }} credits</span>
                  <span v-else-if="credits.unlimited">Unlimited</span>
                  <span v-else>Unavailable</span>
                </p>
              </div>
              <div v-if="credits.reconciliationRequired" class="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-warning-700 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-300 sm:col-span-2 lg:col-span-3">
                <p class="font-medium">Quota reconciliation required</p>
                <p class="mt-0.5">An older credit projection needs an approved billing adjustment before usage can continue.</p>
              </div>
            </div>

            <div v-if="credits.byAction?.length" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div v-for="row in credits.byAction" :key="`${row.resource}:${row.action}:${row.charged}`" class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-xs text-muted capitalize">{{ String(row.action || row.resource).replace(/_/g, ' ') }}</p>
                <p class="mt-0.5 text-lg font-semibold tabular-nums">{{ row.quantity.toLocaleString() }}</p>
                <p class="text-xs text-muted">{{ row.calls }} call{{ row.calls === 1 ? '' : 's' }} · {{ row.charged === false ? 'not charged' : row.charged === true ? 'charged' : 'charge unknown' }}</p>
              </div>
            </div>

            <div v-if="credits.usage?.length">
              <h3 class="mb-2 text-sm font-medium">Recent usage</h3>
              <div class="overflow-x-auto rounded-lg border border-default">
                <table class="w-full text-sm">
                  <thead class="bg-elevated">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">Resource</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">Action</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">Site</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">Quantity</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">Charged</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">When</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr v-for="(row, i) in credits.usage" :key="i" class="hover:bg-elevated/50">
                      <td class="px-3 py-2 capitalize">{{ String(row.resource).replace(/_/g, ' ') }}</td>
                      <td class="px-3 py-2 capitalize">{{ row.action ? String(row.action).replace(/_/g, ' ') : '—' }}</td>
                      <td class="px-3 py-2 text-muted">{{ row.site_name || row.site_id || '—' }}</td>
                      <td class="px-3 py-2 text-right font-medium tabular-nums">{{ row.quantity.toLocaleString() }}</td>
                      <td class="px-3 py-2 text-right text-muted">{{ row.charged === false ? 'No' : row.charged === true ? 'Yes' : 'Unknown' }}</td>
                      <td class="px-3 py-2 text-right text-muted">{{ formatRelativeTime(String(row.created_at)) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p v-else class="text-sm text-muted">No usage recorded this UTC week.</p>
          </div>

          <div v-else class="rounded-lg border border-dashed border-default bg-elevated p-5">
            <p class="text-sm text-muted">No AI credit activity yet.</p>
            <p class="mt-1 text-xs text-muted">Usage appears here after your first AI action.</p>
          </div>
        </UCard>


        <UAlert
          v-if="selectedSite"
          color="primary"
          variant="soft"
          icon="i-lucide-info"
          title="Changing your organization plan"
          description="One subscription covers every site in this organization. The selected site is included as billing context, and site entitlements are derived from the organization plan."
        />

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="plan in plans"
            :key="plan.id"
            :class="selectedSite?.plan === plan.id ? 'ring-2 ring-primary' : ''"
          >
            <div class="flex h-full flex-col">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-lg font-semibold text-highlighted">{{ plan.name }}</h2>
                  <div class="flex gap-2">
                    <UBadge v-if="plan.badge && selectedSite?.plan !== plan.id" color="primary" variant="soft">{{ plan.badge }}</UBadge>
                    <UBadge v-if="selectedSite?.plan === plan.id" color="primary" variant="soft">Current</UBadge>
                  </div>
                </div>
                <p class="mt-2 text-3xl font-semibold text-highlighted">
                  {{ displayPrice(plan, annual) }}
                  <span v-if="plan.prices?.length" class="text-sm font-normal text-muted">
                    /mo
                  </span>
                </p>
              </div>

              <ul class="mt-5 flex-1 space-y-2 text-sm text-default">
                <li v-for="feature in plan.features" :key="feature" class="flex gap-2">
                  <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <template v-if="selectedSite && selectedSite.plan !== plan.id">
                <UButton
                  v-if="plan.id === 'free'"
                  color="neutral"
                  variant="soft"
                  block
                  class="mt-6"
                  @click="upgradeToPlan(plan.id)"
                >
                  Switch to Free
                </UButton>
                <UButton
                  v-else
                  :loading="upgrading === plan.id"
                  color="primary"
                  block
                  class="mt-6"
                  @click="upgradeToPlan(plan.id)"
                >
                  Upgrade to {{ plan.name }}
                </UButton>
              </template>
            </div>
          </UCard>
        </div>
    </div>
  </OrganizationSettingsShell>

</template>

<script setup lang="ts">
import OrganizationSettingsShell from '~/components/dashboard/OrganizationSettingsShell.vue'

const dashboardApi = useDashboardApi()

import { authClient } from '~/lib/auth-client'
const toast = useToast()

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const {
  trackPlanViewed,
  trackCheckoutStarted,
  trackSubscriptionUpgrade,
  trackSubscriptionDowngrade,
  trackSubscriptionCheckoutSuccess,
} = useAnalytics()
const { isAuthenticated } = useAuth()
const { startSubscriptionCheckout } = useSubscriptionCheckout()
const loading = ref(true)
const billing = ref<ApiRecord | null>(null)
const credits = ref<BillingCreditsResource | null>(null)

interface SiteBillingSummary {
  siteId: string
  brandName: string | null
  subdomain: string | null
  plan: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}
const sites = ref<SiteBillingSummary[]>([])
const selectedSiteId = ref<string | null>(null)
const selectedSite = computed(() => sites.value.find(s => s.siteId === selectedSiteId.value) ?? null)

const creditsLoading = ref(true)
const upgrading = ref<string | null>(null)
const portalLoading = ref(false)
const errorMessage = ref('')
const annual = ref(false)

interface SavedCard { brand: string; last4: string; exp_month: number; exp_year: number }
const savedCard = ref<SavedCard | null>(null)

const { plans, displayPrice } = usePlans()
const { open: openServiceUpsell } = useServiceUpsell()

function planPriceId(planId: string | null | undefined): string | null {
  if (!planId) return null
  const plan = plans.value?.find(item => item.id === planId)
  return plan?.prices.find(price => price.interval === (annual.value ? 'year' : 'month'))?.id ?? null
}

const { formatRelativeTime, formatExactDateTime: formatDate } = useHumanTime()

const upgradeToPlan = async (plan: string) => {
  if (!selectedSiteId.value) {
    errorMessage.value = 'Choose a site above before changing its plan'
    return
  }
  errorMessage.value = ''
  upgrading.value = plan
  trackPlanViewed(plan)
  trackCheckoutStarted(plan)
  try {
    const organizationId = billing.value?.organizationId
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new Error('Organization ID not found')
    }
    if (billing.value?.subscriptionStatus === 'past_due') {
      await openBillingPortal()
      return
    }
    const currentPlan = selectedSite.value?.plan ?? (typeof billing.value?.plan === 'string' ? billing.value.plan : 'free')
    const subscriptionId = typeof billing.value?.stripeSubscriptionId === 'string'
      ? billing.value.stripeSubscriptionId
      : null
    const previousPriceId = planPriceId(currentPlan)
    const newPriceId = planPriceId(plan)
    await startSubscriptionCheckout({
      organizationId,
      siteId: selectedSiteId.value,
      plan,
      currentPlan,
      subscriptionId,
      annual: annual.value,
      previousPriceId,
      newPriceId,
      onAction: action => {
        if (action === 'upgrade') trackSubscriptionUpgrade(plan)
        if (action === 'downgrade' && plan !== 'free') trackSubscriptionDowngrade(plan)
      },
    })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to create checkout session'
  } finally {
    upgrading.value = null
  }
}

const openBillingPortal = async () => {
  portalLoading.value = true
  errorMessage.value = ''
  try {
    const orgId = billing.value?.organizationId ?? ''
    if (!orgId) {
      errorMessage.value = 'Organization ID not found'
      return
    }
    const response = await authClient.subscription.billingPortal({
      referenceId: orgId,
      customerType: 'organization',
      returnUrl: window.location.href,
      disableRedirect: true,
    })
    if (response.error) throw new Error(response.error.message ?? 'Failed to open billing portal')
    const portalUrl = response.data && 'url' in response.data ? response.data.url : null
    if (!portalUrl) throw new Error('Better Auth Stripe did not return a billing portal URL')
    await navigateTo(portalUrl, { external: true })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to open billing portal'
  } finally {
    portalLoading.value = false
  }
}

interface BillingResource {
  billing: ApiRecord
  credits: BillingCreditsResource
  paymentMethod: { card: SavedCard | null }
  sites: { success: true; sites: SiteBillingSummary[] }
}

interface BillingCreditsUsage {
  resource: string
  site_id: string | null
  site_name: string | null
  action: string | null
  quantity: number
  charged: boolean | null
  created_at: string
}

interface BillingCreditsGroup {
  resource: string
  action: string | null
  charged: boolean | null
  quantity: number
  calls: number
}

interface BillingCreditsResource {
  plan: string
  planAllowance: number | null
  periodAllowance: number | null
  periodUsed: number
  periodRemaining: number | null
  periodStart: string
  periodEnd: string
  lifetimeUsed: number
  sessionLimit: number | null
  sessionUsed: number
  sessionRemaining: number | null
  unlimited: boolean
  reconciliationRequired: boolean
  usage: BillingCreditsUsage[]
  byAction: BillingCreditsGroup[]
}

const isSiteBillingSummary = (value: unknown): value is SiteBillingSummary =>
  isRecord(value)
  && typeof value.siteId === 'string'
  && (value.brandName === null || typeof value.brandName === 'string')
  && (value.subdomain === null || typeof value.subdomain === 'string')
  && typeof value.plan === 'string'
const isSitesResponse = (value: unknown): value is { success: true; sites: SiteBillingSummary[] } =>
  isRecord(value)
  && value.success === true
  && Array.isArray(value.sites)
  && value.sites.every(isSiteBillingSummary)
const isSavedCard = (value: unknown): value is SavedCard =>
  isRecord(value)
  && typeof value.brand === 'string'
  && typeof value.last4 === 'string'
  && typeof value.exp_month === 'number'
  && typeof value.exp_year === 'number'
const isPaymentMethodResponse = (value: unknown): value is { card: SavedCard | null } =>
  isRecord(value) && (value.card === null || isSavedCard(value.card))
const isCreditsResponse = (value: unknown): value is BillingCreditsResource =>
  isRecord(value)
  && typeof value.plan === 'string'
  && (value.planAllowance === null || typeof value.planAllowance === 'number')
  && (value.periodAllowance === null || typeof value.periodAllowance === 'number')
  && typeof value.periodUsed === 'number'
  && (value.periodRemaining === null || typeof value.periodRemaining === 'number')
  && typeof value.periodStart === 'string'
  && typeof value.periodEnd === 'string'
  && typeof value.lifetimeUsed === 'number'
  && (value.sessionLimit === null || typeof value.sessionLimit === 'number')
  && typeof value.sessionUsed === 'number'
  && (value.sessionRemaining === null || typeof value.sessionRemaining === 'number')
  && typeof value.unlimited === 'boolean'
  && typeof value.reconciliationRequired === 'boolean'
  && Array.isArray(value.usage)
  && value.usage.every(row =>
    isRecord(row)
    && typeof row.resource === 'string'
    && (row.site_id === null || typeof row.site_id === 'string')
    && (row.site_name === null || typeof row.site_name === 'string')
    && (row.action === null || typeof row.action === 'string')
    && typeof row.quantity === 'number'
    && (row.charged === null || typeof row.charged === 'boolean')
    && typeof row.created_at === 'string',
  )
  && Array.isArray(value.byAction)
  && value.byAction.every(row =>
    isRecord(row)
    && typeof row.resource === 'string'
    && (row.action === null || typeof row.action === 'string')
    && (row.charged === null || typeof row.charged === 'boolean')
    && typeof row.quantity === 'number'
    && typeof row.calls === 'number',
  )
const isBillingResponse = (value: unknown): value is ApiRecord =>
  isRecord(value)
  && value.success === true
  && isRecord(value.billing)
  && typeof value.billing.organizationId === 'string'
  && typeof value.billing.plan === 'string'
const requestEvent = useRequestEvent()
const { data: billingResource, error: billingResourceError, pending: billingResourcePending } = await useAsyncData<BillingResource>(
  computed(() => `dashboard-billing:${String(route.params.orgSlug || '')}`),
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardBillingResource } = await import('~/server/utils/dashboard-billing-resource')
      const organizationSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      if (!organizationSlug) throw createError({ statusCode: 400, statusMessage: 'Organization slug is required for billing' })
      return await loadDashboardBillingResource(requestEvent, organizationSlug)
    }
    const [billingResponse, creditsResponse, paymentMethodResponse, sitesResponse] = await Promise.all([
      dashboardApi<ApiRecord>('/api/billing/status', { validate: isBillingResponse }),
      dashboardApi<BillingCreditsResource>('/api/billing/credits', { validate: isCreditsResponse }),
      dashboardApi<{ card: SavedCard | null }>('/api/billing/payment-method', { validate: isPaymentMethodResponse }),
      dashboardApi<{ success: true; sites: SiteBillingSummary[] }>('/api/billing/sites', { validate: isSitesResponse }),
    ])
    return {
      billing: billingResponse,
      credits: creditsResponse,
      paymentMethod: paymentMethodResponse,
      sites: sitesResponse,
    }
  },
)

watchEffect(() => {
  loading.value = billingResourcePending.value
  creditsLoading.value = billingResourcePending.value
  if (billingResourceError.value) {
    errorMessage.value = billingResourceError.value.message || 'Failed to load billing'
    return
  }
  const resource = billingResource.value
  if (!resource) return
  billing.value = resource.billing.billing as ApiRecord
  credits.value = resource.credits
  savedCard.value = resource.paymentMethod.card
  sites.value = resource.sites.sites
  if (!selectedSiteId.value && sites.value.length === 1) selectedSiteId.value = sites.value[0]!.siteId
})

onMounted(async () => {
  const { success, plan, canceled, siteId, ...restQuery } = route.query

  if (typeof siteId === 'string' && sites.value.some(s => s.siteId === siteId)) {
    selectedSiteId.value = siteId
  }

  if (success === 'true') {
    trackSubscriptionCheckoutSuccess(selectedSite.value?.plan ?? undefined)
    const paymentStatus = billing.value?.paymentStatus
    toast.add({
      description: paymentStatus === 'paid'
        ? 'Payment confirmed. Your plan has been updated.'
        : 'Payment is processing. Your plan will activate after Stripe confirms the invoice.',
      color: paymentStatus === 'paid' ? 'success' : 'warning',
    })
  }
  if (canceled === 'true') {
    errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  }

  // Consolidate parameter cleanup in a single replace call
  if (success || plan || canceled || siteId) {
    router.replace({ query: restQuery })
  }

  // Auto-start checkout if plan query param exists
  if (isAuthenticated.value && plan) {
    const planId = Array.isArray(plan) ? plan[0] : String(plan)
    if (planId) await upgradeToPlan(planId)
  }
})

useSeoMeta({ title: 'Billing | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
