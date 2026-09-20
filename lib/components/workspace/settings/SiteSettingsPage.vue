<template>
  <UDashboardPanel
    :id="surface === 'brand' ? 'site-brand' : 'site-settings'"
    :class="hasDetail ? 'hidden lg:flex' : undefined"
    :default-size="hasDetail ? 32 : undefined"
  >
    <template #header>
      <UDashboardNavbar :title="navbarTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
        <div v-if="loading" class="space-y-4">
          <USkeleton v-for="i in 4" :key="i" class="h-32 rounded-xl" />
        </div>
        <UAlert v-else-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />
        <EditorNavigationList v-else :groups="navigationGroups" :active-item="activeNavigationId" @act="onRowAction" />
      </div>
    </template>
  </UDashboardPanel>

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

  <!--
    The open setting is the other column: its own panel, its own header,
    and Save/Cancel in the panel's own footer slot.
  -->
  <UDashboardPanel v-if="hasDetail" id="site-settings-detail">
    <template #header>
      <UDashboardNavbar :title="detailTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl">
        <UAlert v-if="editorError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="editorError" class="mb-6" />
        <div v-if="detailKey === 'name'" class="space-y-6">
          <p class="mb-2 text-sm font-semibold text-muted">{{ nameCharactersRemaining }}/50 available</p>
          <UInput v-model="form.brand_name" size="xl" maxlength="50" autofocus class="w-full" />
        </div>

        <div v-else-if="detailKey === 'logo'" class="space-y-6">
          <p class="text-base text-muted">Choose an image from the site media library or upload a new logo.</p>
          <MediaPicker v-model="form.logoAssetId" :site-id="siteId" accept="image" title="Select logo" />
        </div>

        <div v-else-if="detailKey === 'sharing-image'" class="space-y-6">
          <p class="text-base text-muted">Choose the image used as the source for generated social sharing cards.</p>
          <MediaPicker v-model="form.socialShareAssetId" :site-id="siteId" accept="image" title="Select social sharing image" />
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

        <div v-else-if="detailKey === 'font'" class="space-y-6">
          <template v-if="supportsSiteFonts">
            <p class="text-base text-muted">Choose the font for headings and text on the public website. Mali supports Thai and English. Default restores the template typography.</p>
            <UFormField label="Website font">
              <USelect v-model="form.font_preset" :items="SITE_FONT_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" />
            </UFormField>
            <div class="space-y-3 rounded-lg border border-default p-5 text-2xl leading-relaxed" :style="siteFontStyles(form.font_preset)" data-testid="site-font-preview">
              <p lang="en">Welcome · 123</p>
              <p lang="th">ยินดีต้อนรับ · ๑๒๓</p>
            </div>
          </template>
          <p v-else class="text-base text-muted">Font presets are available for the Saya template.</p>
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
          <USelect :model-value="form.default_currency ?? undefined" :items="CURRENCY_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" placeholder="Select currency" @update:model-value="form.default_currency = $event ?? null" />
        </div>

        <div v-else-if="detailKey === 'delete'" class="space-y-6">
          <template v-if="deletionScheduledAt">
            <UAlert
              color="warning"
              variant="soft"
              icon="i-lucide-clock"
              title="Deletion scheduled"
              :description="`This workspace — the site, its locations, content and media — is deleted on ${deletionDateLabel}. Everything stays online until then, and the address stays reserved.`"
            />
            <UAlert v-if="deletionError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deletionError" />
            <UButton color="neutral" variant="solid" size="lg" :loading="deletionSaving" @click="keepWorkspace">Keep this workspace</UButton>
          </template>
          <template v-else>
            <p class="text-base text-muted">
              This schedules the whole workspace for deletion in {{ deletionGraceDays }} days: this site, its locations, content, media and the organization itself. Nothing is removed today, the site stays online, and you can cancel here until then.
            </p>
            <UAlert v-if="deletionError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deletionError" />
            <UFormField label="Type DELETE to confirm">
              <UInput v-model="deletionConfirmText" placeholder="DELETE" :disabled="deletionSaving" class="w-full" />
            </UFormField>
            <UButton color="error" variant="solid" size="lg" :disabled="deletionConfirmText !== 'DELETE'" :loading="deletionSaving" @click="scheduleWorkspaceDeletion">Schedule deletion</UButton>
          </template>
        </div>

        <div v-else-if="detailKey === 'localization'" class="space-y-6">
          <p class="text-base text-muted">
            English is the permanent source language. Growth includes two secondary languages at no extra cost.
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
                  <UBadge :color="language.is_source || language.status === 'published' ? 'success' : 'neutral'" variant="subtle" size="sm" class="mt-1">
                    {{ language.is_source ? 'Source · published' : language.status === 'published' ? 'published' : 'Not published' }}
                  </UBadge>
                </div>
                <div v-if="!language.is_source" class="flex gap-2">
                  <UButton
                    v-if="language.status === 'disabled'"
                    color="primary"
                    :loading="localizationBusy"
                    @click="publishLanguage(language.locale)"
                  >
                    Publish
                  </UButton>
                  <UButton v-if="language.status === 'published'" color="neutral" variant="outline" :loading="localizationBusy" @click="disableLanguage(language.locale)">Disable</UButton>
                  <UButton v-if="language.status === 'disabled'" color="error" variant="outline" :loading="localizationBusy" @click="deleteLanguage(language.locale)">Delete content</UButton>
                </div>
              </div>
            </div>
            <UCard v-for="progress in localizationProgress" :key="progress.locale" variant="soft">
              <template #header>
                <div>
                  <h3 class="font-semibold text-highlighted">Let’s translate your site</h3>
                  <p class="mt-1 text-sm text-muted">{{ progress.completed }}/{{ progress.total }} fields translated in {{ progress.locale }}.</p>
                </div>
              </template>
              <div v-if="progress.opportunities.length" class="divide-y divide-default">
                <NuxtLink
                  v-for="item in progress.opportunities"
                  :key="item.id"
                  :to="`${siteDashboardPath}/${item.path}`"
                  class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <span class="font-medium text-highlighted">{{ item.label }}</span>
                  <span class="flex items-center gap-2 text-sm text-muted">
                    {{ item.total - item.completed }} left
                    <UIcon name="i-lucide-chevron-right" class="size-4" />
                  </span>
                </NuxtLink>
              </div>
              <UAlert v-else color="success" variant="soft" title="Translation is complete" description="Every source field with content has a translation." />
            </UCard>
            <UAlert v-if="localizationProgressError" color="error" variant="soft" :description="localizationProgressError" />
            <p v-if="!enableableCatalogOptions.length" class="text-sm text-muted">No additional languages are available to enable right now.</p>
            <UFormField v-else label="Available language">
              <USelect v-model="newLocale" :items="enableableCatalogOptions" placeholder="Select a language to enable" size="xl" class="w-full" />
            </UFormField>
          </template>
        </div>

        <div v-else-if="detailKey === 'notifications'" class="space-y-8">
          <!--
            The number the business is reached on. Which channels a person
            wants is their own setting, at /dashboard/account/profile/notifications.
          -->
          <UFormField label="Site-wide WhatsApp number" hint="Used when a location has no number of its own.">
            <UInput v-model="whatsappPhone" type="tel" placeholder="+66..." size="xl" class="w-full" />
          </UFormField>
        </div>

        <SiteGoogleAnalyticsSettings v-else-if="detailKey === 'analytics'" :site-id="siteId" />

        <div v-else-if="detailKey === 'search'" class="space-y-8">
          <UCard variant="subtle">
            <USwitch v-model="searchIndexed" label="Visible to search engines" description="Allow the site to appear in search results." size="xl" />
          </UCard>
          <UFormField label="Google Search Console verification token">
            <UInput v-model="form.google_site_verification" size="xl" class="w-full" />
          </UFormField>
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
          <UAlert v-if="facebookError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="facebookError" class="mt-4" />
        </div>

        <UAlert v-if="validationMessage" class="mt-6" color="error" variant="soft" :description="validationMessage" />
      </div>
    </template>

    <template v-if="showActions" #footer>
      <div class="flex shrink-0 items-center justify-between gap-4 border-t border-default px-4 py-3 sm:px-6">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="cancelEditor" />
        <UButton label="Save" :loading="saving" :disabled="saveDisabled" @click="saveCurrentEditor" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import SiteGoogleAnalyticsSettings from '~/components/dashboard/SiteGoogleAnalyticsSettings.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { CURRENCY_OPTIONS, isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { SITE_FONT_OPTIONS, MALI_FONT_CSS, isSiteFontPreset, resolveSiteFontPreset, siteFontStyles, type SiteFontPreset } from '~/shared/site-fonts'

