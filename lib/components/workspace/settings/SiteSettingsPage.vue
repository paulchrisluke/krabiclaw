<template>
  <UDashboardPanel
    :id="surface === 'brand' ? 'site-brand' : 'site-settings'"
    :ui="{ body: 'min-h-0 !gap-0 !overflow-hidden !p-0 sm:!p-0' }"
  >
    <template #header>
      <UDashboardNavbar :title="navbarTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading
            :action-icon="navbarActionIcon"
            :action-label="navbarActionLabel"
            @action="navigateFromNavbar"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4 p-5 sm:p-8">
        <USkeleton v-for="i in 4" :key="i" class="h-32 rounded-xl" />
      </div>
      <div v-else-if="loadError" class="p-5 sm:p-8">
        <UAlert color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />
      </div>
      <EditorPaneShell
        v-else
        :has-detail="hasDetail"
        :show-actions="showActions"
        :saving="saving"
        :save-disabled="saveDisabled"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="activeNavigationId" />
        </template>

        <template #detail>
          <div v-if="detailKey === 'search-index'" class="space-y-3">
            <p class="mb-8 text-base text-muted">Manage how the published site is discovered and measured.</p>
            <EditorNavigationList :groups="[{ id: 'search', items: searchItems }]" :active-item="activeNavigationId" />
          </div>

          <div v-else-if="detailKey === 'name'" class="space-y-6">
            <p class="mb-2 text-sm font-semibold text-muted">{{ nameCharactersRemaining }}/50 available</p>
            <UInput v-model="form.brand_name" size="xl" maxlength="50" autofocus class="w-full" />
          </div>

          <div v-else-if="detailKey === 'logo'" class="space-y-6">
            <p class="text-base text-muted">Choose an image from the site media library or upload a new logo.</p>
            <MediaPicker v-model="form.logoAssetId" :site-id="siteId" accept="image" title="Select logo" />
          </div>

          <div v-else-if="detailKey === 'description'" class="space-y-6">
            <p class="text-base text-muted">A concise description shared across the site and its public metadata.</p>
            <div>
              <p class="mb-2 text-sm font-semibold text-muted">{{ descriptionCharactersRemaining }}/500 available</p>
              <UTextarea v-model="form.brand_description" :rows="10" maxlength="500" autofocus class="w-full" />
            </div>
          </div>

          <div v-else-if="detailKey === 'color'" class="space-y-8">
            <p class="text-base text-muted">Select the primary color used by the site theme.</p>
            <UColorPicker v-model="form.brand_color" format="hex" size="xl" class="w-full" />
            <UFormField label="Hex color">
              <UInput v-model="form.brand_color" maxlength="7" placeholder="#0f766e" size="xl" class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="detailKey === 'contact'" class="space-y-6">
            <p class="text-base text-muted">This is the shared public contact address for the site.</p>
            <UFormField label="Contact email">
              <UInput v-model="form.contact_email" type="email" autocomplete="email" size="xl" autofocus class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="detailKey === 'social'" class="space-y-6">
            <p class="text-base text-muted">Add the brand-level profiles shown across the public site.</p>
            <UFormField label="Facebook"><UInput v-model="form.social_facebook_url" type="url" placeholder="https://facebook.com/..." size="xl" class="w-full" /></UFormField>
            <UFormField label="Instagram"><UInput v-model="form.social_instagram_url" type="url" placeholder="https://instagram.com/..." size="xl" class="w-full" /></UFormField>
            <UFormField label="TikTok"><UInput v-model="form.social_tiktok_url" type="url" placeholder="https://tiktok.com/@..." size="xl" class="w-full" /></UFormField>
          </div>

          <div v-else-if="detailKey === 'currency'" class="space-y-6">
            <p class="text-base text-muted">The default currency used for site-wide prices and reporting.</p>
            <USelect v-model="form.default_currency" :items="CURRENCY_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" />
          </div>

          <div v-else-if="detailKey === 'localization'" class="space-y-6">
            <p class="text-base text-muted">
              English is the permanent source language. {{ localizationSettings?.billing_enabled ? 'Each secondary language is billed on this site’s Growth subscription.' : 'Growth includes one secondary language at no extra cost.' }}
            </p>
            <div v-if="localizationLoading" class="space-y-3">
              <USkeleton class="h-16 rounded-lg" />
              <USkeleton class="h-16 rounded-lg" />
            </div>
            <UAlert v-else-if="localizationError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="localizationError" />
            <template v-else-if="localizationSettings">
              <div class="space-y-3">
                <div v-for="language in localizationSettings.languages" :key="language.locale" class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
                  <div>
                    <p class="font-medium">{{ language.label || language.locale }} <span class="text-sm text-muted">({{ language.locale }})</span></p>
                    <UBadge :color="language.is_source || language.license_status === 'active' ? 'success' : 'neutral'" variant="subtle" size="sm" class="mt-1">
                      {{ language.is_source ? 'Source · published' : `${language.license_status || 'disabled'} · ${language.locale_status}` }}
                    </UBadge>
                  </div>
                  <div v-if="!language.is_source" class="flex gap-2">
                    <UButton v-if="language.license_status === 'active'" color="neutral" variant="outline" :loading="localizationBusy" @click="disableLanguage(language.locale)">Disable</UButton>
                    <UButton v-if="language.license_status === 'disabled'" color="error" variant="outline" :loading="localizationBusy" @click="deleteLanguage(language.locale)">Delete content</UButton>
                  </div>
                </div>
              </div>
              <p v-if="!enableableCatalogOptions.length" class="text-sm text-muted">No additional languages are available to enable right now.</p>
              <UFormField v-else label="Available language">
                <USelect v-model="newLocale" :items="enableableCatalogOptions" :placeholder="localizationSettings.billing_enabled ? `Select a language to enable for ${formattedLanguagePrice}` : 'Select a language to enable'" size="xl" class="w-full" />
              </UFormField>
            </template>
          </div>

          <div v-else-if="detailKey === 'notifications'" class="space-y-8">
            <p class="text-base text-muted">Choose the default channels used when a location has no notification override.</p>
            <UFormField label="Alert channels">
              <USelectMenu v-model="notificationChannels" multiple :items="CHANNEL_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" />
            </UFormField>
            <UFormField v-if="notificationChannels.includes('whatsapp')" label="Site-wide WhatsApp number">
              <UInput v-model="whatsappPhone" type="tel" placeholder="+66..." size="xl" class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="detailKey === 'analytics'" class="space-y-6">
            <p class="text-base text-muted">Connect this site to a Google Analytics property.</p>
            <UFormField label="Measurement ID" hint="Format: G-XXXXXXXXXX">
              <UInput v-model="form.google_analytics_measurement_id" placeholder="G-XXXXXXXXXX" size="xl" autofocus class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="detailKey === 'verification'" class="space-y-6">
            <p class="text-base text-muted">Enter the verification token supplied by Google Search Console.</p>
            <UFormField label="Google site verification token">
              <UInput v-model="form.google_site_verification" size="xl" autofocus class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="detailKey === 'visibility'" class="space-y-8">
            <p class="text-base text-muted">Control whether search engines may index the published site.</p>
            <UCard variant="subtle">
              <USwitch v-model="searchIndexed" label="Visible to search engines" description="Allow the site to appear in search results." size="xl" />
            </UCard>
          </div>

          <div v-else-if="detailKey === 'publishing'" class="space-y-6">
            <p class="text-base text-muted">Connect the Facebook Page used to publish content for this site.</p>
            <UAlert v-if="!hasFacebookAccess" color="warning" variant="soft" icon="i-lucide-lock" title="Growth plan required" description="Upgrade this site to connect Facebook and Instagram publishing." />
            <UCard v-else variant="subtle">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="font-semibold text-highlighted">{{ facebookConnection?.connected ? 'Connected' : 'Not connected' }}</p>
                  <p v-if="facebookConnection?.facebook_page_name" class="mt-1 text-sm text-muted">{{ facebookConnection.facebook_page_name }}</p>
                </div>
                <UButton icon="i-simple-icons-facebook" :loading="connectingFacebook" @click="startFacebookConnect">{{ facebookConnection?.connected ? 'Reconnect' : 'Connect' }}</UButton>
              </div>
            </UCard>
          </div>

          <UAlert v-if="validationMessage" class="mt-6" color="error" variant="soft" :description="validationMessage" />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '~/shared/currencies'

