<template>
  <!--
    Brand is what a guest sees; Website is what a guest never sees. Each is a
    flat list of settings, and each setting is a leaf below this level.
  -->
  <DashboardIndexPanel :id="surface === 'brand' ? 'site-brand' : 'site-settings'" :title="navbarTitle" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
    <div v-if="loading" class="space-y-4">
      <USkeleton v-for="i in 4" :key="i" class="h-32 rounded-xl" />
    </div>
    <UAlert v-else-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />
    <EditorNavigationList v-else :groups="navigationGroups" :active-item="detailKey" @act="onRowAction" />
  </DashboardIndexPanel>

  <!-- Translating the brand is a row on the Brand list; this is the sheet it opens. -->
  <DashboardResourceLocalization
    v-if="surface === 'brand'"
    v-model:open="localizeOpen"
    row-trigger
    :site-id="siteId"
    resource-type="site"
    :resource-id="siteId"
    resource-label="brand"
    :fields="brandLocalizationFields"
    :language-settings-path="`${settingsPath}/localization`"
  />
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Reactive, Ref } from 'vue'
import type { CurrencyCode } from '~/shared/currencies'
import type { SiteFontPreset } from '~/shared/site-fonts'

export interface SiteSettingsForm {
  brand_name: string
  brand_description: string
  logoAssetId: string | null
  socialShareAssetId: string | null
  contact_email: string
  brand_color: string
  font_preset: SiteFontPreset
  default_currency: CurrencyCode | null
  google_site_verification: string
  social_facebook_url: string
  social_instagram_url: string
  social_tiktok_url: string
}

export interface SiteSettingsResponse {
  theme?: string
  brand_name?: string | null
  brand_description?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url?: string | null }>
  contact_email?: string | null
  brand_color?: string | null
  font_preset?: SiteFontPreset
  default_currency?: string | null
  robots?: string | null
  google_analytics_measurement_id?: string | null
  google_site_verification?: string | null
  social_facebook_url?: string | null
  social_instagram_url?: string | null
  social_tiktok_url?: string | null
}

export interface LocalizationLanguageRow { locale: string; label: string | null; is_source: number | boolean; status: string }

export interface LocalizationCatalogRow { locale: string; label: string; direction: string }

export interface LocalizationSettings { effective_plan: string; languages: LocalizationLanguageRow[]; available_catalogs: LocalizationCatalogRow[] }

export interface LocalizationProgress { locale: string; completed: number; total: number; opportunities: Array<{ id: string; label: string; completed: number; total: number; path: string }> }

export interface FacebookConnectionStatus { connected: boolean; facebook_page_name?: string }

/**
 * The site's settings draft and everything a leaf shows or does beside its
 * one field. Brand and Website mount the same provider; a leaf reads what it
 * needs and commits through `save`, which writes only the open setting.
 */
export interface SiteSettingsEditor {
  form: Reactive<SiteSettingsForm>
  siteId: string
  siteDashboardPath: ComputedRef<string>
  loading: Ref<boolean>
  saving: Ref<boolean>
  saveDisabled: ComputedRef<boolean>
  editorError: Ref<string | null>
  validationMessage: ComputedRef<string | null>
  nameCharactersRemaining: ComputedRef<number>
  descriptionCharactersRemaining: ComputedRef<number>
  supportsSiteFonts: ComputedRef<boolean>
  whatsappPhone: Ref<string>
  searchIndexed: Ref<boolean>
  hasFacebookAccess: ComputedRef<boolean>
  facebookConnection: Ref<FacebookConnectionStatus | null>
  facebookError: Ref<string>
  connectingFacebook: Ref<boolean>
  startFacebookConnect: () => Promise<void>
  refreshSettings: () => Promise<void>
  localizationSettings: Ref<LocalizationSettings | null>
  localizationLoading: Ref<boolean>
  localizationBusy: Ref<boolean>
  localizationError: Ref<string | null>
  localizationProgress: Ref<LocalizationProgress[]>
  localizationProgressError: Ref<string | null>
  enableableCatalogOptions: ComputedRef<Array<{ label: string; value: string }>>
  newLocale: Ref<string>
  publishLanguage: (locale: string) => Promise<void>
  disableLanguage: (locale: string) => Promise<void>
  deleteLanguage: (locale: string) => Promise<void>
  deletionScheduledAt: ComputedRef<Date | null>
  deletionDateLabel: ComputedRef<string>
  deletionGraceDays: Ref<number>
  deletionConfirmText: Ref<string>
  deletionSaving: Ref<boolean>
  deletionError: Ref<string>
  scheduleWorkspaceDeletion: () => Promise<void>
  keepWorkspace: () => Promise<void>
  revert: () => void
  save: () => Promise<void>
}