const props = withDefaults(defineProps<{ surface?: 'brand' | 'settings' }>(), { surface: 'settings' })
const surface = computed(() => props.surface)
const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const editorError = ref<string | null>(null)
const facebookError = ref('')
const dashboard = useDashboardSite()
const siteDashboardPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const brandPath = computed(() => `${siteDashboardPath.value}/brand`)
const settingsPath = computed(() => `${siteDashboardPath.value}/settings`)
// `useEditorFrame` provides and injects, so it runs before any `await`, and it
// is the only place the route below this level is split into segments. This
// component used to re-derive them from `route.params.segments`, a second copy
// of the composable's own `rest`.
const frame = useEditorFrame(computed(() => surface.value === 'brand' ? brandPath.value : settingsPath.value))

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

interface SiteSettingsResponse {
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

interface FacebookConnectionStatus { connected: boolean; facebook_page_name?: string }
interface LocalizationLanguageRow { locale: string; label: string | null; is_source: number | boolean; status: string }
interface LocalizationCatalogRow { locale: string; label: string; direction: string }
interface LocalizationSettings { effective_plan: string; languages: LocalizationLanguageRow[]; available_catalogs: LocalizationCatalogRow[] }
interface LocalizationProgress { locale: string; completed: number; total: number; opportunities: Array<{ id: string; label: string; completed: number; total: number; path: string }> }

interface SettingsPageResource {
  settings: { success: boolean; settings: SiteSettingsResponse }
  notifications: { success: boolean; notifications: { whatsapp_phone: string | null } }
  facebook: FacebookConnectionStatus
}
interface EditorNavigationItem { id: string; label: string; summary: string; icon: string; to: string }

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


const routeSegments = frame.rest
const detailKey = computed(() => routeSegments.value[0] ?? null)
const validBrandKeys = new Set(['name', 'logo', 'sharing-image', 'description', 'color', 'font', 'contact', 'social'])
const validSettingsKeys = new Set(['currency', 'notifications', 'search', 'analytics', 'publishing', 'localization', 'delete'])
const routeIsCanonical = computed(() => {
  const segments = routeSegments.value
  if (segments.length === 0) return true
  if (segments.length > 1) return false
  return (surface.value === 'brand' ? validBrandKeys : validSettingsKeys).has(segments[0]!)
})
watchEffect(() => {
  if (!routeIsCanonical.value) throw createError({ statusCode: 404, statusMessage: 'Setting not found' })
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
interface SiteSettingsForm {
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
const activeNavigationId = detailKey
const hasDetail = computed(() => routeSegments.value.length > 0)
const detailTitles: Record<string, string> = { name: 'Brand name', logo: 'Logo', 'sharing-image': 'Social sharing image', description: 'Description', color: 'Brand color', font: 'Website font', contact: 'Contact details', social: 'Social profiles', domains: 'Domain', currency: 'Currency', notifications: 'WhatsApp number', analytics: 'Google Analytics', search: 'Search engines', publishing: 'Facebook publishing', localization: 'Languages', delete: 'Delete site' }
const detailTitle = computed(() => detailKey.value ? detailTitles[detailKey.value] : undefined)

// The navbar names the level, not the open section — at `lg` the section's own
// title is a heading on its pane, with the index list still beside it. Naming the
// section twice made the navbar claim to be the page the pane was showing.
const navbarTitle = computed(() => surface.value === 'brand' ? 'Brand' : 'Settings')
const showActions = computed(() => Boolean(detailKey.value && !['analytics', 'publishing', 'delete'].includes(detailKey.value)
  && (detailKey.value !== 'font' || supportsSiteFonts.value)))

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
const { data: settingsResource, pending: settingsPending, error: settingsResourceError } = await useAsyncData<SettingsPageResource>(settingsResourceKey, async () => {
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

function cancelEditor() {
  resetDraft()
  const destination = surface.value === 'brand' ? brandPath.value : settingsPath.value
  router.push(destination)
}
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
</script>