const props = withDefaults(defineProps<{ surface?: 'brand' | 'settings' }>(), { surface: 'settings' })
const surface = computed(() => props.surface)
const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()

interface SiteSettingsResponse {
  brand_name?: string | null
  brand_description?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url?: string | null }>
  contact_email?: string | null
  brand_color?: string | null
  default_currency?: string | null
  robots?: string | null
  google_analytics_measurement_id?: string | null
  google_site_verification?: string | null
  social_facebook_url?: string | null
  social_instagram_url?: string | null
  social_tiktok_url?: string | null
}

interface FacebookConnectionStatus { connected: boolean; facebook_page_name?: string }
interface LocalizationLanguageRow { locale: string; label: string | null; is_source: number | boolean; locale_status: string; license_status: string | null }
interface LocalizationCatalogRow { locale: string; label: string; direction: string }
interface LocalizationSettings { effective_plan: string; billing_enabled: boolean; interval: 'month' | 'year' | null; unit_amount_cents: number | null; languages: LocalizationLanguageRow[]; available_catalogs: LocalizationCatalogRow[] }
interface SettingsPageResource {
  settings: { success: boolean; settings: SiteSettingsResponse }
  notifications: { success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }
  facebook: FacebookConnectionStatus
}
interface EditorNavigationItem { id: string; label: string; summary: string; icon: string; to: string }