export const siteSettingsEditorKey = Symbol('site-settings-editor') as InjectionKey<SiteSettingsEditor>
</script>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import EditorNavigationList, { type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { MALI_FONT_CSS, isSiteFontPreset, resolveSiteFontPreset } from '~/shared/site-fonts'

const props = withDefaults(defineProps<{ surface?: 'brand' | 'settings' }>(), { surface: 'settings' })
const surface = computed(() => props.surface)
const dashboardApi = useDashboardApi()
const route = useRoute()
const editorError = ref<string | null>(null)
const facebookError = ref('')
const dashboard = useDashboardSite()
const siteDashboardPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const brandPath = computed(() => `${siteDashboardPath.value}/brand`)
const settingsPath = computed(() => `${siteDashboardPath.value}/settings`)
// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()

const siteId = await useDashboardSiteId()

// Workspace deletion is scheduled, never immediate: the organization carries a
// due instant and the deletion-sweep task performs the deletion once it passes.
// server/utils/tenant-deletion.ts owns both ends.
const isOwner = computed(() => dashboard.organization.value?.role === 'owner')
const deletionGraceDays = ref(30)
const deletionConfirmText = ref('')
const deletionSaving = ref(false)
const deletionError = ref('')
const deletionScheduledAt = computed(() => {
  const scheduled = dashboard.organization.value?.deletionScheduledAt
  if (!scheduled) return null
  const at = new Date(scheduled)
  return Number.isNaN(at.getTime()) ? null : at
})
const deletionDateLabel = computed(() => deletionScheduledAt.value
  ? deletionScheduledAt.value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : '')

async function scheduleWorkspaceDeletion() {
  if (deletionConfirmText.value !== 'DELETE') return
  deletionSaving.value = true
  deletionError.value = ''
  try {
    const response = await dashboardApi<{ success?: boolean; scheduled_at?: string; grace_days?: number }>('/api/dashboard/organizations/deletion', {
      method: 'POST',
      validate: (value): value is { success?: boolean; scheduled_at?: string; grace_days?: number } => isRecord(value),
    })
    if (response?.success !== true) throw new Error('Scheduling the deletion failed. Please try again.')
    if (typeof response?.grace_days === 'number') deletionGraceDays.value = response.grace_days
    deletionConfirmText.value = ''
  } catch (error) {
    deletionError.value = error instanceof Error ? error.message : 'Scheduling the deletion failed. Please try again.'
    deletionSaving.value = false
    return
  }
  // The deletion is scheduled. Reloading the workspace is what the date in the
  // message is read from, and a failure there is a failure to REFRESH: saying
  // "Scheduling the deletion failed" for a deletion that happened is how an
  // owner schedules it twice, or believes their workspace is safe.
  try {
    await dashboard.refresh()
  } catch {
    // Ignore refresh error; deletion has already scheduled
  } finally {
    deletionSaving.value = false
  }
}

async function keepWorkspace() {
  deletionSaving.value = true
  deletionError.value = ''
  try {
    const response = await dashboardApi<{ success?: boolean }>('/api/dashboard/organizations/deletion', {
      method: 'DELETE',
      validate: (value): value is { success?: boolean } => isRecord(value),
    })
    if (response?.success !== true) throw new Error('Cancelling the deletion failed. Please try again.')
  } catch (error) {
    deletionError.value = error instanceof Error ? error.message : 'Cancelling the deletion failed. Please try again.'
    deletionSaving.value = false
    return
  }
  // Cancelled. As above, the refresh that follows is a separate thing to fail.
  try {
    await dashboard.refresh()
  } finally {
    deletionSaving.value = false
  }
}



interface SettingsPageResource {
  settings: { success: boolean; settings: SiteSettingsResponse }
  notifications: { success: boolean; notifications: { whatsapp_phone: string | null } }
  facebook: FacebookConnectionStatus
}

const isSettingsResponse = (value: unknown): value is { success: boolean; settings: SiteSettingsResponse } =>
  isRecord(value) && typeof value.success === 'boolean' && isRecord(value.settings)
  && (value.settings.brand_name === undefined || value.settings.brand_name === null || typeof value.settings.brand_name === 'string')
  && (value.settings.font_preset === undefined || isSiteFontPreset(value.settings.font_preset))
  && (value.settings.default_currency === undefined || value.settings.default_currency === null || typeof value.settings.default_currency === 'string')
const isNotificationsResponse = (value: unknown): value is { success: boolean; notifications: { whatsapp_phone: string | null } } =>
  isRecord(value) && typeof value.success === 'boolean' && isRecord(value.notifications)
  && (value.notifications.whatsapp_phone === null || typeof value.notifications.whatsapp_phone === 'string')
const isFacebookStatus = (value: unknown): value is FacebookConnectionStatus =>
  isRecord(value) && typeof value.connected === 'boolean' && (value.facebook_page_name === undefined || typeof value.facebook_page_name === 'string')


/** Which leaf is open, named by the route below this rail rather than counted here. */
const detailKey = computed(() => level.child.value)
const validBrandKeys = new Set(['name', 'logo', 'sharing-image', 'description', 'color', 'font', 'contact', 'social'])
const validSettingsKeys = new Set(['domains', 'currency', 'notifications', 'search', 'analytics', 'publishing', 'localization', 'delete'])
const routeIsCanonical = computed(() => {
  // A level on its way out after a navigation elsewhere answers about a route
  // it is no longer part of, so it judges nothing.
  if (level.stale.value) return true
  if (level.mode.value === 'index') return true
  if (level.mode.value === 'yield') return false
  return (surface.value === 'brand' ? validBrandKeys : validSettingsKeys).has(detailKey.value ?? '')
})
// Raised, not thrown: the dashboard renders on the client, where a throw in a
// nested page's setup leaves a blank screen (DESIGN.md).
watchEffect(() => {
  if (!routeIsCanonical.value) showError(createError({ statusCode: 404, statusMessage: 'Setting not found' }))
})

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const connectingFacebook = ref(false)
const whatsappPhone = ref('')
const searchIndexed = ref(true)
const facebookConnection = ref<FacebookConnectionStatus | null>(null)
const localizationSettings = ref<LocalizationSettings | null>(null)
const localizationLoading = ref(false)
const localizationBusy = ref(false)
const localizationError = ref<string | null>(null)
const localizationProgress = ref<LocalizationProgress[]>([])
const localizationProgressError = ref<string | null>(null)
const newLocale = ref('')
const loadedSettings = ref<SiteSettingsResponse | null>(null)
const supportsSiteFonts = computed(() => loadedSettings.value?.theme === 'saya')
const loadedNotifications = ref<{ whatsapp_phone: string | null } | null>(null)
const originalSignature = ref('')
const form = reactive<SiteSettingsForm>({
  brand_name: '', brand_description: '', logoAssetId: null, socialShareAssetId: null, contact_email: '', brand_color: '', font_preset: 'default',
  default_currency: null, google_site_verification: '',
  social_facebook_url: '', social_instagram_url: '', social_tiktok_url: '',
})
// Only the specimen uses Mali. Never change the dashboard's typography.
useHead(() => ({
  style: surface.value === 'brand' && detailKey.value === 'font' && supportsSiteFonts.value && form.font_preset === 'mali'
    ? [{ key: 'site-font-preview', innerHTML: MALI_FONT_CSS }]
    : [],
}))
const brandLocalizationFields = computed(() => [
  { key: 'brand_name', label: 'Brand name', source: loadedSettings.value?.brand_name },
  { key: 'brand_description', label: 'Description', source: loadedSettings.value?.brand_description, multiline: true, rows: 6 },
])
const hasFacebookAccess = computed(() => dashboard.site.value?.effective_plan === 'growth')
const enableableCatalogOptions = computed(() => (localizationSettings.value?.available_catalogs ?? [])
  .filter(catalog => !localizationSettings.value?.languages.some(language => language.locale === catalog.locale && language.status !== 'disabled'))
  .map(catalog => ({ label: `${catalog.label} (${catalog.locale})`, value: catalog.locale })))
const nameCharactersRemaining = computed(() => 50 - form.brand_name.length)
const descriptionCharactersRemaining = computed(() => 500 - form.brand_description.length)

function explicitSummary(value: string | null | undefined, empty = 'Not set') { return value?.trim() || empty }
const notificationSummary = computed(() => explicitSummary(loadedNotifications.value?.whatsapp_phone, 'Not configured'))
const socialSummary = computed(() => {
  const count = [loadedSettings.value?.social_facebook_url, loadedSettings.value?.social_instagram_url, loadedSettings.value?.social_tiktok_url].filter(Boolean).length
  return count ? `${count} ${count === 1 ? 'profile' : 'profiles'} connected` : 'Not configured'
})
const searchSummary = computed(() => loadedSettings.value?.robots === 'noindex,nofollow' ? 'Hidden from search engines' : 'Visible to search engines')
const domainSummary = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || 'Not connected')
const brandItems = computed<EditorNavigationItem[]>(() => [
  { id: 'name', label: 'Brand name', summary: explicitSummary(loadedSettings.value?.brand_name), icon: 'i-lucide-type', to: `${brandPath.value}/name` },
  { id: 'logo', label: 'Logo', summary: loadedSettings.value?.media?.some(item => item.slot === 'logo') ? 'Logo selected' : 'Not set', icon: 'i-lucide-image', to: `${brandPath.value}/logo` },
  { id: 'sharing-image', label: 'Social sharing image', summary: loadedSettings.value?.media?.some(item => item.slot === 'social_share') ? 'Image selected' : 'Not set', icon: 'i-lucide-panels-top-left', to: `${brandPath.value}/sharing-image` },
  { id: 'description', label: 'Description', summary: explicitSummary(loadedSettings.value?.brand_description), icon: 'i-lucide-align-left', to: `${brandPath.value}/description` },
  { id: 'color', label: 'Brand color', summary: explicitSummary(loadedSettings.value?.brand_color), icon: 'i-lucide-palette', to: `${brandPath.value}/color` },
  ...(supportsSiteFonts.value ? [{ id: 'font', label: 'Website font', summary: loadedSettings.value?.font_preset === 'mali' ? 'Mali (Thai and English)' : 'Default', icon: 'i-lucide-type', to: `${brandPath.value}/font` }] : []),
  { id: 'contact', label: 'Contact details', summary: explicitSummary(loadedSettings.value?.contact_email), icon: 'i-lucide-mail', to: `${brandPath.value}/contact` },
  { id: 'social', label: 'Social profiles', summary: socialSummary.value, icon: 'i-lucide-share-2', to: `${brandPath.value}/social` },
  { id: 'translations', label: 'Translations', summary: 'Translate the brand name and description', icon: 'i-lucide-languages', action: { label: 'Localize' } },
])
const localizeOpen = ref(false)
function onRowAction(id: string) {
  if (id === 'translations') localizeOpen.value = true
}
// Flat, values on the rows, the way Edit preferences reads: nothing a visitor
// sees is here, and nothing here opens a second list.
const settingsItems = computed<EditorNavigationItem[]>(() => [
  { id: 'domains', label: 'Domain', summary: domainSummary.value, icon: 'i-lucide-globe-2', to: `${settingsPath.value}/domains` },
  { id: 'localization', label: 'Languages', summary: 'Languages the site is published in', icon: 'i-lucide-languages', to: `${settingsPath.value}/localization` },
  { id: 'currency', label: 'Currency', summary: explicitSummary(loadedSettings.value?.default_currency), icon: 'i-lucide-coins', to: `${settingsPath.value}/currency` },
  { id: 'notifications', label: 'WhatsApp number', summary: notificationSummary.value, icon: 'i-lucide-bell', to: `${settingsPath.value}/notifications` },
  { id: 'search', label: 'Search engines', summary: searchSummary.value, icon: 'i-lucide-scan-search', to: `${settingsPath.value}/search` },
  { id: 'analytics', label: 'Google Analytics', summary: explicitSummary(loadedSettings.value?.google_analytics_measurement_id, 'Not connected'), icon: 'i-lucide-chart-no-axes-combined', to: `${settingsPath.value}/analytics` },
  { id: 'publishing', label: 'Facebook publishing', summary: facebookConnection.value?.connected ? explicitSummary(facebookConnection.value.facebook_page_name, 'Connected') : 'Not connected', icon: 'i-simple-icons-facebook', to: `${settingsPath.value}/publishing` },
  // Deleting the site deletes the organization, so only an owner is
  // offered it — the same permission Better Auth enforces on the delete itself.
  ...(isOwner.value
    ? [{ id: 'delete', label: 'Delete site', summary: deletionScheduledAt.value ? `Scheduled for ${deletionDateLabel.value}` : 'Removes this site, its locations and its content', icon: 'i-lucide-trash-2', to: `${settingsPath.value}/delete` }]
    : []),
])

