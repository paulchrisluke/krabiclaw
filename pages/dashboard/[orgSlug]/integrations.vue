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
                <h2 class="font-semibold text-highlighted">Google Places</h2>
                <p class="mt-1 text-sm text-muted">Sync hours, address, rating, and up to 5 reviews from Google Maps. No API approval needed — requires a Place ID on each location.</p>
              </div>
              <UBadge :label="locationsWithPlaceId.length ? `${locationsWithPlaceId.length} ready` : 'No Place IDs set'" :color="locationsWithPlaceId.length ? 'success' : 'neutral'" variant="soft" />
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
                  {{ location.google_place_id ? `Place ID: ${location.google_place_id}` : 'No Place ID — add one in Location Settings' }}
                </p>
                <p v-if="placeSyncResults[location.id]" class="mt-1 text-xs text-success">
                  {{ placeSyncResults[location.id] }}
                </p>
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-simple-icons-googlemaps"
                :disabled="!location.google_place_id"
                :loading="syncingPlaceLocationId === location.id"
                @click="syncGooglePlace(location)"
              >
                Sync now
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
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Facebook & Instagram</h2>
                <p class="mt-1 text-sm text-muted">Sync page info and posts from your Facebook Page, and publish content to Facebook and Instagram.</p>
              </div>
              <UBadge
                :label="facebookConnectionError ? 'Error' : facebookConnection?.connected ? (facebookConnection.facebook_page_name || 'Connected') : 'Not connected'"
                :color="facebookConnectionError ? 'error' : facebookConnection?.connected ? 'success' : 'neutral'"
                variant="soft"
              />
            </div>
          </template>

          <div v-if="loading" class="space-y-3">
            <USkeleton class="h-16 rounded-lg" />
          </div>
          <div v-else-if="facebookConnectionError" class="flex items-center gap-2 text-sm text-error">
            <UIcon name="i-heroicons-exclamation-triangle" class="size-4 shrink-0" />
            Failed to load Facebook connection status. Check your connection and refresh.
          </div>
          <div v-else-if="facebookConnection?.connected" class="space-y-4">
            <div class="flex items-center justify-between rounded-lg border border-default p-4">
              <div>
                <p class="font-medium text-highlighted">{{ facebookConnection.facebook_page_name }}</p>
                <p class="text-sm text-muted">Page ID: {{ facebookConnection.facebook_page_id }}</p>
              </div>
              <div class="flex gap-2">
                <UButton size="sm" color="neutral" variant="soft" icon="i-simple-icons-facebook" :loading="connectingFacebook" @click="startFacebookConnect">
                  Reconnect
                </UButton>
              </div>
            </div>
            <p class="text-xs text-muted">
              Instagram publishing is available when your Facebook Page has a linked Instagram Business account.
            </p>
          </div>
          <div v-else class="flex flex-col gap-3">
            <p class="text-sm text-muted">Connect your Facebook Page to sync business info and publish posts directly from the dashboard.</p>
            <div>
              <UButton icon="i-simple-icons-facebook" :loading="connectingFacebook" @click="startFacebookConnect">
                Connect Facebook
              </UButton>
            </div>
          </div>
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
  google_place_id?: string | null
}

interface GoogleConnection {
  id: string
  provider_account_email: string
  status: string
}

interface FacebookConnectionStatus {
  connected: boolean
  facebook_user_id?: string
  facebook_page_id?: string
  facebook_page_name?: string
  status?: string
}

const route = useRoute()
const siteId = await useDashboardSiteId()
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const locations = ref<LocationRow[]>([])
const googleConnections = ref<Record<string, GoogleConnection | null>>({})
const whatsappPhone = ref<string | null>(null)
const facebookConnection = ref<FacebookConnectionStatus | null>(null)
const facebookConnectionError = ref(false)
const loading = ref(true)
const connectingLocationId = ref<string | null>(null)
const connectingFacebook = ref(false)
const syncingPlaceLocationId = ref<string | null>(null)
const placeSyncResults = ref<Record<string, string>>({})