const isSettingsResponse = (value: unknown): value is { success: boolean; settings: SiteSettingsResponse } =>
  isRecord(value) && typeof value.success === 'boolean' && isRecord(value.settings)
  && (value.settings.brand_name === undefined || value.settings.brand_name === null || typeof value.settings.brand_name === 'string')
  && (value.settings.default_currency === undefined || value.settings.default_currency === null || typeof value.settings.default_currency === 'string')
const isNotificationsResponse = (value: unknown): value is { success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } } =>
  isRecord(value) && typeof value.success === 'boolean' && isRecord(value.notifications)
  && (value.notifications.whatsapp_phone === null || typeof value.notifications.whatsapp_phone === 'string')
  && Array.isArray(value.notifications.channels) && value.notifications.channels.every(channel => typeof channel === 'string')
const isFacebookStatus = (value: unknown): value is FacebookConnectionStatus =>
  isRecord(value) && typeof value.connected === 'boolean' && (value.facebook_page_name === undefined || typeof value.facebook_page_name === 'string')

const siteDashboardPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const brandPath = computed(() => `${siteDashboardPath.value}/brand`)
const settingsPath = computed(() => `${siteDashboardPath.value}/settings`)
const routeSegments = computed(() => {
  const raw = route.params.segments
  if (Array.isArray(raw)) return raw.map(String)
  return raw ? [String(raw)] : []
})
const firstSegment = computed(() => routeSegments.value[0] ?? null)
const secondSegment = computed(() => routeSegments.value[1] ?? null)
const detailKey = computed(() => surface.value === 'brand' ? firstSegment.value : firstSegment.value === 'search' ? secondSegment.value ?? 'search-index' : firstSegment.value)
const validBrandKeys = new Set(['name', 'logo', 'description', 'color', 'contact', 'social'])
const validSettingsKeys = new Set(['currency', 'notifications', 'search', 'publishing', 'localization'])
const validSearchKeys = new Set(['analytics', 'verification', 'visibility'])
const routeIsCanonical = computed(() => {
  const segments = routeSegments.value
  if (surface.value === 'brand') return segments.length <= 1 && (!segments[0] || validBrandKeys.has(segments[0]))
  if (segments.length === 0) return true
  if (segments.length === 1) return validSettingsKeys.has(segments[0]!)
  return segments.length === 2 && segments[0] === 'search' && validSearchKeys.has(segments[1]!)
})
watchEffect(() => {
  if (!routeIsCanonical.value) throw createError({ statusCode: 404, statusMessage: 'Setting not found' })
})

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const connectingFacebook = ref(false)
const notificationChannels = ref<string[]>([])
const whatsappPhone = ref('')
const searchIndexed = ref(true)
const facebookConnection = ref<FacebookConnectionStatus | null>(null)
const localizationSettings = ref<LocalizationSettings | null>(null)
const localizationLoading = ref(false)
const localizationBusy = ref(false)
const localizationError = ref<string | null>(null)
const newLocale = ref('')
const loadedSettings = ref<SiteSettingsResponse | null>(null)
const loadedNotifications = ref<{ whatsapp_phone: string | null; channels: string[] } | null>(null)
const originalSignature = ref('')
const form = reactive({
  brand_name: '', brand_description: '', logoAssetId: null as string | null, contact_email: '', brand_color: '',
  default_currency: DEFAULT_CURRENCY as CurrencyCode, google_analytics_measurement_id: '', google_site_verification: '',
  social_facebook_url: '', social_instagram_url: '', social_tiktok_url: '',
})
const CHANNEL_OPTIONS = [{ label: 'Email', value: 'email' }, { label: 'WhatsApp', value: 'whatsapp' }]
const hasFacebookAccess = computed(() => dashboard.site.value?.plan === 'growth')
const enableableCatalogOptions = computed(() => (localizationSettings.value?.available_catalogs ?? [])
  .filter(catalog => !localizationSettings.value?.languages.some(language => language.locale === catalog.locale && language.license_status !== 'disabled'))
  .map(catalog => ({ label: `${catalog.label} (${catalog.locale})`, value: catalog.locale })))