const navigationGroups = computed(() => [surface.value === 'brand'
  ? { id: 'brand', items: brandItems.value }
  : { id: 'settings', items: settingsItems.value }])
const navbarTitle = computed(() => surface.value === 'brand' ? 'Brand' : 'Website')

// Leaving a section resets its editor. This used to hang off the back button's
// click handler, which left browser back with stale editor state.
watch(() => route.path, (next, previous) => {
  if (previous && previous !== next) resetDraft()
})

function editorSignature(key: string | null) {
  switch (key) {
    case 'name': return JSON.stringify(form.brand_name)
    case 'logo': return JSON.stringify(form.logoAssetId)
    case 'sharing-image': return JSON.stringify(form.socialShareAssetId)
    case 'description': return JSON.stringify(form.brand_description)
    case 'color': return JSON.stringify(form.brand_color)
    case 'font': return JSON.stringify(form.font_preset)
    case 'contact': return JSON.stringify(form.contact_email)
    case 'social': return JSON.stringify([form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url])
    case 'currency': return JSON.stringify(form.default_currency)
    case 'notifications': return whatsappPhone.value
    case 'search': return JSON.stringify([searchIndexed.value, form.google_site_verification])
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
    case 'font': return supportsSiteFonts.value && isSiteFontPreset(form.font_preset) ? null : 'Choose a supported website font.'
    case 'contact': return !form.contact_email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email) ? null : 'Enter a valid email address.'
    case 'social': return [form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url].every(isValidUrl) ? null : 'Enter complete http or https profile URLs.'
    case 'notifications': return null
    case 'localization': return localizationSettings.value?.effective_plan !== 'growth' ? 'A Growth subscription is required.' : null
    default: return null
  }
})
const saveDisabled = computed(() => {
  return !dirty.value || validationMessage.value !== null
})

