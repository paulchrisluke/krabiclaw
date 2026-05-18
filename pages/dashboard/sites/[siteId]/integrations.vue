<template>
  <UPage>
    <UPageHeader title="Integrations" description="Connect external channels that keep the site fresh.">
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div class="grid gap-4 xl:grid-cols-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Google Business Profile</h2>
                <p class="mt-1 text-sm text-muted">Sync location data, reviews, photos, and posts when API access is enabled.</p>
              </div>
              <UBadge :label="connectedGoogleCount ? `${connectedGoogleCount} connected` : 'Not connected'" :color="connectedGoogleCount ? 'success' : 'neutral'" variant="soft" />
            </div>
          </template>

          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
          </div>
          <div v-else class="divide-y divide-default rounded-lg border border-default">
            <div v-for="location in locations" :key="location.id" class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-medium text-highlighted">{{ location.title }}</p>
                <p class="text-sm text-muted">
                  {{ googleConnections[location.id]?.provider_account_email || 'No Google account connected' }}
                </p>
              </div>
              <UButton
                size="sm"
                :color="googleConnections[location.id] ? 'neutral' : 'primary'"
                :variant="googleConnections[location.id] ? 'soft' : 'solid'"
                icon="i-simple-icons-google"
                :loading="connectingLocationId === location.id"
                @click="startGoogleConnect(location)"
              >
                {{ googleConnections[location.id] ? 'Manage' : 'Connect' }}
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">WhatsApp Notifications</h2>
                <p class="mt-1 text-sm text-muted">Receive alerts for reviews, reservations, contact messages, and ChowBot actions.</p>
              </div>
              <UBadge :label="whatsappPhone ? 'Configured' : 'Not configured'" :color="whatsappPhone ? 'success' : 'neutral'" variant="soft" />
            </div>
          </template>

          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium text-highlighted">{{ whatsappPhone || 'No WhatsApp number saved' }}</p>
              <p class="mt-1 text-sm text-muted">Notification settings live with site settings.</p>
            </div>
            <UButton :to="paths.settings" icon="i-heroicons-cog-6-tooth" color="neutral" variant="soft">Open settings</UButton>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Social Publishing</h2>
          </template>
          <p class="text-sm text-muted">Instagram and Facebook channel adapters are represented by post channel jobs. OAuth and publish adapters can plug in here when those integrations are ready.</p>
          <UButton class="mt-4" :to="paths.posts" icon="i-heroicons-newspaper" color="neutral" variant="soft">Open posts</UButton>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface LocationRow {
  id: string
  title: string
}

interface GoogleConnection {
  id: string
  provider_account_email: string
  status: string
}

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const locations = ref<LocationRow[]>([])
const googleConnections = ref<Record<string, GoogleConnection | null>>({})
const whatsappPhone = ref<string | null>(null)
const loading = ref(true)
const connectingLocationId = ref<string | null>(null)
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Site settings', icon: 'i-heroicons-cog-6-tooth', to: paths.value.settings, color: 'neutral' as const, variant: 'soft' as const }
]))

const connectedGoogleCount = computed(() => Object.values(googleConnections.value).filter(Boolean).length)

async function loadIntegrations() {
  loading.value = true
  try {
    const [settingsRes, locationsRes, notificationsRes] = await Promise.all([
      $fetch<{ settings: { public_url: string | null } }>(`/api/sites/${siteId}/settings`),
      $fetch<{ locations: LocationRow[] }>(`/api/sites/${siteId}/locations`),
      $fetch<{ notifications: { whatsapp_phone: string | null } }>(`/api/editor/sites/${siteId}/notifications`)
    ])
    sitePublicUrl.value = settingsRes.settings.public_url
    locations.value = locationsRes.locations ?? []
    whatsappPhone.value = notificationsRes.notifications.whatsapp_phone

    const results = await Promise.allSettled(locations.value.map(async (location) => {
      const res = await $fetch<{ connection: GoogleConnection | null }>(`/api/sites/${siteId}/locations/${location.id}/integrations/google-business`)
      return [location.id, res.connection] as const
    }))
    const entries = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value]
      console.warn('google_connection_load_failed', { locationId: locations.value[index]?.id, error: result.reason })
      return []
    })
    googleConnections.value = Object.fromEntries(entries)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load integrations', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function startGoogleConnect(location: LocationRow) {
  connectingLocationId.value = location.id
  try {
    const res = await $fetch<{ success: boolean; authUrl?: string; error?: string }>(
      `/api/sites/${siteId}/locations/${location.id}/integrations/google-business/auth`,
      { method: 'POST' }
    )
    if (!res.authUrl) throw new Error(res.error || 'No authorization URL returned')
    window.location.href = res.authUrl
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to start Google Business connection', color: 'error' })
  } finally {
    connectingLocationId.value = null
  }
}

onMounted(loadIntegrations)
useSeoMeta({ title: 'Integrations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