const formattedLanguagePrice = computed(() => localizationSettings.value?.unit_amount_cents == null ? '$5/month or $60/year' : `$${(localizationSettings.value.unit_amount_cents / 100).toFixed(0)}/${localizationSettings.value.interval}`)
const nameCharactersRemaining = computed(() => 50 - form.brand_name.length)
const descriptionCharactersRemaining = computed(() => 500 - form.brand_description.length)

function explicitSummary(value: string | null | undefined, empty = 'Not set') { return value?.trim() || empty }
const notificationSummary = computed(() => {
  const channels = loadedNotifications.value?.channels ?? []
  return channels.length ? channels.map(channel => channel === 'whatsapp' ? 'WhatsApp' : 'Email').join(' and ') : 'Not configured'
})
const socialSummary = computed(() => {
  const count = [loadedSettings.value?.social_facebook_url, loadedSettings.value?.social_instagram_url, loadedSettings.value?.social_tiktok_url].filter(Boolean).length
  return count ? `${count} ${count === 1 ? 'profile' : 'profiles'} connected` : 'Not configured'
})
const searchSummary = computed(() => loadedSettings.value?.robots === 'noindex,nofollow' ? 'Hidden from search engines' : 'Visible to search engines')
const domainSummary = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || 'Not connected')
const brandItems = computed<EditorNavigationItem[]>(() => [
  { id: 'name', label: 'Brand name', summary: explicitSummary(loadedSettings.value?.brand_name), icon: 'i-lucide-type', to: `${brandPath.value}/name` },
  { id: 'logo', label: 'Logo', summary: loadedSettings.value?.media?.some(item => item.slot === 'logo') ? 'Logo selected' : 'Not set', icon: 'i-lucide-image', to: `${brandPath.value}/logo` },
  { id: 'description', label: 'Description', summary: explicitSummary(loadedSettings.value?.brand_description), icon: 'i-lucide-align-left', to: `${brandPath.value}/description` },
  { id: 'color', label: 'Brand color', summary: explicitSummary(loadedSettings.value?.brand_color), icon: 'i-lucide-palette', to: `${brandPath.value}/color` },
  { id: 'contact', label: 'Contact details', summary: explicitSummary(loadedSettings.value?.contact_email), icon: 'i-lucide-mail', to: `${brandPath.value}/contact` },
  { id: 'social', label: 'Social profiles', summary: socialSummary.value, icon: 'i-lucide-share-2', to: `${brandPath.value}/social` },
])
const settingsItems = computed<EditorNavigationItem[]>(() => [
  { id: 'domains', label: 'Domain', summary: domainSummary.value, icon: 'i-lucide-globe-2', to: `${siteDashboardPath.value}/domains` },
  { id: 'localization', label: 'Localization', summary: 'Languages and localized content', icon: 'i-lucide-languages', to: `${settingsPath.value}/localization` },
  { id: 'currency', label: 'Currency', summary: explicitSummary(loadedSettings.value?.default_currency), icon: 'i-lucide-coins', to: `${settingsPath.value}/currency` },
  { id: 'notifications', label: 'Notifications', summary: notificationSummary.value, icon: 'i-lucide-bell', to: `${settingsPath.value}/notifications` },
  { id: 'search', label: 'Search and analytics', summary: searchSummary.value, icon: 'i-lucide-chart-no-axes-combined', to: `${settingsPath.value}/search` },
  { id: 'publishing', label: 'Facebook publishing', summary: facebookConnection.value?.connected ? explicitSummary(facebookConnection.value.facebook_page_name, 'Connected') : 'Not connected', icon: 'i-simple-icons-facebook', to: `${settingsPath.value}/publishing` },
])
const searchItems = computed<EditorNavigationItem[]>(() => [
  { id: 'analytics', label: 'Google Analytics', summary: explicitSummary(loadedSettings.value?.google_analytics_measurement_id, 'Not connected'), icon: 'i-lucide-chart-no-axes-combined', to: `${settingsPath.value}/search/analytics` },
  { id: 'verification', label: 'Search verification', summary: loadedSettings.value?.google_site_verification ? 'Configured' : 'Not configured', icon: 'i-lucide-badge-check', to: `${settingsPath.value}/search/verification` },
  { id: 'visibility', label: 'Search visibility', summary: searchSummary.value, icon: 'i-lucide-scan-search', to: `${settingsPath.value}/search/visibility` },
])
const navigationGroups = computed(() => {
  if (surface.value === 'brand') return [{ id: 'brand', items: brandItems.value }]
  if (firstSegment.value === 'search' && secondSegment.value) return [{ id: 'search', items: searchItems.value }]
  return [
    { id: 'site', label: 'Site', items: settingsItems.value.slice(0, 3) },
    { id: 'connections', label: 'Connections', items: settingsItems.value.slice(3) },
  ]
})
const activeNavigationId = computed(() => surface.value === 'brand' ? detailKey.value : firstSegment.value === 'search' && secondSegment.value ? detailKey.value : firstSegment.value)
const hasDetail = computed(() => detailKey.value !== null)
const detailTitles: Record<string, string> = { 'search-index': 'Search and analytics', name: 'Brand name', logo: 'Logo', description: 'Description', color: 'Brand color', contact: 'Contact details', social: 'Social profiles', currency: 'Currency', notifications: 'Notifications', analytics: 'Google Analytics', verification: 'Search verification', visibility: 'Search visibility', publishing: 'Facebook publishing', localization: 'Localization' }
const detailTitle = computed(() => detailKey.value ? detailTitles[detailKey.value] : undefined)
const navbarTitle = computed(() => detailTitle.value ?? (surface.value === 'brand' ? 'Brand' : 'Site Settings'))
const navbarActionIcon = computed(() => hasDetail.value && !secondSegment.value ? 'i-lucide-x' : 'i-lucide-arrow-left')
const navbarActionLabel = computed(() => hasDetail.value && !secondSegment.value ? 'Close editor' : 'Go back')
const showActions = computed(() => Boolean(detailKey.value && !['search-index', 'publishing'].includes(detailKey.value)))

