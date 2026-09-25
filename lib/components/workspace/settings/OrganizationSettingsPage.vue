<template>
  <!--
    Brand is what a guest sees; Website is what a guest never sees. Each is a
    flat list of settings, and each setting is a leaf below this level.
  -->
  <DashboardIndexPanel :id="surface === 'brand' ? 'organization-brand' : 'organization-settings'" :title="navbarTitle" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
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
    :organization-id="organizationId"
    resource-type="site"
    :resource-id="organizationId"
    resource-label="brand"
    :fields="brandLocalizationFields"
    :language-settings-path="`${settingsPath}/localization`"
  />
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Reactive, Ref } from 'vue'
import type { CurrencyCode } from '~/shared/currencies'
import type { OrganizationFontPreset } from '~/shared/organization-fonts'

export interface OrganizationSettingsForm {
  name: string
  brand_description: string
  logoAssetId: string | null
  socialShareAssetId: string | null
  contact_email: string
  brand_color: string
  font_preset: OrganizationFontPreset
  default_currency: CurrencyCode | null
  status: OrganizationStatus
  social_facebook_url: string
  social_instagram_url: string
  social_tiktok_url: string
}

/** Live and Draft are the tenant's; Suspended is KrabiClaw's hold. */
export type OrganizationStatus = 'active' | 'inactive' | 'suspended'

export interface OrganizationSettingsResponse {
  theme?: string
  status: OrganizationStatus
  name?: string | null
  brand_description?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url?: string | null }>
  contact_email?: string | null
  brand_color?: string | null
  font_preset?: OrganizationFontPreset
  default_currency?: string | null
  social_facebook_url?: string | null
  social_instagram_url?: string | null
  social_tiktok_url?: string | null
}

export interface LocalizationLanguageRow { locale: string; label: string | null; is_source: number | boolean; status: string }

export interface LocalizationCatalogRow { locale: string; label: string; direction: string }

export interface LocalizationSettings { effective_plan: string; languages: LocalizationLanguageRow[]; available_catalogs: LocalizationCatalogRow[] }

export interface LocalizationProgress { locale: string; completed: number; total: number; opportunities: Array<{ id: string; label: string; completed: number; total: number; path: string }> }

/**
 * The site's settings draft and everything a leaf shows or does beside its
 * one field. Brand and Website mount the same provider; a leaf reads what it
 * needs and commits through `save`, which writes only the open setting.
 */
export interface OrganizationSettingsEditor {
  form: Reactive<OrganizationSettingsForm>
  organizationId: string
  organizationDashboardPath: ComputedRef<string>
  loading: Ref<boolean>
  saving: Ref<boolean>
  saveDisabled: ComputedRef<boolean>
  editorError: Ref<string | null>
  validationMessage: ComputedRef<string | null>
  nameCharactersRemaining: ComputedRef<number>
  descriptionCharactersRemaining: ComputedRef<number>
  supportsOrganizationFonts: ComputedRef<boolean>
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
  deletionConfirmText: Ref<string>
  deletionSaving: Ref<boolean>
  deletionError: Ref<string>
  deleteWorkspace: () => Promise<void>
  revert: () => void
  save: () => Promise<void>
}

