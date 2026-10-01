<template>
  <DashboardLeafPanel
    id="integration-google-analytics"
    icon="i-logos-google-analytics"
    title="Google Analytics"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!accountId || !selected || (selected === data?.analytics?.property_id && accountId === data?.analytics?.account_id)"
    :error="error || integrations.failure.value || loadFailure"
    :footer="choosing && Boolean(data?.account_id)"
    @cancel="keep"
    @save="select"
  >
    <IntegrationConnection
      v-model:changing="changing"
      logo="i-logos-google-analytics"
      noun="property"
      :connection="analytics && { name: analytics.property_name ?? analytics.measurement_id, connectedAt: analytics.connected_at, status: analytics.status }"
      :disconnecting="disconnecting"
      @disconnect="disconnect"
      @keep="keep"
    >
      <template v-if="data">
        <UFormField v-if="accountOptions.length" label="Google account">
          <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose a Google account" class="w-full" />
        </UFormField>
        <UButton v-if="accountOptions.length" icon="i-lucide-plus" color="neutral" variant="link" class="px-0" :loading="linking" @click="link">Link another Google account</UButton>
        <UButton v-else icon="i-simple-icons-google" size="xl" block :loading="linking" @click="link">Connect Google Analytics</UButton>

        <UFormField v-if="data.account_id" label="Analytics property" :error="data.error ?? undefined">
          <USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Choose a GA4 property" class="w-full" />
          <p v-if="!data.error && !options.length" class="mt-2 text-sm text-muted">This Google account has no GA4 properties.</p>
        </UFormField>
      </template>
      <USkeleton v-else-if="pending" class="h-14 rounded-xl" />
    </IntegrationConnection>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import IntegrationConnection from '~/components/dashboard/IntegrationConnection.vue'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface AnalyticsLeaf {
  account_id: string | null
  analytics: { account_id?: string; property_id?: string; property_name?: string; measurement_id: string } | null
  properties: Array<{ accountName: string; propertyId: string; propertyName: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/google-analytics`
const linked = useLinkedAccounts('google', INTEGRATION_SCOPES['google-analytics'])
const analytics = computed(() => integrations.summary.value?.google_analytics ?? null)

const isLeaf = (value: unknown): value is AnalyticsLeaf =>
  isRecord(value) && (value.account_id === null || typeof value.account_id === 'string') && Array.isArray(value.properties)
  && (value.analytics === null || isRecord(value.analytics))
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

// The account is the tenant's choice, never guessed: the one this site already
// uses, or one of their own linked Google accounts they pick here.
const accountId = ref<string | undefined>()
const { data, pending, refresh, error: loadError } = await useAsyncData(
  () => `integration-google-analytics:${integrations.organizationId}:${accountId.value ?? ''}`,
  () => dashboardApi(`${api}/properties`, { query: accountId.value ? { account_id: accountId.value } : {}, validate: isLeaf }),
  { lazy: true, watch: [accountId] },
)
watch(data, value => { accountId.value ??= value?.account_id ?? undefined }, { immediate: true })

const accountOptions = computed(() => {
  const own = (linked.data.value ?? []).map(account => ({ label: account.label, value: account.id }))
  const current = data.value?.analytics?.account_id
  return current && !own.some(option => option.value === current)
    ? [{ label: 'Another member\'s Google account', value: current }, ...own]
    : own
})

const selected = ref<string | undefined>()
watch(data, value => { selected.value = value?.analytics?.property_id }, { immediate: true })

// Linking another account while changing comes back with the picker still open.
const changing = ref(route.query.change === '1')
const choosing = computed(() => !analytics.value || changing.value)
function keep() {
  changing.value = false
  accountId.value = data.value?.analytics?.account_id
  selected.value = data.value?.analytics?.property_id
}
const options = computed(() => (data.value?.properties ?? []).map(property => ({ label: `${property.propertyName} (${property.accountName})`, value: property.propertyId })))

const loadFailure = computed(() => loadError.value ? getErrorMessage(loadError.value, 'Could not load Google Analytics.')
  : linked.error.value ? getErrorMessage(linked.error.value, 'Could not load your linked Google accounts.') : '')
// Better Auth returns here with `?error=` when linking did not finish.
const error = ref(typeof route.query.error === 'string' ? `Google did not finish connecting (${route.query.error}). Try again.` : '')
const saving = ref(false)
const linking = ref(false)
const disconnecting = ref(false)

async function link() {
  linking.value = true
  error.value = ''
  try {
    // Offline access with consent is what makes Google issue the refresh
    // token Better Auth keeps the connection alive with.
    await linked.link(changing.value ? `${route.path}?change=1` : route.path, { access_type: 'offline', prompt: 'consent' })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Google connection.')
    linking.value = false
  }
}

async function select() {
  const property = data.value?.properties.find(candidate => candidate.propertyId === selected.value)
  if (!property || !accountId.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { account_id: accountId.value, property_id: property.propertyId, property_name: property.propertyName }, validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
    changing.value = false
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not choose that property.')
  } finally {
    saving.value = false
  }
}

async function disconnect() {
  disconnecting.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/disconnect`, { method: 'POST', validate: isSuccess })
    accountId.value = undefined
    await Promise.all([refresh(), integrations.refresh()])
    changing.value = false
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Google Analytics.')
  } finally {
    disconnecting.value = false
  }
}
</script>
