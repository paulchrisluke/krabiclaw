<template>
  <DashboardLeafPanel
    id="integration-google-search-console"
    title="Google Search Console"
    :ready="!pending"
    :saving="saving"
    :disabled="!selected || selected === data?.searchConsole?.site_url"
    :error="error || (loadError ? getErrorMessage(loadError, 'Could not load Google Search Console.') : '')"
    :footer="Boolean(data?.authorized)"
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
            <p v-if="data.account" class="mt-1 truncate text-xs text-dimmed">Google account: {{ data.account }}</p>
          </div>
          <UButton v-if="data.searchConsole" color="error" variant="ghost" icon="i-lucide-link-2-off" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </div>
      </UCard>

      <UButton v-if="!data.authorized" icon="i-simple-icons-google" :loading="connecting" @click="connect">Connect Google Search Console</UButton>
      <UFormField v-else label="Property" :error="data.error ?? undefined">
        <USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Choose a property" size="xl" class="w-full" />
        <p class="mt-2 text-sm text-muted">This website's own address can be verified for you. Any other property must already be verified in Search Console.</p>
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface SearchConsoleLeaf {
  account: string | null
  authorized: boolean
  searchConsole: { site_url: string } | null
  siteUrl: string | null
  properties: Array<{ siteUrl: string; permissionLevel: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/google-search-console`

const isLeaf = (value: unknown): value is SearchConsoleLeaf =>
  isRecord(value) && typeof value.authorized === 'boolean' && Array.isArray(value.properties)
  && (value.searchConsole === null || isRecord(value.searchConsole))
  && (value.siteUrl === null || typeof value.siteUrl === 'string')
const isAuthUrl = (value: unknown): value is { authUrl: string } => isRecord(value) && typeof value.authUrl === 'string'
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const { data, pending, refresh, error: loadError } = await useAsyncData(`integration-google-search-console:${integrations.organizationId}`,
  () => dashboardApi(`${api}/sites`, { validate: isLeaf }), { lazy: true })

const selected = ref<string | undefined>()
watch(data, value => { selected.value = value?.searchConsole?.site_url }, { immediate: true })
// This website's own URL is offered even before the account owns it: KrabiClaw verifies it by serving the tag.
const options = computed(() => {
  const owned = (data.value?.properties ?? []).map(property => ({ label: property.siteUrl, value: property.siteUrl }))
  const own = data.value?.siteUrl
  return own && !owned.some(option => option.value === own) ? [{ label: `${own} (verify for me)`, value: own }, ...owned] : owned
})

const error = ref(route.query.google === 'error' || route.query.google === 'expired' ? 'Google did not finish connecting. Try again.' : '')
const saving = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)

async function connect() {
  connecting.value = true
  error.value = ''
  try {
    const { authUrl } = await dashboardApi(`${api}/auth`, { method: 'POST', validate: isAuthUrl })
    await navigateTo(authUrl, { external: true })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Google connection.')
    connecting.value = false
  }
}

async function select() {
  if (!selected.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { site_url: selected.value }, validate: isSuccess })
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
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Google Search Console.')
  } finally {
    disconnecting.value = false
  }
}
</script>
