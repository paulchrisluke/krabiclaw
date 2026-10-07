<template>
  <!-- Airbnb's Payouts tab: How you get paid, the bank rows with Edit, Add payout method, and a Need help card. -->
  <div class="space-y-8">
    <UAlert
      v-if="failure"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Stripe Connect is unavailable"
      :description="failure"
    />

    <section>
      <h2 class="text-2xl font-semibold text-highlighted">How you get paid</h2>
      <p class="mt-2 text-base text-muted">Your money goes to the bank account on file with Stripe. To change it, use Edit next to the account.</p>

      <UButton v-if="!account && !connectError" class="mt-6" size="xl" :loading="starting" label="Add payout method" @click="startOnboarding" />

      <template v-else-if="account">
        <div v-if="payout" class="mt-6 flex items-center gap-4 py-4">
          <UIcon name="i-lucide-landmark" class="size-8 shrink-0 text-highlighted" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-base font-medium text-highlighted">Bank account <UBadge color="neutral" variant="subtle" size="sm" label="DEFAULT" /></p>
            <p class="mt-0.5 text-sm text-muted">{{ payout.bankName ?? 'Bank account' }}, ••••{{ payout.last4 }} ({{ payout.currency }})</p>
          </div>
          <UButton label="Edit" color="neutral" variant="outline" :loading="openingDashboard" @click="openDashboard" />
        </div>

        <UAlert
          v-if="account.requirements.length"
          class="mt-6"
          color="warning"
          variant="soft"
          icon="i-lucide-list-checks"
          title="Stripe needs more information"
          :description="statusPresentation.description"
        />
        <p v-else-if="account.status !== 'ready'" class="mt-6 text-base text-muted">{{ statusPresentation.description }}</p>

        <UButton
          v-if="canContinueOnboarding"
          class="mt-6"
          size="xl"
          :loading="starting"
          :label="account.status === 'creation_failed' ? 'Retry Stripe setup' : 'Continue Stripe setup'"
          @click="startOnboarding"
        />
        <UButton v-else-if="!payout" class="mt-6" size="xl" label="Add payout method" :loading="openingDashboard" @click="openDashboard" />
      </template>
    </section>

    <p v-if="payout" class="text-sm text-muted">{{ scheduleLabel }}.</p>
    <PaymentsHelp />
  </div>
</template>

<script setup lang="ts">
import PaymentsHelp from '~/components/dashboard/PaymentsHelp.vue'

type ConnectStatus = 'creating' | 'creation_failed' | 'action_required' | 'pending_review' | 'restricted' | 'ready'
type CapabilityStatus = 'active' | 'pending' | 'restricted' | 'unsupported'

interface ConnectRequirement {
  awaitingActionFrom: 'stripe' | 'user'
  deadlineStatus: 'currently_due' | 'eventually_due' | 'past_due'
  description: string
  errors: string[]
}

