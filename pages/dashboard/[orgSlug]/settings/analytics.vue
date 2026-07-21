<template>
  <UDashboardPanel id="org-settings-analytics">
    <template #header>
      <UDashboardNavbar title="Analytics">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Google Analytics & Search Console</h2>
          </template>

          <div v-if="loading" class="space-y-3">
            <USkeleton class="h-10 rounded-lg" />
            <USkeleton class="h-10 rounded-lg" />
          </div>

          <div v-else-if="!connection" class="space-y-3">
            <p class="text-sm text-muted">Connect a Google account to pick your Analytics property and Search Console site from a list — no copy-pasting tracking IDs.</p>
            <UButton :loading="connecting" icon="i-simple-icons-google" @click="connectGoogle">
              Connect Google
            </UButton>
          </div>

          <div v-else class="space-y-5">
            <div class="flex items-center justify-between gap-3 rounded-lg border border-default bg-muted/40 p-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted truncate">{{ connection.provider_account_email }}</p>
                <p class="text-xs text-muted">Connected Google account</p>
              </div>
              <UButton
                icon="i-lucide-link-2-off"
                color="error"
                variant="ghost"
                size="xs"
                :loading="disconnecting"
                @click="disconnectGoogle"
              >
                Disconnect
              </UButton>
            </div>

            <UFormField label="Analytics property" description="Pulls the GA4 measurement ID automatically — no copy-paste needed.">
              <USelectMenu
                v-model="selectedGa4Property"
                :items="ga4PropertyOptions"
                value-key="value"
                placeholder="Select a GA4 property"
              />
              <p v-if="ga4Error" class="mt-2 text-xs text-red-500">{{ ga4Error }}</p>
              <p v-else-if="!ga4PropertyOptions.length" class="mt-2 text-xs text-muted">No GA4 properties found on this Google account.</p>
            </UFormField>

            <UFormField label="Search Console property">
              <USelectMenu
                v-model="selectedSearchConsoleSite"
                :items="searchConsoleOptions"
                value-key="value"
                placeholder="Select a Search Console property"
              />
              <p v-if="searchConsoleError" class="mt-2 text-xs text-red-500">{{ searchConsoleError }}</p>
              <p v-else-if="!searchConsoleOptions.length" class="mt-2 text-xs text-muted">
                No verified properties found. <a href="https://search.google.com/search-console" target="_blank" rel="noopener" class="underline">Verify your domain in Search Console</a> first, then reconnect.
              </p>
            </UFormField>

            <UButton :loading="saving" @click="saveSelection">Save</UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Analytics | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface ConnectionInfo {
  provider_account_email: string
  ga4_property_id: string | null
  ga4_property_name: string | null
  search_console_site_url: string | null
}

interface Ga4Property {
  accountName: string
  propertyId: string
  propertyName: string
}

interface SearchConsoleSite {
  siteUrl: string
  permissionLevel: string
}

const toast = useToast()
const dashboard = useDashboardSite()
const route = useRoute()
const router = useRouter()

const siteId = computed(() => dashboard.siteId.value)

const loading = ref(true)
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

const ga4PropertyOptions = computed(() =>
  ga4Properties.value.map((p) => ({ label: `${p.propertyName} (${p.accountName})`, value: p.propertyId }))
)
const searchConsoleOptions = computed(() =>
  searchConsoleSites.value.map((s) => ({ label: s.siteUrl, value: s.siteUrl }))
)

async function loadConnection() {
  if (!siteId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await $fetch<{
      success: boolean
      connection: ConnectionInfo | null
      ga4Properties: Ga4Property[]
      searchConsoleSites: SearchConsoleSite[]
      ga4Error: string | null
      searchConsoleError: string | null
    }>(`/api/sites/${siteId.value}/integrations/google-analytics/properties`)

    connection.value = res.connection
    ga4Properties.value = res.ga4Properties
    searchConsoleSites.value = res.searchConsoleSites
    ga4Error.value = res.ga4Error ?? null
    searchConsoleError.value = res.searchConsoleError ?? null
    selectedGa4Property.value = res.connection?.ga4_property_id ?? undefined
    selectedSearchConsoleSite.value = res.connection?.search_console_site_url ?? undefined
  } catch {
    toast.add({ description: 'Failed to load Google Analytics connection', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function connectGoogle() {
  if (!siteId.value) return
  connecting.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl: string }>(
      `/api/sites/${siteId.value}/integrations/google-analytics/auth`,
      { method: 'POST' }
    )
    if (res.success && res.authUrl) {
      const parsed = new URL(res.authUrl)
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') {
        throw new Error('Invalid OAuth redirect URL')
      }
      window.location.href = res.authUrl
    } else {
      throw new Error('Failed to start Google connection')
    }
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to start Google connection'), color: 'error' })
    connecting.value = false
  }
}

async function disconnectGoogle() {
  if (!siteId.value) return
  disconnecting.value = true
  try {
    await $fetch(`/api/sites/${siteId.value}/integrations/google-analytics/disconnect`, { method: 'POST' })
    connection.value = null
    ga4Properties.value = []
    searchConsoleSites.value = []
    selectedGa4Property.value = undefined
    selectedSearchConsoleSite.value = undefined
    toast.add({ description: 'Google account disconnected', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to disconnect', color: 'error' })
  } finally {
    disconnecting.value = false
  }
}

async function saveSelection() {
  if (!siteId.value) return
  saving.value = true
  try {
    const property = ga4Properties.value.find((p) => p.propertyId === selectedGa4Property.value)
    await $fetch(`/api/sites/${siteId.value}/integrations/google-analytics/select`, {
      method: 'POST',
      body: {
        ga4_property_id: selectedGa4Property.value,
        ga4_property_name: property?.propertyName ?? null,
        search_console_site_url: selectedSearchConsoleSite.value
      }
    })
    toast.add({ description: 'Saved', color: 'success' })
    await loadConnection()
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save selection'), color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!dashboard.state.value) await dashboard.refresh()
  await loadConnection()

  const status = route.query.ga
  if (status === 'connected') {
    toast.add({ description: 'Google account connected', color: 'success' })
    router.replace({ query: { ...route.query, ga: undefined } })
  } else if (status === 'error' || status === 'expired') {
    toast.add({ description: 'Google connection failed. Please try again.', color: 'error' })
    router.replace({ query: { ...route.query, ga: undefined } })
  }
})
</script>