function fillForm(settings: SiteSettingsResponse) {
  loadedSettings.value = settings
  form.brand_name = settings.brand_name ?? ''
  form.brand_description = settings.brand_description ?? ''
  form.logoAssetId = settings.media?.find(item => item.slot === 'logo')?.asset_id ?? null
  form.socialShareAssetId = settings.media?.find(item => item.slot === 'social_share')?.asset_id ?? null
  form.contact_email = settings.contact_email ?? ''
  form.brand_color = settings.brand_color ?? ''
  form.font_preset = resolveSiteFontPreset(settings.font_preset)
  // A stored value that is not a supported code is not this form's to reinterpret:
  // showing it as USD invited the owner to save that over whatever is really there.
  form.default_currency = isCurrencyCode(settings.default_currency) ? settings.default_currency : null
  form.google_site_verification = settings.google_site_verification ?? ''
  form.social_facebook_url = settings.social_facebook_url ?? ''
  form.social_instagram_url = settings.social_instagram_url ?? ''
  form.social_tiktok_url = settings.social_tiktok_url ?? ''
  searchIndexed.value = settings.robots !== 'noindex,nofollow'
}
function fillNotifications(notifications: { whatsapp_phone: string | null }) {
  loadedNotifications.value = notifications
  whatsappPhone.value = notifications.whatsapp_phone ?? ''
}
function resetDraft() {
  editorError.value = null
  facebookError.value = ''
  if (loadedSettings.value) fillForm(loadedSettings.value)
  if (loadedNotifications.value) fillNotifications(loadedNotifications.value)
  newLocale.value = ''
  originalSignature.value = editorSignature(detailKey.value)
}
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) { const data = (error as { data?: { error?: string } }).data; if (data?.error) return data.error }
  return error instanceof Error ? error.message : fallback
}

