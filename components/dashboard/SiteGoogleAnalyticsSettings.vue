<template>
  <div class="space-y-5">
    <UAlert v-if="pageError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="pageError" />

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-10 rounded-lg" />
      <USkeleton class="h-10 rounded-lg" />
    </div>

    <div v-else-if="!connection" class="space-y-3">
      <p class="text-sm text-muted">Connect a Google account to pick the Analytics property and Search Console site from a list.</p>
      <UButton :loading="connecting" icon="i-simple-icons-google" @click="connectGoogle">Connect Google</UButton>
    </div>

    <div v-else class="space-y-5">
      <div class="flex items-center justify-between gap-3 rounded-lg border border-default bg-muted/40 p-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">{{ connection.provider_account_email }}</p>
          <p class="text-xs text-muted">Connected Google account</p>
        </div>
        <UButton icon="i-lucide-link-2-off" color="error" variant="ghost" size="xs" :loading="disconnecting" @click="disconnectGoogle">Disconnect</UButton>
      </div>

      <UFormField label="Analytics property">
        <USelectMenu v-model="selectedGa4Property" :items="ga4PropertyOptions" value-key="value" placeholder="Select a GA4 property" class="w-full" />
        <p v-if="ga4Error" class="mt-2 text-xs text-error">{{ ga4Error }}</p>
        <p v-else-if="!ga4PropertyOptions.length" class="mt-2 text-xs text-muted">No GA4 properties found on this Google account.</p>
      </UFormField>

      <UFormField label="Search Console property">
        <USelectMenu v-model="selectedSearchConsoleSite" :items="searchConsoleOptions" value-key="value" placeholder="Select a Search Console property" class="w-full" />
        <p v-if="searchConsoleError" class="mt-2 text-xs text-error">{{ searchConsoleError }}</p>
        <p v-else-if="!searchConsoleOptions.length" class="mt-2 text-xs text-muted">
          No verified properties found. <a href="https://search.google.com/search-console" target="_blank" rel="noopener" class="underline">Verify your domain in Search Console</a> first, then reconnect.
        </p>
      </UFormField>

      <UButton :loading="saving" @click="saveSelection">Save</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
// The site's Google connection: one OAuth grant, then the GA4 property and
// Search Console site are picked from lists. The measurement id the public
// site loads comes from the chosen property; nothing is typed by hand.
const props = defineProps<{ organizationId: string }>()
const emit = defineEmits<{ /** The connection changed on the server; the list beside this leaf reads it too. */ changed: [] }>()

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()

interface ConnectionInfo {
  provider_account_email: string
  ga4_property_id: string | null
  ga4_property_name: string | null
  search_console_site_url: string | null
}
interface Ga4Property { accountName: string; propertyId: string; propertyName: string }
interface SearchConsoleSite { siteUrl: string; permissionLevel: string }
interface PropertiesResponse {
  success: boolean
  connection: ConnectionInfo | null
  ga4Properties: Ga4Property[]
  searchConsoleSites: SearchConsoleSite[]
  ga4Error: string | null
  searchConsoleError: string | null
}

const isPropertiesResponse = (value: unknown): value is PropertiesResponse =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && (value.connection === null || isRecord(value.connection))
  && Array.isArray(value.ga4Properties)
  && value.ga4Properties.every(property => isRecord(property) && typeof property.propertyId === 'string' && typeof property.propertyName === 'string')
  && Array.isArray(value.searchConsoleSites)
  && value.searchConsoleSites.every(site => isRecord(site) && typeof site.siteUrl === 'string')
  && (value.ga4Error === null || typeof value.ga4Error === 'string')
  && (value.searchConsoleError === null || typeof value.searchConsoleError === 'string')
const isAuthUrlResponse = (value: unknown): value is { success: boolean; authUrl: string } =>
  isRecord(value) && typeof value.success === 'boolean' && typeof value.authUrl === 'string'
const isSuccessResponse = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const pageError = ref<string | null>(null)
const loading = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)
const saving = ref(false)
const connection = ref<ConnectionInfo | null>(null)
const ga4Properties = ref<Ga4Property[]>([])
const searchConsoleSites = ref<SearchConsoleSite[]>([])
const selectedGa4Property = ref<string | undefined>(undefined)
const selectedSearchConsoleSite = ref<string | undefined>(undefined)
const ga4Error = ref<string | null>(null)
const searchConsoleError = ref<string | null>(null)

const ga4PropertyOptions = computed(() => ga4Properties.value.map(p => ({ label: `${p.propertyName} (${p.accountName})`, value: p.propertyId })))
const searchConsoleOptions = computed(() => searchConsoleSites.value.map(s => ({ label: s.siteUrl, value: s.siteUrl })))

async function loadConnection() {
  loading.value = true
  pageError.value = null
  try {
    const res = await dashboardApi<PropertiesResponse>(`/api/sites/${props.organizationId}/integrations/google-analytics/properties`, { validate: isPropertiesResponse })
    connection.value = res.connection
    ga4Properties.value = res.ga4Properties
    searchConsoleSites.value = res.searchConsoleSites
    ga4Error.value = res.ga4Error
    searchConsoleError.value = res.searchConsoleError
    selectedGa4Property.value = res.connection?.ga4_property_id ?? undefined
    selectedSearchConsoleSite.value = res.connection?.search_console_site_url ?? undefined
  } catch {
    pageError.value = 'Failed to load the Google connection'
  } finally {
    loading.value = false
  }
}

async function connectGoogle() {
  connecting.value = true
  pageError.value = null
  try {
    const res = await dashboardApi<{ success: boolean; authUrl: string }>(`/api/sites/${props.organizationId}/integrations/google-analytics/auth`, { method: 'POST', validate: isAuthUrlResponse })
    const parsed = new URL(res.authUrl)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') throw new Error('Invalid OAuth redirect URL')
    window.location.href = res.authUrl
  } catch (err) {
    pageError.value = getErrorMessage(err, 'Failed to start the Google connection')
    connecting.value = false
  }
}

async function disconnectGoogle() {
  disconnecting.value = true
  pageError.value = null
  try {
    await dashboardApi(`/api/sites/${props.organizationId}/integrations/google-analytics/disconnect`, { method: 'POST', validate: isSuccessResponse })
    await loadConnection()
    emit('changed')
  } catch {
    pageError.value = 'Failed to disconnect'
  } finally {
    disconnecting.value = false
  }
}

async function saveSelection() {
  saving.value = true
  pageError.value = null
  try {
    const property = ga4Properties.value.find(p => p.propertyId === selectedGa4Property.value)
    await dashboardApi(`/api/sites/${props.organizationId}/integrations/google-analytics/select`, {
      method: 'POST',
      body: { ga4_property_id: selectedGa4Property.value, ga4_property_name: property?.propertyName ?? null, search_console_site_url: selectedSearchConsoleSite.value },
      validate: isSuccessResponse,
    })
    await loadConnection()
    emit('changed')
  } catch (err) {
    pageError.value = getErrorMessage(err, 'Failed to save the selection')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  // The OAuth callback lands here with `?ga=` saying how it went.
  const status = route.query.ga
  if (status === 'error' || status === 'expired') pageError.value = 'The Google connection failed. Please try again.'
  if (status) void router.replace({ query: { ...route.query, ga: undefined } })
  void loadConnection()
})
</script>