function navigateFromNavbar() {
  if (hasDetail.value) {
    cancelEditor()
    return
  }
  router.push(siteDashboardPath.value)
}

function editorSignature(key: string | null) {
  switch (key) {
    case 'name': return JSON.stringify(form.brand_name)
    case 'logo': return JSON.stringify(form.logoAssetId)
    case 'description': return JSON.stringify(form.brand_description)
    case 'color': return JSON.stringify(form.brand_color)
    case 'contact': return JSON.stringify(form.contact_email)
    case 'social': return JSON.stringify([form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url])
    case 'currency': return JSON.stringify(form.default_currency)
    case 'notifications': return JSON.stringify([notificationChannels.value, whatsappPhone.value])
    case 'analytics': return JSON.stringify(form.google_analytics_measurement_id)
    case 'verification': return JSON.stringify(form.google_site_verification)
    case 'visibility': return JSON.stringify(searchIndexed.value)
    case 'localization': return JSON.stringify(newLocale.value)
    default: return ''
  }
}
function isValidUrl(value: string) {
  if (!value.trim()) return true
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false }
}
const dirty = computed(() => editorSignature(detailKey.value) !== originalSignature.value)
const validationMessage = computed(() => {
  if (!dirty.value) return null
  switch (detailKey.value) {
    case 'name': return form.brand_name.trim() ? null : 'Enter a brand name.'
    case 'color': return !form.brand_color.trim() || /^#[0-9a-f]{6}$/i.test(form.brand_color) ? null : 'Enter a six-digit hex color.'
    case 'contact': return !form.contact_email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email) ? null : 'Enter a valid email address.'
    case 'social': return [form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url].every(isValidUrl) ? null : 'Enter complete http or https profile URLs.'
    case 'notifications': return !notificationChannels.value.length ? 'Select at least one notification channel.' : notificationChannels.value.includes('whatsapp') && !whatsappPhone.value.trim() ? 'Enter the WhatsApp number used for notifications.' : null
    case 'analytics': return !form.google_analytics_measurement_id.trim() || /^G-[A-Z0-9]+$/i.test(form.google_analytics_measurement_id.trim()) ? null : 'Enter a valid Google Analytics measurement ID.'
    case 'localization': return localizationSettings.value?.effective_plan !== 'growth' ? 'A Growth subscription is required.' : null
    default: return null
  }
})
const saveDisabled = computed(() => !dirty.value || validationMessage.value !== null)