const settingsResourceKey = computed(() => `dashboard-site-settings:${String(route.params.orgSlug)}:${String(route.params.siteSlug)}`)
const { data: settingsResource, pending: settingsPending, error: settingsResourceError, refresh: refreshSettings } = await useAsyncData<SettingsPageResource>(settingsResourceKey, async () => {
  const [settings, notifications, facebook] = await Promise.all([
    dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', { validate: isSettingsResponse }),
    dashboardApi<{ success: boolean; notifications: { whatsapp_phone: string | null } }>(`/api/editor/sites/${siteId}/notifications`, { validate: isNotificationsResponse }),
    hasFacebookAccess.value ? dashboardApi<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection', { query: { siteId }, validate: isFacebookStatus }) : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
  ])
  return { settings, notifications, facebook }
}, { lazy: true })
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

async function patchSettings(body: Record<string, unknown>) {
  const response = await dashboardApi<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', { method: 'PATCH', body, validate: isSettingsResponse })
  fillForm(response.settings)
  originalSignature.value = editorSignature(detailKey.value)
  await dashboard.refresh()
}
async function saveCurrentEditor() {
  if (saveDisabled.value || !detailKey.value) return
  saving.value = true
  editorError.value = null
  try {
    switch (detailKey.value) {
      case 'name': await patchSettings({ brand_name: form.brand_name.trim() }); break
      case 'logo': await patchSettings({ media: [{ asset_id: form.logoAssetId, slot: 'logo' }] }); break
      case 'sharing-image': await patchSettings({ media: [{ asset_id: form.socialShareAssetId, slot: 'social_share' }] }); break
      case 'description': await patchSettings({ brand_description: form.brand_description }); break
      case 'color': await patchSettings({ brand_color: form.brand_color }); break
      case 'font': await patchSettings({ font_preset: form.font_preset }); break
      case 'contact': await patchSettings({ contact_email: form.contact_email.trim() }); break
      case 'social': await patchSettings({ social_facebook_url: form.social_facebook_url.trim() || null, social_instagram_url: form.social_instagram_url.trim() || null, social_tiktok_url: form.social_tiktok_url.trim() || null }); break
      case 'currency': {
        if (!form.default_currency) throw new Error('Choose the currency this site prices in.')
        await patchSettings({ default_currency: form.default_currency })
        break
      }
      case 'search': await patchSettings({ robots: searchIndexed.value ? 'index,follow' : 'noindex,nofollow', google_site_verification: form.google_site_verification.trim() }); break
      case 'notifications': {
        const response = await dashboardApi<{ notifications: { whatsapp_phone: string | null } }>(`/api/editor/sites/${siteId}/notifications`, { method: 'PATCH', body: { whatsapp_phone: whatsappPhone.value.trim() }, validate: isNotificationsResponse })
        fillNotifications(response.notifications)
        originalSignature.value = editorSignature(detailKey.value)
        break
      }
      case 'localization': {
        const success = await enableLanguage()
        if (success) originalSignature.value = editorSignature(detailKey.value)
        break
      }
    }
  } catch (error) { editorError.value = errorMessage(error, 'Failed to save this setting') } finally { saving.value = false }
}
async function startFacebookConnect() {
  connectingFacebook.value = true
  facebookError.value = ''
  try {
    const response = await dashboardApi<{ authUrl?: string; error?: string }>('/api/integrations/facebook-pages/auth', { method: 'POST', validate: (value): value is { authUrl?: string; error?: string } => isRecord(value) && (value.authUrl === undefined || typeof value.authUrl === 'string') && (value.error === undefined || typeof value.error === 'string') })
    if (!response.authUrl) throw new Error(response.error || 'No authorization URL returned')
    await navigateTo(response.authUrl, { external: true })
  } catch (error) { facebookError.value = errorMessage(error, 'Failed to connect Facebook'); connectingFacebook.value = false }
}
const isLocalizationSettings = (value: unknown): value is LocalizationSettings =>
  isRecord(value) && Array.isArray(value.languages) && Array.isArray(value.available_catalogs)
