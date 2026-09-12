<template>
  <div class="space-y-4">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Stripe Connect is unavailable"
      :description="errorMessage"
    />

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold text-highlighted">Connect your business to Stripe</h2>
            <p class="mt-1 text-sm text-muted">Stripe verifies your business through its hosted onboarding so payment capabilities can be enabled.</p>
          </div>
          <UBadge v-if="account" :color="statusPresentation.color" variant="soft">
            {{ statusPresentation.label }}
          </UBadge>
        </div>
      </template>

      <div v-if="loading" class="space-y-3" aria-label="Loading Stripe Connect status">
        <USkeleton class="h-5 w-48" />
        <USkeleton class="h-10 w-full" />
      </div>

      <div v-else-if="!account" class="space-y-5">
        <UAlert
          color="neutral"
          variant="soft"
          icon="i-lucide-shield-check"
          title="Choose the business's registered country"
          description="This cannot be changed after the Stripe account is created. KrabiClaw does not store the identity details you enter at Stripe."
        />
        <UFormField label="Business country" description="The country where the business is legally registered.">
          <USelectMenu
            v-model="selectedCountry"
            :items="countryOptions"
            value-key="value"
            label-key="label"
            :loading="countriesLoading"
            placeholder="Select a country"
            class="w-full sm:max-w-sm"
          />
        </UFormField>
        <UButton :disabled="!selectedCountry" :loading="starting" icon="i-lucide-external-link" @click="startOnboarding">
          Continue to Stripe
        </UButton>
      </div>

      <div v-else class="space-y-5">
        <p class="text-sm text-muted">{{ statusPresentation.description }}</p>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Business country</p>
            <p class="mt-1 text-sm font-medium text-highlighted">{{ account.country }}</p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Card payments</p>
            <p class="mt-1 text-sm font-medium capitalize text-highlighted">{{ cardPaymentsLabel }}</p>
          </div>
        </div>

        <UAlert
          v-if="account.requirements.length"
          color="warning"
          variant="soft"
          icon="i-lucide-list-checks"
          title="Stripe requirements"
          :description="requirementsSummary"
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="canContinueOnboarding"
            :loading="starting"
            icon="i-lucide-external-link"
            @click="startOnboarding"
          >
            {{ account.status === 'creation_failed' ? 'Retry Stripe setup' : 'Continue Stripe onboarding' }}
          </UButton>
          <UButton v-if="account.stripeAccountId" color="neutral" variant="outline" :loading="refreshing" icon="i-lucide-refresh-cw" @click="refreshStatus">
            Refresh status
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Stripe Connect | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

type ConnectStatus = 'creating' | 'creation_failed' | 'action_required' | 'pending_review' | 'restricted' | 'ready'
type CapabilityStatus = 'active' | 'pending' | 'restricted' | 'unsupported'

interface ConnectRequirement {
  awaitingActionFrom: 'stripe' | 'user'
  deadlineStatus: 'currently_due' | 'eventually_due' | 'past_due'
  description: string
  errors: string[]
}

interface ConnectedAccount {
  id: string
  organizationId: string
  stripeAccountId: string | null
  country: string
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
    && typeof value.country === 'string'
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

const isAccountResponse = (value: unknown): value is { success: true; account: ConnectedAccount | null } =>
  isRecord(value) && value.success === true && (value.account === null || isConnectedAccount(value.account))
const isOnboardingResponse = (value: unknown): value is { success: true; account: ConnectedAccount; onboardingUrl: string } =>
  isRecord(value) && value.success === true && isConnectedAccount(value.account) && typeof value.onboardingUrl === 'string'
const isCountriesResponse = (value: unknown): value is { success: true; countries: string[] } =>
  isRecord(value)
  && value.success === true
  && Array.isArray(value.countries)
  && value.countries.every(country => typeof country === 'string')

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const account = ref<ConnectedAccount | null>(null)
const countries = ref<string[]>([])
const selectedCountry = ref<string | undefined>(undefined)
const loading = ref(true)
const countriesLoading = ref(false)
const starting = ref(false)
const refreshing = ref(false)
const errorMessage = ref<string | null>(null)

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countryOptions = computed(() => countries.value
  .map(code => ({ label: countryNames.of(code) === undefined ? code : countryNames.of(code)!, value: code }))
  .sort((left, right) => left.label.localeCompare(right.label)))
const cardPaymentsLabel = computed(() => account.value?.cardPaymentsStatus === null ? 'Not available yet' : account.value?.cardPaymentsStatus.replace('_', ' '))
const canContinueOnboarding = computed(() => account.value !== null && account.value.status !== 'ready')
const requirementsSummary = computed(() => account.value === null ? '' : account.value.requirements.map(requirement => requirement.description).join(' '))
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

async function loadCountries() {
  countriesLoading.value = true
  try {
    const response = await dashboardApi<{ success: true; countries: string[] }>('/api/dashboard/connect/countries', { validate: isCountriesResponse })
    countries.value = response.countries
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe countries could not be loaded')
  } finally {
    countriesLoading.value = false
  }
}

async function loadAccount() {
  loading.value = true
  errorMessage.value = null
  try {
    const response = await dashboardApi<{ success: true; account: ConnectedAccount | null }>('/api/dashboard/connect', { validate: isAccountResponse })
    account.value = response.account
    if (response.account === null) await loadCountries()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe Connect status could not be loaded')
  } finally {
    loading.value = false
  }
}

async function startOnboarding() {
  if (account.value === null && selectedCountry.value === undefined) return
  starting.value = true
  errorMessage.value = null
  try {
    const body = account.value === null ? { country: selectedCountry.value } : {}
    const response = await dashboardApi<{ success: true; account: ConnectedAccount; onboardingUrl: string }>('/api/dashboard/connect', {
      method: 'POST',
      body,
      validate: isOnboardingResponse,
    })
    account.value = response.account
    await navigateTo(response.onboardingUrl, { external: true })
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe onboarding could not be started')
  } finally {
    starting.value = false
  }
}

async function refreshStatus() {
  if (account.value === null || account.value.stripeAccountId === null) return
  refreshing.value = true
  errorMessage.value = null
  try {
    const response = await dashboardApi<{ success: true; account: ConnectedAccount }>('/api/dashboard/connect/status', {
      method: 'POST',
      validate: (value): value is { success: true; account: ConnectedAccount } => isRecord(value) && value.success === true && isConnectedAccount(value.account),
    })
    account.value = response.account
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Stripe Connect status could not be refreshed')
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  await loadAccount()
  if (route.query.stripe_connect === 'returned' && account.value?.stripeAccountId) {
    await refreshStatus()
    const query = { ...route.query }
    delete query.stripe_connect
    await router.replace({ query })
  }
})
</script>