export const organizationSettingsEditorKey = Symbol('organization-settings-editor') as InjectionKey<OrganizationSettingsEditor>
</script>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import EditorNavigationList, { type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { MALI_FONT_CSS, isOrganizationFontPreset, resolveOrganizationFontPreset } from '~/shared/organization-fonts'

const props = withDefaults(defineProps<{ surface?: 'brand' | 'settings' }>(), { surface: 'settings' })
const surface = computed(() => props.surface)
const dashboardApi = useDashboardApi()
const route = useRoute()
const editorError = ref<string | null>(null)
const dashboard = useDashboardOrganization()
const organizationDashboardPath = computed(() => `/dashboard/${String(route.params.orgSlug)}`)
const brandPath = computed(() => `${organizationDashboardPath.value}/brand`)
const settingsPath = computed(() => `${organizationDashboardPath.value}/settings/website`)
// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()

const organizationId = await useDashboardOrganizationId()

// Organization deletion is immediate after explicit confirmation. The server
// cancels active/trialing Stripe subscriptions, releases external resources,
 // and only then removes the organization.
const isOwner = computed(() => dashboard.organization.value?.role === 'owner')
const deletionConfirmText = ref('')
const deletionSaving = ref(false)
const deletionError = ref('')

async function deleteWorkspace() {
  if (deletionConfirmText.value !== 'DELETE') return
  deletionSaving.value = true
  deletionError.value = ''
  try {
    const response = await dashboardApi<{ success?: boolean }>('/api/dashboard/organizations/deletion', {
      method: 'POST',
      validate: (value): value is { success?: boolean } => isRecord(value),
    })
    if (response?.success !== true) throw new Error('Deletion failed. Please try again.')
    await navigateTo('/dashboard', { replace: true })
  } catch (error) {
    deletionError.value = error instanceof Error ? error.message : 'Deletion failed. Please try again.'
  } finally {
    deletionSaving.value = false
  }
}


interface SettingsPageResource {
  settings: { success: boolean; settings: OrganizationSettingsResponse }
}

const isSettingsResponse = (value: unknown): value is { success: boolean; settings: OrganizationSettingsResponse } =>
  isRecord(value) && typeof value.success === 'boolean' && isRecord(value.settings)
  && (value.settings.name === undefined || value.settings.name === null || typeof value.settings.name === 'string')
  && (value.settings.font_preset === undefined || isOrganizationFontPreset(value.settings.font_preset))
  && (value.settings.default_currency === undefined || value.settings.default_currency === null || typeof value.settings.default_currency === 'string')
  && isOrganizationStatus(value.settings.status)
function isOrganizationStatus(value: unknown): value is OrganizationStatus {
  return value === 'active' || value === 'inactive' || value === 'suspended'
}


/** Which leaf is open, named by the route below this rail rather than counted here. */
const detailKey = computed(() => level.child.value)
const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const localizationSettings = ref<LocalizationSettings | null>(null)
const localizationLoading = ref(false)
const localizationBusy = ref(false)
const localizationError = ref<string | null>(null)
const localizationProgress = ref<LocalizationProgress[]>([])
const localizationProgressError = ref<string | null>(null)
const newLocale = ref('')
const loadedSettings = ref<OrganizationSettingsResponse | null>(null)
const supportsOrganizationFonts = computed(() => loadedSettings.value?.theme === 'saya')
const originalSignature = ref('')
const form = reactive<OrganizationSettingsForm>({
  name: '', brand_description: '', logoAssetId: null, socialShareAssetId: null, contact_email: '', brand_color: '', font_preset: 'default',
  default_currency: null, status: 'inactive',
  social_facebook_url: '', social_instagram_url: '', social_tiktok_url: '',
})
// Only the specimen uses Mali. Never change the dashboard's typography.
useHead(() => ({
  style: surface.value === 'brand' && detailKey.value === 'font' && supportsOrganizationFonts.value && form.font_preset === 'mali'
    ? [{ key: 'organization-font-preview', innerHTML: MALI_FONT_CSS }]
    : [],
}))
const brandLocalizationFields = computed(() => [
  { key: 'name', label: 'Brand name', source: loadedSettings.value?.name },
  { key: 'brand_description', label: 'Description', source: loadedSettings.value?.brand_description, multiline: true, rows: 6 },
])
const enableableCatalogOptions = computed(() => (localizationSettings.value?.available_catalogs ?? [])
  .filter(catalog => !localizationSettings.value?.languages.some(language => language.locale === catalog.locale && language.status !== 'disabled'))
  .map(catalog => ({ label: `${catalog.label} (${catalog.locale})`, value: catalog.locale })))
const nameCharactersRemaining = computed(() => 50 - form.name.length)
const descriptionCharactersRemaining = computed(() => 500 - form.brand_description.length)

function explicitSummary(value: string | null | undefined, empty = 'Not set') { return value?.trim() || empty }
const socialSummary = computed(() => {
  const count = [loadedSettings.value?.social_facebook_url, loadedSettings.value?.social_instagram_url, loadedSettings.value?.social_tiktok_url].filter(Boolean).length
  return count ? `${count} ${count === 1 ? 'profile' : 'profiles'} connected` : 'Not configured'
})
const STATUS_LABELS: Record<OrganizationStatus, string> = { active: 'Live', inactive: 'Draft', suspended: 'Suspended' }
const domainSummary = computed(() => dashboard.organization.value?.custom_domain || dashboard.organization.value?.public_url || 'Not connected')
const brandItems = computed<EditorNavigationItem[]>(() => [
  { id: 'name', label: 'Brand name', summary: explicitSummary(loadedSettings.value?.name), icon: 'i-lucide-type', to: `${brandPath.value}/name` },
  { id: 'logo', label: 'Logo', summary: loadedSettings.value?.media?.some(item => item.slot === 'logo') ? 'Logo selected' : 'Not set', icon: 'i-lucide-image', to: `${brandPath.value}/logo` },
  { id: 'sharing-image', label: 'Social sharing image', summary: loadedSettings.value?.media?.some(item => item.slot === 'social_share') ? 'Image selected' : 'Not set', icon: 'i-lucide-panels-top-left', to: `${brandPath.value}/sharing-image` },
  { id: 'description', label: 'Description', summary: explicitSummary(loadedSettings.value?.brand_description), icon: 'i-lucide-align-left', to: `${brandPath.value}/description` },
  { id: 'color', label: 'Brand color', summary: explicitSummary(loadedSettings.value?.brand_color), icon: 'i-lucide-palette', to: `${brandPath.value}/color` },
  ...(supportsOrganizationFonts.value ? [{ id: 'font', label: 'Website font', summary: loadedSettings.value?.font_preset === 'mali' ? 'Mali (Thai and English)' : 'Default', icon: 'i-lucide-type', to: `${brandPath.value}/font` }] : []),
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
  { id: 'status', label: 'Status', summary: loadedSettings.value ? STATUS_LABELS[loadedSettings.value.status] : 'Not set', icon: 'i-lucide-radio', to: `${settingsPath.value}/status` },
  { id: 'domains', label: 'Domain', summary: domainSummary.value, icon: 'i-lucide-globe-2', to: `${settingsPath.value}/domains` },
  { id: 'localization', label: 'Languages', summary: 'Languages the site is published in', icon: 'i-lucide-languages', to: `${settingsPath.value}/localization` },
  { id: 'currency', label: 'Currency', summary: explicitSummary(loadedSettings.value?.default_currency), icon: 'i-lucide-coins', to: `${settingsPath.value}/currency` },
  // Deleting the site deletes the organization, so only an owner is
  // offered it — the same permission Better Auth enforces on the delete itself.
  ...(isOwner.value
    ? [{ id: 'delete', label: 'Delete site', summary: 'Permanently removes this organization, its locations and its content', icon: 'i-lucide-trash-2', to: `${settingsPath.value}/delete` }]
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
    case 'name': return JSON.stringify(form.name)
    case 'logo': return JSON.stringify(form.logoAssetId)
    case 'sharing-image': return JSON.stringify(form.socialShareAssetId)
    case 'description': return JSON.stringify(form.brand_description)
    case 'color': return JSON.stringify(form.brand_color)
    case 'font': return JSON.stringify(form.font_preset)
    case 'contact': return JSON.stringify(form.contact_email)
    case 'social': return JSON.stringify([form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url])
    case 'currency': return JSON.stringify(form.default_currency)
    case 'status': return JSON.stringify(form.status)
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
    case 'name': return form.name.trim() ? null : 'Enter a brand name.'
    case 'color': return !form.brand_color.trim() || /^#[0-9a-f]{6}$/i.test(form.brand_color) ? null : 'Enter a six-digit hex color.'
    case 'font': return supportsOrganizationFonts.value && isOrganizationFontPreset(form.font_preset) ? null : 'Choose a supported website font.'
    case 'contact': return !form.contact_email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email) ? null : 'Enter a valid email address.'
    case 'social': return [form.social_facebook_url, form.social_instagram_url, form.social_tiktok_url].every(isValidUrl) ? null : 'Enter complete http or https profile URLs.'
    case 'status': return form.status === 'suspended' ? 'This website is suspended. Contact support to restore it.' : null
    case 'localization': return localizationSettings.value?.effective_plan !== 'growth' ? 'A Growth subscription is required.' : null
    default: return null
  }
})
const saveDisabled = computed(() => {
  return !dirty.value || validationMessage.value !== null
})