const locationsWithPlaceId = computed(() => locations.value.filter(l => l.google_place_id))
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Site settings', icon: 'i-heroicons-cog-6-tooth', to: paths.value.settings, color: 'neutral' as const, variant: 'soft' as const }
]))

const connectedGoogleCount = computed(() => Object.values(googleConnections.value).filter(Boolean).length)

async function loadIntegrations() {
  loading.value = true
  try {
    const [settingsRes, locationsRes, notificationsRes, fbRes] = await Promise.all([
      $fetch<{ settings: { public_url: string | null } }>(`/api/dashboard/settings`),
      $fetch<{ locations: LocationRow[] }>(`/api/dashboard/locations`),
      $fetch<{ notifications: { whatsapp_phone: string | null } }>(`/api/dashboard/editor/notifications`),
      $fetch<FacebookConnectionStatus>(`/api/integrations/facebook-pages/connection`).catch((err) => {
        console.error('[integrations] fb_connection_load_failed', err)
        facebookConnectionError.value = true
        return null
      })
    ])
    sitePublicUrl.value = settingsRes.settings.public_url
    locations.value = locationsRes.locations ?? []
    whatsappPhone.value = notificationsRes.notifications.whatsapp_phone
    facebookConnection.value = fbRes

    const results = await Promise.allSettled(locations.value.map(async (location) => {
      const res = await $fetch<{ connection: GoogleConnection | null }>(`/api/dashboard/locations/${location.id}/integrations/google-business`)
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
      `/api/dashboard/locations/${location.id}/integrations/google-business/auth`,
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

async function syncGooglePlace(location: LocationRow) {
  syncingPlaceLocationId.value = location.id
  try {
    const res = await $fetch<{ success: boolean; reviewsUpserted: number; place: { rating: number | null; ratingCount: number | null } }>(
      '/api/integrations/google-places/sync',
      { method: 'POST', body: { locationId: location.id } }
    )
    const parts = [`Synced hours, address, rating`]
    if (res.reviewsUpserted > 0) parts.push(`${res.reviewsUpserted} new review${res.reviewsUpserted > 1 ? 's' : ''}`)
    if (res.place.rating) parts.push(`${res.place.rating}★ (${res.place.ratingCount?.toLocaleString()} reviews)`)
    placeSyncResults.value[location.id] = parts.join(' · ')
    toast.add({ title: 'Synced', description: parts.join(' · '), color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Sync failed', color: 'error' })
  } finally {
    syncingPlaceLocationId.value = null
  }
}

async function startFacebookConnect() {
  connectingFacebook.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl?: string; error?: string }>(
      '/api/integrations/facebook-pages/auth',
      { method: 'POST', body: {} }
    )
    if (!res.authUrl) throw new Error(res.error || 'No authorization URL returned')
    window.location.href = res.authUrl
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to start Facebook connection', color: 'error' })
    connectingFacebook.value = false
  }
}

onMounted(() => {
  loadIntegrations()
  const fbStatus = route.query.fb as string | undefined
  if (fbStatus === 'connected') {
    toast.add({ title: 'Facebook connected', description: 'Your Facebook Page has been linked successfully.', color: 'success' })
  } else if (fbStatus === 'error') {
    toast.add({ title: 'Facebook connection failed', description: 'Something went wrong. Please try again.', color: 'error' })
  } else if (fbStatus === 'denied') {
    toast.add({ title: 'Facebook access denied', description: 'You declined the Facebook authorization.', color: 'warning' })
  } else if (fbStatus === 'no_pages') {
    toast.add({ title: 'No Facebook Pages found', description: 'Your account has no Pages. Create a Facebook Page for your business and try again.', color: 'warning' })
  }
})
useSeoMeta({ title: 'Integrations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