function fillForm(settings: SiteSettingsResponse) {
  loadedSettings.value = settings
  form.brand_name = settings.brand_name ?? ''
  form.brand_description = settings.brand_description ?? ''
  form.logoAssetId = settings.media?.find(item => item.slot === 'logo')?.asset_id ?? null
  form.contact_email = settings.contact_email ?? ''
  form.brand_color = settings.brand_color ?? ''
  form.default_currency = isCurrencyCode(settings.default_currency) ? settings.default_currency : DEFAULT_CURRENCY
  form.google_analytics_measurement_id = settings.google_analytics_measurement_id ?? ''
  form.google_site_verification = settings.google_site_verification ?? ''
  form.social_facebook_url = settings.social_facebook_url ?? ''
  form.social_instagram_url = settings.social_instagram_url ?? ''
  form.social_tiktok_url = settings.social_tiktok_url ?? ''
  searchIndexed.value = settings.robots !== 'noindex,nofollow'
}
function fillNotifications(notifications: { whatsapp_phone: string | null; channels: string[] }) {
  loadedNotifications.value = notifications
  notificationChannels.value = [...notifications.channels]
  whatsappPhone.value = notifications.whatsapp_phone ?? ''
}
function resetDraft() {
  if (loadedSettings.value) fillForm(loadedSettings.value)
  if (loadedNotifications.value) fillNotifications(loadedNotifications.value)
  newLocale.value = ''
  originalSignature.value = editorSignature(detailKey.value)
}
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) { const data = (error as { data?: { error?: string } }).data; if (data?.error) return data.error }
  return error instanceof Error ? error.message : fallback
}

const requestEvent = useRequestEvent()
const settingsResourceKey = computed(() => `dashboard-site-settings:${String(route.params.orgSlug)}:${String(route.params.siteSlug)}`)
const { data: settingsResource, pending: settingsPending, error: settingsResourceError } = await useAsyncData<SettingsPageResource>(settingsResourceKey, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardSettingsResource } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardSettingsResource(requestEvent, { includeFacebook: hasFacebookAccess.value, organizationSlug: String(route.params.orgSlug), siteSlug: String(route.params.siteSlug) })
  }
  const [settings, notifications, facebook] = await Promise.all([
    dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', { validate: isSettingsResponse }),
    dashboardApi<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>(`/api/editor/sites/${siteId}/notifications`, { validate: isNotificationsResponse }),
    hasFacebookAccess.value ? dashboardApi<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection', { query: { siteId }, validate: isFacebookStatus }) : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
  ])
  return { settings, notifications, facebook }
}, { lazy: import.meta.client })
watch([settingsResource, settingsPending, settingsResourceError], ([resource, pending, error]) => {
  loading.value = pending
  if (error) { loadError.value = errorMessage(error, 'Failed to load site settings'); return }
  if (!resource) return
  fillForm(resource.settings.settings)
  fillNotifications(resource.notifications.notifications)
  facebookConnection.value = resource.facebook
  originalSignature.value = editorSignature(detailKey.value)
  loadError.value = null
}, { immediate: true })
watch(detailKey, () => resetDraft())