interface PayoutMethod { bankName: string | null; last4: string; currency: string; schedule: { interval: string; delayDays: number } }
interface ConnectedAccount {
  id: string
  organizationId: string
  stripeAccountId: string | null
  country: string | null
  livemode: boolean
  status: ConnectStatus
  cardPaymentsStatus: CapabilityStatus | null
  requirements: ConnectRequirement[]
  stripeRefreshedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

const CONNECT_STATUSES = new Set<ConnectStatus>(['creating', 'creation_failed', 'action_required', 'pending_review', 'restricted', 'ready'])
const CAPABILITY_STATUSES = new Set<CapabilityStatus>(['active', 'pending', 'restricted', 'unsupported'])

function isRequirement(value: unknown): value is ConnectRequirement {
  return isRecord(value)
    && (value.awaitingActionFrom === 'stripe' || value.awaitingActionFrom === 'user')
    && (value.deadlineStatus === 'currently_due' || value.deadlineStatus === 'eventually_due' || value.deadlineStatus === 'past_due')
    && typeof value.description === 'string'
    && Array.isArray(value.errors)
    && value.errors.every(error => typeof error === 'string')
}

function isConnectedAccount(value: unknown): value is ConnectedAccount {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.organizationId === 'string'
    && (value.stripeAccountId === null || typeof value.stripeAccountId === 'string')
    && (value.country === null || typeof value.country === 'string')
    && typeof value.livemode === 'boolean'
    && typeof value.status === 'string'
    && CONNECT_STATUSES.has(value.status as ConnectStatus)
    && (value.cardPaymentsStatus === null || (typeof value.cardPaymentsStatus === 'string' && CAPABILITY_STATUSES.has(value.cardPaymentsStatus as CapabilityStatus)))
    && Array.isArray(value.requirements)
    && value.requirements.every(isRequirement)
    && (value.stripeRefreshedAt === null || typeof value.stripeRefreshedAt === 'string')
    && (value.lastError === null || typeof value.lastError === 'string')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
}

const isPayoutMethod = (value: unknown): value is PayoutMethod | null => value === null || (isRecord(value) && (value.bankName === null || typeof value.bankName === 'string') && typeof value.last4 === 'string' && typeof value.currency === 'string' && isRecord(value.schedule) && typeof value.schedule.interval === 'string' && Number.isSafeInteger(value.schedule.delayDays))
const isAccountResponse = (value: unknown): value is { success: true; account: ConnectedAccount | null; payout: PayoutMethod | null } =>
  isRecord(value) && value.success === true && (value.account === null || isConnectedAccount(value.account)) && isPayoutMethod(value.payout)
const isOnboardingResponse = (value: unknown): value is { success: true; account: ConnectedAccount; onboardingUrl: string } =>
  isRecord(value) && value.success === true && isConnectedAccount(value.account) && typeof value.onboardingUrl === 'string'

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const { data: connect, error: connectError } = await useAsyncData(
  `dashboard-connect:${String(route.params.orgSlug)}`,
  () => dashboardApi<{ success: true; account: ConnectedAccount | null; payout: PayoutMethod | null }>('/api/dashboard/connect', { validate: isAccountResponse }),
)
const account = computed(() => connect.value?.account ?? null)
const payout = computed(() => connect.value?.payout ?? null)
/** Keeps the payout row and replaces the account Stripe just reported. */
function setAccount(next: ConnectedAccount) {
  connect.value = { success: true, account: next, payout: payout.value }
}
const scheduleLabel = computed(() => {
  const schedule = payout.value?.schedule
  if (!schedule) return ''
  return schedule.interval === 'daily' ? 'Available funds sent daily' : schedule.interval === 'weekly' ? 'Available funds sent weekly' : schedule.interval === 'monthly' ? 'Available funds sent monthly' : 'Available funds sent when you ask'
})
const starting = ref(false)
const openingDashboard = ref(false)
const errorMessage = ref<string | null>(null)
const failure = computed(() => (connectError.value ? getErrorMessage(connectError.value, 'Stripe Connect status could not be loaded') : errorMessage.value))

const canContinueOnboarding = computed(() => account.value !== null && account.value.status !== 'ready')
const statusPresentation = computed<{ label: string; description: string; color: 'success' | 'warning' | 'error' | 'neutral' }>(() => {
  switch (account.value?.status) {
    case 'ready': return { label: 'Ready', description: 'Stripe has enabled card payments for this business.', color: 'success' }
    case 'action_required': return { label: 'Action required', description: 'Stripe needs more information from the business before card payments can be enabled.', color: 'warning' }
    case 'restricted': return { label: 'Restricted', description: 'Stripe has restricted card payments. Open Stripe onboarding to review the required action.', color: 'error' }
    case 'pending_review': return { label: 'Pending review', description: 'Stripe is reviewing the submitted business information.', color: 'neutral' }
    case 'creation_failed': return { label: 'Setup failed', description: 'Stripe account setup did not finish. Retry to continue.', color: 'error' }
    case 'creating': return { label: 'Setup started', description: 'The Stripe account is being created.', color: 'neutral' }
    default: return { label: 'Not started', description: 'Stripe onboarding has not started.', color: 'neutral' }
  }
})

async function openDashboard() {
  openingDashboard.value = true
  try {
    const result = await dashboardApi<{url:string}>('/api/dashboard/connect/dashboard',{method:'POST',validate:(value):value is {url:string}=>isRecord(value)&&typeof value.url==='string'})
    await navigateTo(result.url,{external:true})
  } catch(error) {errorMessage.value=getErrorMessage(error,'Stripe Dashboard could not be opened')}
  finally {openingDashboard.value=false}
}

async function startOnboarding() {
  starting.value = true
  errorMessage.value = null
  try {
    const response = await dashboardApi<{ success: true; account: ConnectedAccount; onboardingUrl: string }>('/api/dashboard/connect', {
      method: 'POST',
      validate: isOnboardingResponse,
    })
    setAccount(response.account)
    await navigateTo(response.onboardingUrl, { external: true })
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe onboarding could not be started')
  } finally {
    starting.value = false
  }
}

async function refreshStatus() {
  if (account.value === null || account.value.stripeAccountId === null) return
  errorMessage.value = null
  try {
    const response = await dashboardApi<{ success: true; account: ConnectedAccount }>('/api/dashboard/connect/status', {
      method: 'POST',
      validate: (value): value is { success: true; account: ConnectedAccount } => isRecord(value) && value.success === true && isConnectedAccount(value.account),
    })
    setAccount(response.account)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe Connect status could not be refreshed')
  }
}

onMounted(async () => {
  // Stripe's own state is asked for whenever setup is still open, not on a button: the status is read, not managed.
  if (account.value?.stripeAccountId && (route.query.stripe_connect === 'returned' || account.value.status !== 'ready')) {
    await refreshStatus()
    if (route.query.stripe_connect === 'returned') {
      const query = { ...route.query }
      delete query.stripe_connect
      await router.replace({ query })
    }
  }
})
</script>