function fillForm(settings: OrganizationSettingsResponse) {
  loadedSettings.value = settings
  form.name = settings.name ?? ''
  form.brand_description = settings.brand_description ?? ''
  form.logoAssetId = settings.media?.find(item => item.slot === 'logo')?.asset_id ?? null
  form.socialShareAssetId = settings.media?.find(item => item.slot === 'social_share')?.asset_id ?? null
  form.contact_email = settings.contact_email ?? ''
  form.brand_color = settings.brand_color ?? ''
  form.font_preset = resolveOrganizationFontPreset(settings.font_preset)
  // A stored value that is not a supported code is not this form's to reinterpret:
  // showing it as USD invited the owner to save that over whatever is really there.
  form.default_currency = isCurrencyCode(settings.default_currency) ? settings.default_currency : null
  form.status = settings.status
  form.social_facebook_url = settings.social_facebook_url ?? ''
  form.social_instagram_url = settings.social_instagram_url ?? ''
  form.social_tiktok_url = settings.social_tiktok_url ?? ''
}
function resetDraft() {
  editorError.value = null
  if (loadedSettings.value) fillForm(loadedSettings.value)
  newLocale.value = ''
  originalSignature.value = editorSignature(detailKey.value)
}
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) { const data = (error as { data?: { error?: string } }).data; if (data?.error) return data.error }
  return error instanceof Error ? error.message : fallback
}