function cancelEditor() {
  resetDraft()
  const destination = surface.value === 'brand' ? brandPath.value : firstSegment.value === 'search' && secondSegment.value ? `${settingsPath.value}/search` : settingsPath.value
  router.push(destination)
}
async function patchSettings(body: Record<string, unknown>, successMessage: string) {
  const response = await dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', { method: 'PATCH', body, validate: isSettingsResponse })
  fillForm(response.settings)
  originalSignature.value = editorSignature(detailKey.value)
  toast.add({ description: successMessage, color: 'success' })
  await dashboard.refresh()
}
async function saveCurrentEditor() {
  if (saveDisabled.value || !detailKey.value) return
  saving.value = true
  try {
    switch (detailKey.value) {
      case 'name': await patchSettings({ brand_name: form.brand_name.trim() }, 'Brand name saved'); break
      case 'logo': await patchSettings({ media: form.logoAssetId ? [{ asset_id: form.logoAssetId, slot: 'logo' }] : [] }, 'Logo saved'); break
      case 'description': await patchSettings({ brand_description: form.brand_description }, 'Description saved'); break
      case 'color': await patchSettings({ brand_color: form.brand_color }, 'Brand color saved'); break
      case 'contact': await patchSettings({ contact_email: form.contact_email.trim() }, 'Contact details saved'); break
      case 'social': await patchSettings({ social_facebook_url: form.social_facebook_url.trim() || null, social_instagram_url: form.social_instagram_url.trim() || null, social_tiktok_url: form.social_tiktok_url.trim() || null }, 'Social profiles saved'); break
      case 'currency': await patchSettings({ default_currency: form.default_currency }, 'Currency saved'); break
      case 'analytics': await patchSettings({ google_analytics_measurement_id: form.google_analytics_measurement_id.trim() }, 'Google Analytics saved'); break
      case 'verification': await patchSettings({ google_site_verification: form.google_site_verification.trim() }, 'Search verification saved'); break
      case 'visibility': await patchSettings({ robots: searchIndexed.value ? 'index,follow' : 'noindex,nofollow' }, 'Search visibility saved'); break
      case 'notifications': {
        const response = await dashboardApi<{ notifications: { whatsapp_phone: string | null; channels: string[] } }>(`/api/editor/sites/${siteId}/notifications`, { method: 'PATCH', body: { whatsapp_phone: whatsappPhone.value.trim() || null, channels: notificationChannels.value }, validate: isNotificationsResponse })
        fillNotifications(response.notifications)
        originalSignature.value = editorSignature(detailKey.value)
        toast.add({ description: 'Notifications saved', color: 'success' })
        break
      }
      case 'localization': {
        const success = await enableLanguage()
        if (success) originalSignature.value = editorSignature(detailKey.value)
        break
      }
    }
  } catch (error) { toast.add({ description: errorMessage(error, 'Failed to save this setting'), color: 'error' }) } finally { saving.value = false }
}
async function startFacebookConnect() {
  connectingFacebook.value = true
  try {
    const response = await dashboardApi<{ authUrl?: string; error?: string }>('/api/integrations/facebook-pages/auth', { method: 'POST', validate: (value): value is { authUrl?: string; error?: string } => isRecord(value) && (value.authUrl === undefined || typeof value.authUrl === 'string') && (value.error === undefined || typeof value.error === 'string') })
    if (!response.authUrl) throw new Error(response.error || 'No authorization URL returned')
    await navigateTo(response.authUrl, { external: true })
  } catch (error) { toast.add({ description: errorMessage(error, 'Failed to connect Facebook'), color: 'error' }); connectingFacebook.value = false }
}
const isLocalizationSettings = (value: unknown): value is LocalizationSettings =>
  isRecord(value) && Array.isArray(value.languages) && Array.isArray(value.available_catalogs)
async function loadLocalizationSettings() {
  localizationLoading.value = true
  try {
    localizationSettings.value = await dashboardApi<LocalizationSettings>(`/api/editor/sites/${siteId}/locales`, { validate: isLocalizationSettings })
    localizationError.value = null
  } catch (error) { localizationError.value = errorMessage(error, 'Failed to load localization settings') }
  finally { localizationLoading.value = false }
}
async function mutateLocalization(path: string, method: 'POST' | 'DELETE') {
  localizationBusy.value = true
  try {
    await dashboardApi(path, { method, validate: (value): value is Record<string, unknown> => isRecord(value) })
    await loadLocalizationSettings()
    return true
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Localization request failed'), color: 'error' })
    return false
  } finally {
    localizationBusy.value = false
  }
}
async function enableLanguage(): Promise<boolean> {
  if (newLocale.value) {
    const success = await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(newLocale.value)}/enable`, 'POST')
    if (success) newLocale.value = ''
    return success
  }
  return false
}
async function disableLanguage(locale: string) { await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/disable`, 'POST') }
async function deleteLanguage(locale: string) { if (window.confirm(`Permanently delete all ${locale} content for this site?`)) await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, 'DELETE') }
watch(detailKey, key => { if (key === 'localization' && !localizationSettings.value) loadLocalizationSettings() }, { immediate: true })
</script>
