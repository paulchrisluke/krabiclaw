<template>
  <UDashboardPanel id="site-settings">
    <template #header>
      <UDashboardNavbar title="Site Settings">
        <template #leading><DashboardNavbarLeading /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4">
        <USkeleton v-for="i in 4" :key="i" class="h-48 rounded-xl" />
      </div>
      <UAlert v-else-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />
      <div v-else class="mx-auto max-w-5xl space-y-6">
        <UCard id="brand">
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Brand</h2>
              <p class="mt-1 text-sm text-muted">Identity shared across the entire site.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Brand name"><UInput v-model="form.brand_name" /></UFormField>
            <UFormField label="Contact email"><UInput v-model="form.contact_email" type="email" /></UFormField>
            <UFormField label="Logo URL"><UInput v-model="form.logo_url" type="url" /></UFormField>
            <UFormField label="Brand color"><UInput v-model="form.brand_color" placeholder="#0f766e" /></UFormField>
            <UFormField label="Brand description" class="sm:col-span-2"><UTextarea v-model="form.brand_description" :rows="4" /></UFormField>
          </div>
          <template #footer><div class="flex justify-end"><UButton icon="i-lucide-check" :loading="savingGroup === 'brand'" @click="saveSiteSettings('brand')">Save brand</UButton></div></template>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Social profiles</h2>
              <p class="mt-1 text-sm text-muted">Brand-level accounts shown in the site footer. A location's own Facebook, Instagram and TikTok links live on that location's settings instead.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-3">
            <UFormField label="Facebook"><UInput v-model="form.social_facebook_url" type="url" placeholder="https://facebook.com/..." /></UFormField>
            <UFormField label="Instagram"><UInput v-model="form.social_instagram_url" type="url" placeholder="https://instagram.com/..." /></UFormField>
            <UFormField label="TikTok"><UInput v-model="form.social_tiktok_url" type="url" placeholder="https://tiktok.com/@..." /></UFormField>
          </div>
          <template #footer><div class="flex justify-end"><UButton icon="i-lucide-check" :loading="savingGroup === 'social'" @click="saveSiteSettings('social')">Save social profiles</UButton></div></template>
        </UCard>

        <UCard>
          <NuxtLink :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/domains`" class="group flex items-center justify-between gap-4">
            <div>
              <h2 class="font-semibold text-highlighted">Domains</h2>
              <p class="mt-1 text-sm text-muted">Connect and verify the public address for this site.</p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" />
          </NuxtLink>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Business information</h2>
              <p class="mt-1 text-sm text-muted">Shared operating defaults for this site.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Default currency">
              <USelect v-model="form.default_currency" :items="CURRENCY_OPTIONS" value-key="value" label-key="label" />
            </UFormField>
          </div>
          <template #footer><div class="flex justify-end"><UButton icon="i-lucide-check" :loading="savingGroup === 'business'" @click="saveSiteSettings('business')">Save business information</UButton></div></template>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Analytics</h2>
              <p class="mt-1 text-sm text-muted">Search and analytics connections for the published site.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Canonical URL"><UInput v-model="form.canonical_url" type="url" /></UFormField>
            <UFormField label="Robots"><UInput v-model="form.robots" placeholder="index,follow" /></UFormField>
            <UFormField label="Google Analytics measurement ID"><UInput v-model="form.google_analytics_measurement_id" placeholder="G-XXXXXXXXXX" /></UFormField>
            <UFormField label="Google site verification"><UInput v-model="form.google_site_verification" /></UFormField>
          </div>
          <template #footer><div class="flex justify-end"><UButton icon="i-lucide-check" :loading="savingGroup === 'analytics'" @click="saveSiteSettings('analytics')">Save analytics</UButton></div></template>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Site Notifications</h2>
              <p class="mt-1 text-sm text-muted">Fallback delivery for every location. A location can override this in its own settings.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Alert channels">
              <USelectMenu v-model="notificationChannels" multiple :items="CHANNEL_OPTIONS" value-key="value" label-key="label" />
            </UFormField>
            <UFormField label="Site-wide WhatsApp number"><UInput v-model="whatsappPhone" type="tel" placeholder="+66..." /></UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end">
              <UButton color="neutral" variant="outline" :loading="savingNotifications" @click="saveNotifications">Save notifications</UButton>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Facebook and Instagram Publishing</h2>
                <p class="mt-1 text-sm text-muted">Connect the Page that publishes content for this site.</p>
              </div>
              <UBadge :label="facebookConnection?.connected ? 'Connected' : hasFacebookAccess ? 'Not connected' : 'Growth+'" :color="facebookConnection?.connected ? 'success' : hasFacebookAccess ? 'neutral' : 'warning'" variant="soft" />
            </div>
          </template>
          <UAlert v-if="!hasFacebookAccess" color="warning" variant="soft" icon="i-lucide-lock" title="Growth plan required" description="Upgrade this site to connect Facebook and Instagram publishing." />
          <div v-else class="space-y-4">
            <p v-if="facebookConnection?.connected" class="text-sm text-muted">Connected to {{ facebookConnection.facebook_page_name || 'Facebook Page' }}.</p>
            <p v-else class="text-sm text-muted">No Facebook Page is connected to this site.</p>
            <UButton icon="i-simple-icons-facebook" :loading="connectingFacebook" @click="startFacebookConnect">
              {{ facebookConnection?.connected ? 'Reconnect Facebook' : 'Connect Facebook' }}
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '~/shared/currencies'

const dashboardApi = useDashboardApi()

// The vertical isn't editable here (or anywhere yet — see config/cms-registry.ts and
// utils/vertical-copy.ts's SiteVertical; there's no update path for sites.vertical once a site
// is created), but it silently decides which features default on and which labels apply, so it
// needs to be visible next to the toggles that depend on it rather than left implicit.

interface SiteSettingsResponse {
  brand_name?: string | null
  brand_description?: string | null
  logo_url?: string | null
  contact_email?: string | null
  brand_color?: string | null
  default_currency?: string | null
  canonical_url?: string | null
  robots?: string | null
  google_analytics_measurement_id?: string | null
  google_site_verification?: string | null
  social_facebook_url?: string | null
  social_instagram_url?: string | null
  social_tiktok_url?: string | null
}

interface FacebookConnectionStatus {
  connected: boolean
  facebook_page_name?: string
}

const isSettingsResponse = (
  value: unknown,
): value is { success: boolean; settings: SiteSettingsResponse } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && isRecord(value.settings)
  && (value.settings.brand_name === undefined
    || value.settings.brand_name === null
    || typeof value.settings.brand_name === 'string')
  && (value.settings.default_currency === undefined
    || value.settings.default_currency === null
    || typeof value.settings.default_currency === 'string')

const isNotificationsResponse = (
  value: unknown,
): value is { success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && isRecord(value.notifications)
  && (value.notifications.whatsapp_phone === null || typeof value.notifications.whatsapp_phone === 'string')
  && Array.isArray(value.notifications.channels)
  && value.notifications.channels.every(channel => typeof channel === 'string')

const isFacebookStatus = (value: unknown): value is FacebookConnectionStatus =>
  isRecord(value)
  && typeof value.connected === 'boolean'
  && (value.facebook_page_name === undefined || typeof value.facebook_page_name === 'string')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const loading = ref(true)
const savingGroup = ref<'brand' | 'business' | 'analytics' | 'social' | null>(null)
const loadError = ref<string | null>(null)
const savingNotifications = ref(false)
const connectingFacebook = ref(false)
const notificationChannels = ref<string[]>(['email'])
const whatsappPhone = ref('')
const facebookConnection = ref<FacebookConnectionStatus | null>(null)

const form = reactive({
  brand_name: '', brand_description: '', logo_url: '', contact_email: '', brand_color: '',
  default_currency: DEFAULT_CURRENCY as CurrencyCode,
  canonical_url: '', robots: '',
  google_analytics_measurement_id: '', google_site_verification: '',
  social_facebook_url: '', social_instagram_url: '', social_tiktok_url: '',
})

const CHANNEL_OPTIONS = [{ label: 'Email', value: 'email' }, { label: 'WhatsApp', value: 'whatsapp' }]
const hasFacebookAccess = computed(() => dashboard.site.value?.plan === 'growth')

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data
    if (data?.error) return data.error
  }
  return error instanceof Error ? error.message : fallback
}

function fillForm(settings: SiteSettingsResponse) {
  form.brand_name = settings.brand_name ?? ''
  form.brand_description = settings.brand_description ?? ''
  form.logo_url = settings.logo_url ?? ''
  form.contact_email = settings.contact_email ?? ''
  form.brand_color = settings.brand_color ?? ''
  form.default_currency = isCurrencyCode(settings.default_currency) ? settings.default_currency : DEFAULT_CURRENCY
  form.canonical_url = settings.canonical_url ?? ''
  form.robots = settings.robots ?? ''
  form.google_analytics_measurement_id = settings.google_analytics_measurement_id ?? ''
  form.google_site_verification = settings.google_site_verification ?? ''
  form.social_facebook_url = settings.social_facebook_url ?? ''
  form.social_instagram_url = settings.social_instagram_url ?? ''
  form.social_tiktok_url = settings.social_tiktok_url ?? ''
}

interface SettingsPageResource {
  settings: { success: boolean; settings: SiteSettingsResponse }
  notifications: {
    success: boolean
    notifications: { whatsapp_phone: string | null; channels: string[] }
  }
  facebook: FacebookConnectionStatus
}

const requestEvent = useRequestEvent()
const settingsResourceKey = computed(() =>
  `dashboard-site-settings:${String(route.params.orgSlug)}:${String(route.params.siteSlug)}`,
)
const {
  data: settingsResource,
  pending: settingsPending,
  error: settingsResourceError,
  refresh: refreshSettingsResource,
} = await useAsyncData<SettingsPageResource>(settingsResourceKey, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardSettingsResource } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardSettingsResource(requestEvent, {
      includeFacebook: hasFacebookAccess.value,
      organizationSlug: String(route.params.orgSlug),
      siteSlug: String(route.params.siteSlug),
    })
  }
  const [settings, notifications, facebook] = await Promise.all([
    dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>(
      '/api/dashboard/settings',
      { validate: isSettingsResponse },
    ),
    dashboardApi<{
      success: boolean
      notifications: { whatsapp_phone: string | null; channels: string[] }
    }>(
      `/api/editor/sites/${siteId}/notifications`,
      { validate: isNotificationsResponse },
    ),
    hasFacebookAccess.value
      ? dashboardApi<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection', {
          query: { siteId },
          validate: isFacebookStatus,
        })
      : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
  ])
  return { settings, notifications, facebook }
}, { lazy: import.meta.client })

watch([settingsResource, settingsPending, settingsResourceError], ([resource, pending, error]) => {
  loading.value = pending
  if (error) {
    loadError.value = errorMessage(error, 'Failed to load site settings')
    return
  }
  if (!resource) return
  fillForm(resource.settings.settings)
  whatsappPhone.value = resource.notifications.notifications.whatsapp_phone ?? ''
  notificationChannels.value = resource.notifications.notifications.channels.length
    ? resource.notifications.notifications.channels
    : ['email']
  facebookConnection.value = resource.facebook
  loadError.value = null
}, { immediate: true })

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await refreshSettingsResource()
    if (settingsResourceError.value) throw settingsResourceError.value
  } catch (error) {
    loadError.value = errorMessage(error, 'Failed to load site settings')
  } finally {
    loading.value = false
  }
}

async function saveSiteSettings(group: 'brand' | 'business' | 'analytics' | 'social') {
  const requestedSiteSlug = route.params.siteSlug
  savingGroup.value = group
  const body = group === 'brand'
    ? { brand_name: form.brand_name, brand_description: form.brand_description, logo_url: form.logo_url, contact_email: form.contact_email, brand_color: form.brand_color }
    : group === 'business'
      ? { default_currency: form.default_currency }
      : group === 'social'
        ? { social_facebook_url: form.social_facebook_url || null, social_instagram_url: form.social_instagram_url || null, social_tiktok_url: form.social_tiktok_url || null }
        : { canonical_url: form.canonical_url, robots: form.robots, google_analytics_measurement_id: form.google_analytics_measurement_id, google_site_verification: form.google_site_verification }
  try {
    const response = await dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', {
      method: 'PATCH',
      body,
      validate: isSettingsResponse,
    })
    if (route.params.siteSlug !== requestedSiteSlug) return
    fillForm(response.settings)
    toast.add({ description: `${group === 'brand' ? 'Brand' : group === 'business' ? 'Business information' : group === 'social' ? 'Social profiles' : 'Analytics'} saved`, color: 'success' })
    await dashboard.refresh()
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save site settings'), color: 'error' })
  } finally {
    savingGroup.value = null
  }
}

async function saveNotifications() {
  if (!notificationChannels.value.length) {
    toast.add({ description: 'Select at least one notification channel', color: 'error' })
    return
  }
  const requestedSiteSlug = route.params.siteSlug
  savingNotifications.value = true
  try {
    const siteId = dashboard.siteId.value
    if (!siteId) throw new Error('Site not found')
    const response = await dashboardApi<{ notifications: { whatsapp_phone: string | null; channels: string[] } }>(`/api/editor/sites/${siteId}/notifications`, {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappPhone.value.trim() || null, channels: notificationChannels.value },
      validate: isNotificationsResponse,
    })
    if (route.params.siteSlug !== requestedSiteSlug) return
    whatsappPhone.value = response.notifications.whatsapp_phone ?? ''
    notificationChannels.value = response.notifications.channels
    toast.add({ description: 'Notification settings saved', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save notification settings'), color: 'error' })
  } finally {
    savingNotifications.value = false
  }
}

async function startFacebookConnect() {
  const requestedSiteSlug = route.params.siteSlug
  connectingFacebook.value = true
  try {
    const response = await dashboardApi<{ authUrl?: string; error?: string }>(
      '/api/integrations/facebook-pages/auth',
      {
        method: 'POST',
        validate: (value): value is { authUrl?: string; error?: string } =>
          isRecord(value)
          && (value.authUrl === undefined || typeof value.authUrl === 'string')
          && (value.error === undefined || typeof value.error === 'string'),
      },
    )
    if (!response.authUrl) throw new Error(response.error || 'No authorization URL returned')
    if (route.params.siteSlug !== requestedSiteSlug) {
      connectingFacebook.value = false
      return
    }
    const parsed = new URL(response.authUrl)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.facebook.com') {
      throw new Error('Invalid OAuth redirect URL')
    }
    window.location.href = parsed.toString()
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to connect Facebook'), color: 'error' })
    connectingFacebook.value = false
  }
}

onMounted(async () => {
  const fbStatus = typeof route.query.fb === 'string' ? route.query.fb : null
  if (fbStatus === 'connected') toast.add({ description: 'Facebook Page connected', color: 'success' })
  if (fbStatus) {
    const { fb: _fb, ...query } = route.query
    await router.replace({ query })
  }
})

watch(() => route.params.siteSlug, (nextSiteSlug, previousSiteSlug) => {
  if (nextSiteSlug !== previousSiteSlug) void load()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>
