<template>
  <DashboardLeafPanel
    id="integration-google-search-console"
    title="Google Search Console"
    :ready="!pending"
    :saving="saving"
    :disabled="!accountId || !selected || (selected === data?.searchConsole?.site_url && accountId === data?.searchConsole?.account_id)"
    :error="error || loadFailure"
    :footer="Boolean(data?.account_id)"
    save-label="Connect property"
    @cancel="selected = data?.searchConsole?.site_url"
    @save="select"
  >
    <div v-if="data" class="space-y-6">
      <UCard variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">{{ data.searchConsole ? 'Connected' : 'Not connected' }}</p>
            <p class="mt-1 truncate text-sm text-muted">{{ data.searchConsole?.site_url ?? 'See how this website appears in Google Search.' }}</p>
          </div>
          <UButton v-if="data.searchConsole" color="error" variant="ghost" icon="i-lucide-link-2-off" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </div>
      </UCard>

      <UFormField v-if="accountOptions.length" label="Google account">
        <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose a Google account" size="xl" class="w-full" />
      </UFormField>
      <UButton icon="i-simple-icons-google" variant="outline" :loading="linking" @click="link">{{ accountOptions.length ? 'Link another Google account' : 'Connect Google Search Console' }}</UButton>

      <UFormField v-if="data.account_id" label="Property" :error="data.error ?? undefined">
        <USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Choose a property" size="xl" class="w-full" />
        <p class="mt-2 text-sm text-muted">This website's own address can be verified for you. Any other property must already be verified in Search Console.</p>
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface SearchConsoleLeaf {
  account_id: string | null
  searchConsole: { account_id?: string; site_url: string } | null
  siteUrl: string | null
  properties: Array<{ siteUrl: string; permissionLevel: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/google-search-console`
const linked = useLinkedAccounts('google', INTEGRATION_SCOPES['google-search-console'])

const isLeaf = (value: unknown): value is SearchConsoleLeaf =>
  isRecord(value) && (value.account_id === null || typeof value.account_id === 'string') && Array.isArray(value.properties)
  && (value.searchConsole === null || isRecord(value.searchConsole))
  && (value.siteUrl === null || typeof value.siteUrl === 'string')
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

// The account is the tenant's choice, never guessed: the one this site already
// uses, or one of their own linked Google accounts they pick here.
const accountId = ref<string | undefined>()
const { data, pending, refresh, error: loadError } = await useAsyncData(
  () => `integration-google-search-console:${integrations.organizationId}:${accountId.value ?? ''}`,
  () => dashboardApi(`${api}/sites`, { query: accountId.value ? { account_id: accountId.value } : {}, validate: isLeaf }),
  { lazy: true, watch: [accountId] },
)
watch(data, value => { accountId.value ??= value?.account_id ?? undefined }, { immediate: true })

const accountOptions = computed(() => {
  const own = (linked.data.value ?? []).map(account => ({ label: account.label, value: account.id }))
  const current = data.value?.searchConsole?.account_id
  return current && !own.some(option => option.value === current)
    ? [{ label: 'Another member\'s Google account', value: current }, ...own]
    : own
})

const selected = ref<string | undefined>()
watch(data, value => { selected.value = value?.searchConsole?.site_url }, { immediate: true })
// This website's own URL is offered even before the account owns it: KrabiClaw verifies it by serving the tag.
const options = computed(() => {
  const owned = (data.value?.properties ?? []).map(property => ({ label: property.siteUrl, value: property.siteUrl }))
  const own = data.value?.siteUrl
  return own && !owned.some(option => option.value === own) ? [{ label: `${own} (verify for me)`, value: own }, ...owned] : owned
})

const loadFailure = computed(() => loadError.value ? getErrorMessage(loadError.value, 'Could not load Google Search Console.')
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
    await linked.link(route.path, { access_type: 'offline', prompt: 'consent' })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Google connection.')
    linking.value = false
  }
}

async function select() {
  if (!selected.value || !accountId.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { account_id: accountId.value, site_url: selected.value }, validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not connect that property.')
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
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Google Search Console.')
  } finally {
    disconnecting.value = false
  }
}
</script>