const isLocalizationProgress = (value: unknown): value is LocalizationProgress =>
  isRecord(value) && typeof value.locale === 'string' && typeof value.completed === 'number' && typeof value.total === 'number'
  && Array.isArray(value.opportunities) && value.opportunities.every(item => isRecord(item)
    && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.path === 'string'
    && typeof item.completed === 'number' && typeof item.total === 'number')
async function loadLocalizationProgress() {
  // Every added language, not only the published ones: a language still being
  // translated is the one whose progress the owner most wants to see.
  const locales = localizationSettings.value?.languages
    .filter(language => !language.is_source)
    .map(language => language.locale) ?? []
  try {
    localizationProgress.value = await Promise.all(locales.map(locale =>
      dashboardApi<LocalizationProgress>(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/opportunities`, { validate: isLocalizationProgress })))
    localizationProgressError.value = null
  } catch (error) {
    localizationProgress.value = []
    localizationProgressError.value = errorMessage(error, 'Translation progress could not be loaded')
  }
}
async function loadLocalizationSettings() {
  localizationLoading.value = true
  try {
    localizationSettings.value = await dashboardApi<LocalizationSettings>(`/api/editor/sites/${siteId}/locales`, { validate: isLocalizationSettings })
    await loadLocalizationProgress()
    localizationError.value = null
  } catch (error) { localizationError.value = errorMessage(error, 'Failed to load localization settings') }
  finally { localizationLoading.value = false }
}
async function mutateLocalization(path: string, method: 'POST' | 'DELETE', body?: Record<string, unknown>) {
  localizationBusy.value = true
  try {
    await dashboardApi(path, { method, body, validate: (value): value is Record<string, unknown> => isRecord(value) })
    await loadLocalizationSettings()
    return true
  } catch (error) {
    localizationError.value = errorMessage(error, 'Localization request failed')
    return false
  } finally {
    localizationBusy.value = false
  }
}
async function enableLanguage(): Promise<boolean> {
  if (newLocale.value) {
    const selectedCatalog = localizationSettings.value?.available_catalogs.find(catalog => catalog.locale === newLocale.value)
    if (!selectedCatalog) return false
    const success = await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(newLocale.value)}/add`, 'POST', { label: selectedCatalog.label })
    if (success) newLocale.value = ''
    return success
  }
  return false
}
async function publishLanguage(locale: string) { await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/publish`, 'POST') }
async function disableLanguage(locale: string) { await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/disable`, 'POST') }
async function deleteLanguage(locale: string) { if (window.confirm(`Permanently delete all ${locale} content for this site?`)) await mutateLocalization(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, 'DELETE') }
watch(detailKey, key => { if (key === 'localization' && !localizationSettings.value) loadLocalizationSettings() }, { immediate: true })
provide(siteSettingsEditorKey, {
  form,
  siteId,
  siteDashboardPath,
  loading,
  saving,
  saveDisabled,
  editorError,
  validationMessage,
  nameCharactersRemaining,
  descriptionCharactersRemaining,
  supportsSiteFonts,
  whatsappPhone,
  searchIndexed,
  hasFacebookAccess,
  facebookConnection,
  facebookError,
  connectingFacebook,
  startFacebookConnect,
  refreshSettings,
  localizationSettings,
  localizationLoading,
  localizationBusy,
  localizationError,
  localizationProgress,
  localizationProgressError,
  enableableCatalogOptions,
  newLocale,
  publishLanguage,
  disableLanguage,
  deleteLanguage,
  deletionScheduledAt,
  deletionDateLabel,
  deletionGraceDays,
  deletionConfirmText,
  deletionSaving,
  deletionError,
  scheduleWorkspaceDeletion,
  keepWorkspace,
  // A cancelled leaf puts the loaded settings back before it closes.
  revert: resetDraft,
  save: saveCurrentEditor,
})
</script>