const settingsResourceKey = computed(() => `dashboard-organization-settings:${String(route.params.orgSlug)}`)
const { data: settingsResource, pending: settingsPending, error: settingsResourceError } = await useAsyncData<SettingsPageResource>(settingsResourceKey, async () => {
  const [settings] = await Promise.all([
    dashboardApi<{ success: boolean; settings: OrganizationSettingsResponse }>('/api/dashboard/settings', { validate: isSettingsResponse }),
  ])
  return { settings }
}, { lazy: true })
watch([settingsResource, settingsPending, settingsResourceError], ([resource, pending, error]) => {
  loading.value = pending
  if (error) { loadError.value = errorMessage(error, 'Failed to load organization settings'); return }
  if (!resource) return
  fillForm(resource.settings.settings)
  originalSignature.value = editorSignature(detailKey.value)
  loadError.value = null
}, { immediate: true })
watch(detailKey, () => resetDraft())

async function patchSettings(body: Record<string, unknown>) {
  const response = await dashboardApi<{ success: boolean; settings: OrganizationSettingsResponse }>('/api/dashboard/settings', { method: 'PATCH', body, validate: isSettingsResponse })
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
      case 'name': await patchSettings({ name: form.name.trim() }); break
      case 'logo': await patchSettings({ media: [{ asset_id: form.logoAssetId, slot: 'logo' }] }); break
      case 'sharing-image': await patchSettings({ media: [{ asset_id: form.socialShareAssetId, slot: 'social_share' }] }); break
      case 'description': await patchSettings({ brand_description: form.brand_description }); break
      case 'color': await patchSettings({ brand_color: form.brand_color }); break
      case 'font': await patchSettings({ font_preset: form.font_preset }); break
      case 'contact': await patchSettings({ contact_email: form.contact_email.trim() }); break
      case 'social': await patchSettings({ social_facebook_url: form.social_facebook_url.trim() || null, social_instagram_url: form.social_instagram_url.trim() || null, social_tiktok_url: form.social_tiktok_url.trim() || null }); break
      case 'currency': {
        if (!form.default_currency) throw new Error('Choose the currency this organization prices in.')
        await patchSettings({ default_currency: form.default_currency })
        break
      }
      case 'status': await patchSettings({ status: form.status }); break
      case 'localization': {
        const success = await enableLanguage()
        if (success) originalSignature.value = editorSignature(detailKey.value)
        break
      }
    }
  } catch (error) { editorError.value = errorMessage(error, 'Failed to save this setting') } finally { saving.value = false }
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
      dashboardApi<LocalizationProgress>(`/api/editor/organizations/${organizationId}/locales/${encodeURIComponent(locale)}/opportunities`, { validate: isLocalizationProgress })))
    localizationProgressError.value = null
  } catch (error) {
    localizationProgress.value = []
    localizationProgressError.value = errorMessage(error, 'Translation progress could not be loaded')
  }
}
async function loadLocalizationSettings() {
  localizationLoading.value = true
  try {
    localizationSettings.value = await dashboardApi<LocalizationSettings>(`/api/editor/organizations/${organizationId}/locales`, { validate: isLocalizationSettings })
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
    const success = await mutateLocalization(`/api/editor/organizations/${organizationId}/locales/${encodeURIComponent(newLocale.value)}/add`, 'POST', { label: selectedCatalog.label })
    if (success) newLocale.value = ''
    return success
  }
  return false
}
async function publishLanguage(locale: string) { await mutateLocalization(`/api/editor/organizations/${organizationId}/locales/${encodeURIComponent(locale)}/publish`, 'POST') }
async function disableLanguage(locale: string) { await mutateLocalization(`/api/editor/organizations/${organizationId}/locales/${encodeURIComponent(locale)}/disable`, 'POST') }
async function deleteLanguage(locale: string) { if (window.confirm(`Permanently delete all ${locale} content for this organization?`)) await mutateLocalization(`/api/editor/organizations/${organizationId}/locales/${encodeURIComponent(locale)}`, 'DELETE') }
watch(detailKey, key => { if (key === 'localization' && !localizationSettings.value) loadLocalizationSettings() }, { immediate: true })
provide(organizationSettingsEditorKey, {
  form,
  organizationId,
  organizationDashboardPath,
  loading,
  saving,
  saveDisabled,
  editorError,
  validationMessage,
  nameCharactersRemaining,
  descriptionCharactersRemaining,
  supportsOrganizationFonts,
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
  deletionConfirmText,
  deletionSaving,
  deletionError,
  deleteWorkspace,
  // A cancelled leaf puts the loaded settings back before it closes.
  revert: resetDraft,
  save: saveCurrentEditor,
})
</script>