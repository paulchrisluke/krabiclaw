<template>
  <DashboardLeafPanel
    id="integration-google-analytics"
    title="Google Analytics"
    :ready="!pending"
    :saving="saving"
    :disabled="!selected || selected === data?.analytics?.property_id"
    :error="error || (loadError ? getErrorMessage(loadError, 'Could not load Google Analytics.') : '')"
    :footer="Boolean(data?.authorized)"
    @cancel="selected = data?.analytics?.property_id"
    @save="select"
  >
    <div v-if="data" class="space-y-6">
      <UCard variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">{{ data.analytics ? 'Connected' : 'Not connected' }}</p>
            <p class="mt-1 truncate text-sm text-muted">{{ data.analytics ? `${data.analytics.property_name ?? 'Property'} · ${data.analytics.measurement_id}` : 'Choose the GA4 property this website reports to.' }}</p>
            <p v-if="data.account" class="mt-1 truncate text-xs text-dimmed">Google account: {{ data.account }}</p>
          </div>
          <UButton v-if="data.analytics" color="error" variant="ghost" icon="i-lucide-link-2-off" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </div>
      </UCard>

      <UButton v-if="!data.authorized" icon="i-simple-icons-google" :loading="connecting" @click="connect">Connect Google Analytics</UButton>
      <UFormField v-else label="Analytics property" :error="data.error ?? undefined">
        <USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Choose a GA4 property" size="xl" class="w-full" />
        <p v-if="!data.error && !options.length" class="mt-2 text-sm text-muted">This Google account has no GA4 properties.</p>
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface AnalyticsLeaf {
  account: string | null
  authorized: boolean
  analytics: { property_id?: string; property_name?: string; measurement_id: string } | null
  properties: Array<{ accountName: string; propertyId: string; propertyName: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/google-analytics`

const isLeaf = (value: unknown): value is AnalyticsLeaf =>
  isRecord(value) && typeof value.authorized === 'boolean' && Array.isArray(value.properties)
  && (value.analytics === null || isRecord(value.analytics))
const isAuthUrl = (value: unknown): value is { authUrl: string } => isRecord(value) && typeof value.authUrl === 'string'
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const { data, pending, refresh, error: loadError } = await useAsyncData(`integration-google-analytics:${integrations.organizationId}`,
  () => dashboardApi(`${api}/properties`, { validate: isLeaf }), { lazy: true })

const selected = ref<string | undefined>()
watch(data, value => { selected.value = value?.analytics?.property_id }, { immediate: true })
const options = computed(() => (data.value?.properties ?? []).map(property => ({ label: `${property.propertyName} (${property.accountName})`, value: property.propertyId })))

// The OAuth callback lands here saying how it went.
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
  const property = data.value?.properties.find(candidate => candidate.propertyId === selected.value)
  if (!property) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { property_id: property.propertyId, property_name: property.propertyName }, validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
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
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Google Analytics.')
  } finally {
    disconnecting.value = false
  }
}
</script>
