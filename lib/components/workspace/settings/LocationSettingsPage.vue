<template>
  <UDashboardPanel
    id="location-settings"
    :ui="{ body: 'min-h-0 !gap-0 !overflow-hidden !p-0 sm:!p-0' }"
  >
    <template #header>
      <UDashboardNavbar :title="navbarTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="backTo" :label="backLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4 p-5 sm:p-8">
        <USkeleton v-for="index in 6" :key="index" class="h-32 rounded-xl" />
      </div>
      <div v-else-if="error" class="p-5 sm:p-8">
        <UAlert color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" />
      </div>
      <EditorPaneShell
        v-else-if="location"
        :has-detail="hasDetail"
        show-desktop-detail
        :show-actions="hasDetail"
        :saving="saving"
        :save-disabled="saveDisabled"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="detailKey" />
        </template>

        <template #detail>
          <div v-if="editorKey === 'profile'" class="space-y-6">
            <h2 v-if="!hasDetail" class="text-3xl font-semibold text-highlighted">Profile</h2>
            <p class="text-base text-muted">The public identity and contact details for this location.</p>
            <div class="flex flex-wrap gap-6">
              <UCheckbox v-model="detailsForm.is_primary" label="Primary location" />
              <UCheckbox :model-value="detailsForm.status === 'active'" label="Active" @update:model-value="setDetailsActive" />
            </div>
            <UFormField label="Name"><UInput v-model="detailsForm.title" size="xl" autofocus class="w-full" /></UFormField>
            <UFormField label="Slug"><UInput v-model="detailsForm.slug" size="xl" class="w-full" /></UFormField>
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="City"><UInput v-model="detailsForm.city" size="xl" class="w-full" /></UFormField>
              <UFormField label="Neighbourhood"><UInput v-model="detailsForm.neighborhood" size="xl" class="w-full" /></UFormField>
              <UFormField label="Phone"><UInput v-model="detailsForm.phone" type="tel" size="xl" class="w-full" /></UFormField>
              <UFormField label="Email"><UInput v-model="detailsForm.email" type="email" size="xl" class="w-full" /></UFormField>
            </div>
            <UFormField label="Website URL"><UInput v-model="detailsForm.website_url" type="url" size="xl" class="w-full" /></UFormField>
            <UFormField label="Address"><UTextarea v-model="detailsForm.address" :rows="4" class="w-full" /></UFormField>
          </div>

          <div v-else-if="editorKey === 'translations'" class="space-y-6">
            <h2 v-if="!hasDetail" class="text-3xl font-semibold text-highlighted">Translations</h2>
            <p class="text-base text-muted">Edit this location's public content in another published language. The default-language values above are unaffected.</p>
            <UFormField label="Language">
              <select v-model="translationLocale" aria-label="Translation language" class="rounded-lg border border-default bg-default px-3 py-2">
                <option v-for="option in translationLocaleOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </UFormField>
            <p v-if="translationLocaleOptions.length === 0" class="text-sm text-muted">No additional languages are enabled for this site yet.</p>
            <template v-else>
              <p class="text-xs text-muted">Source (English): {{ detailsForm.title }}</p>
              <UFormField :label="`Name (${translationLocale})`"><UInput v-model="translationFields.title" size="xl" class="w-full" /></UFormField>
              <UFormField :label="`Short description (${translationLocale})`"><UInput v-model="translationFields.short_description" size="xl" class="w-full" /></UFormField>
              <UFormField :label="`Description (${translationLocale})`"><UTextarea v-model="translationFields.description" :rows="6" class="w-full" /></UFormField>
              <UFormField :label="`City (${translationLocale})`"><UInput v-model="translationFields.city" size="xl" class="w-full" /></UFormField>
              <UFormField :label="`Neighbourhood (${translationLocale})`"><UInput v-model="translationFields.neighborhood" size="xl" class="w-full" /></UFormField>
              <UFormField :label="`Address (${translationLocale})`"><UTextarea v-model="translationFields.address" :rows="4" class="w-full" /></UFormField>
              <UFormField :label="`Opening hours (${translationLocale}, one per line)`"><UTextarea v-model="translationFields.opening_hours_text" :rows="4" class="w-full" /></UFormField>
              <UFormField :label="`SEO title (${translationLocale})`"><UInput v-model="translationFields.seo_title" size="xl" class="w-full" /></UFormField>
              <UFormField :label="`SEO description (${translationLocale})`"><UTextarea v-model="translationFields.seo_description" :rows="3" class="w-full" /></UFormField>
              <p v-if="translationError" class="text-sm text-error">{{ translationError }}</p>
              <UButton :loading="translationSaving" label="Save translation" @click="saveTranslation" />
            </template>
          </div>

          <div v-else-if="editorKey === 'hours'" class="space-y-6">
            <p class="text-base text-muted">Set the regular hours shown to guests. A Google Places sync replaces these hours with Google's current record.</p>
            <div class="divide-y divide-default rounded-xl border border-default">
              <div v-for="day in openingHours" :key="day.day" class="space-y-3 p-4">
                <div class="flex items-center justify-between gap-4">
                  <p class="font-medium text-highlighted">{{ day.day }}</p>
                  <UCheckbox :model-value="!day.isOpen" label="Closed" @update:model-value="setDayClosed(day.day, $event)" />
                </div>
                <div v-if="day.isOpen" class="grid grid-cols-2 gap-3">
                  <UFormField label="Open"><UInput :model-value="day.openTime" type="time" class="w-full" @update:model-value="updateDayTime(day.day, 'openTime', $event)" /></UFormField>
                  <UFormField label="Close"><UInput :model-value="day.closeTime" type="time" class="w-full" @update:model-value="updateDayTime(day.day, 'closeTime', $event)" /></UFormField>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="editorKey === 'content'" class="space-y-6">
            <p class="text-base text-muted">Location-specific copy used on the published site.</p>
            <UFormField label="Short description"><UInput v-model="detailsForm.short_description" size="xl" class="w-full" /></UFormField>
            <UFormField label="Description"><UTextarea v-model="detailsForm.description" :rows="10" class="w-full" /></UFormField>
            <UFormField label="Price level"><UInput v-model="detailsForm.price_level" size="xl" class="w-full" /></UFormField>
          </div>

          <div v-else-if="editorKey === 'discovery'" class="space-y-6">
            <p class="text-base text-muted">Connect the canonical Google place record used to import address, hours, ratings and reviews.</p>
            <UCard variant="subtle">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="font-semibold text-highlighted">Google Places</p>
                  <p class="mt-1 text-sm text-muted">{{ location.google_place_id ? `Last imported: ${location.last_synced_at || 'never'}` : 'Not connected' }}</p>
                </div>
                <UBadge :color="location.google_place_id ? 'success' : 'neutral'" variant="soft">{{ location.google_place_id ? 'Connected' : 'Not connected' }}</UBadge>
              </div>
              <dl v-if="location.google_place_id" class="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div><dt class="text-muted">Rating</dt><dd class="mt-1 font-medium text-highlighted">{{ location.rating ?? 'Not available' }}</dd></div>
                <div><dt class="text-muted">Reviews</dt><dd class="mt-1 font-medium text-highlighted">{{ location.review_count ?? 'Not available' }}</dd></div>
              </dl>
              <UButton class="mt-5" icon="i-simple-icons-googlemaps" color="neutral" variant="outline" :disabled="!location.google_place_id" :loading="syncingPlace" block @click="syncGooglePlace">Sync Google Places</UButton>
              <p v-if="placeSyncResult" class="mt-3 text-sm text-success">{{ placeSyncResult }}</p>
            </UCard>
            <UFormField label="Google Place ID"><UInput v-model="detailsForm.google_place_id" size="xl" class="w-full" /></UFormField>
            <UFormField label="Maps URL"><UInput v-model="detailsForm.maps_url" type="url" size="xl" class="w-full" /></UFormField>
            <UFormField label="Google review URL"><UInput v-model="detailsForm.google_review_url" type="url" size="xl" class="w-full" /></UFormField>
          </div>

          <div v-else-if="editorKey === 'notifications'" class="space-y-6">
            <p class="text-base text-muted">Internal alert routing for this location. These values are not shown to guests.</p>
            <UFormField label="WhatsApp notification phone" help="Use international format, for example +66812345678.">
              <UInput v-model="detailsForm.notification_phone" type="tel" placeholder="+66..." size="xl" class="w-full" />
            </UFormField>
            <UFormField label="Timezone">
              <USelectMenu v-model="detailsForm.timezone" :items="timezoneOptions" placeholder="Select timezone" size="xl" class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="editorKey === 'features'" class="space-y-6">
            <p class="text-base text-muted">Choose which site modules are available at this location.</p>
            <div v-if="locationToggleableFeatures.length" class="space-y-3">
              <UCard v-for="feature in locationToggleableFeatures" :key="feature" variant="subtle">
              <UCheckbox v-model="locationEnabledFeatureSet[feature]" :label="locationFeatureLabel(feature)" />
              </UCard>
            </div>
            <p v-else class="text-sm text-muted">No location-specific modules are enabled for this site.</p>
          </div>

          <UAlert v-if="validationMessage" class="mt-6" color="error" variant="soft" :description="validationMessage" />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>
<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
const dashboardApi = useDashboardApi()
import { TIMEZONE_OPTIONS } from '~/utils/timezone'
import { getErrorMessage } from '~/utils/errors'
import { toggleableModulesForScope, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

const LOCATION_FEATURE_LABELS = {
  menu: 'Menu',
  reservations: 'Reservations',
  ordering: 'Online ordering',
  experiences: 'Experiences',
} as const

function locationFeatureLabel(feature: ProductFeature): string {
  if (!(feature in LOCATION_FEATURE_LABELS)) throw new Error(`Unsupported location feature: ${feature}`)
  return LOCATION_FEATURE_LABELS[feature as keyof typeof LOCATION_FEATURE_LABELS]
}

interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: { addressLines?: string[] } | null
  city: string | null
  neighborhood: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  maps_url: string | null
  google_review_url: string | null
  description: string | null
  short_description: string | null
  price_level: string | null
  google_place_id: string | null
  opening_hours: { weekdayDescriptions?: string[] } | null
  rating: number | null
  review_count: number | null
  is_primary: boolean
  status: string
  last_synced_at: string | null
  notification_phone?: string | null
  timezone?: string | null
}

interface DayHours {
  day: string
  isOpen: boolean
  openTime: string
  closeTime: string
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const locationPath = computed(() => `${sitePath.value}/locations/${String(route.params.locationSlug)}`)
const settingsPath = computed(() => `${locationPath.value}/settings`)

// Up one level: out of a section back to the settings index, out of the index
// back to the location overview.
const backTo = computed(() => hasDetail.value ? settingsPath.value : locationPath.value)
const backLabel = computed(() => hasDetail.value ? 'Location settings' : 'Location')
const routeSegments = computed(() => {
  const raw = route.params.segments
  if (Array.isArray(raw)) return raw.map(String)
  return raw ? [String(raw)] : []
})
const detailKey = computed(() => routeSegments.value[0] ?? null)
const editorKey = computed(() => detailKey.value ?? 'profile')
const validDetailKeys = new Set(['profile', 'hours', 'content', 'discovery', 'notifications', 'features', 'translations'])
if (routeSegments.value.length > 1 || (detailKey.value && !validDetailKeys.has(detailKey.value))) {
  throw createError({ statusCode: 404, statusMessage: 'Location setting not found' })
}

const loading = ref(true)
const error = ref<string | null>(null)
const location = ref<BusinessLocation | null>(null)
const syncingPlace = ref(false)
const savingLocationFeatures = ref(false)
const originalSignature = ref('')
const locationEnabledFeatureSet = reactive<Partial<Record<ProductFeature, boolean>>>({})
// The baseline for diffing a checkbox change is always the parent SITE's effective feature set
// (never this location's own current state) — re-enabling a module back to what the site already
// supports must collapse the stored override to null, not an equivalent-but-redundant explicit
// delta. Both come straight from the location GET/PATCH response (server/utils/location-management.ts's
// resolveLocationCapabilitySummary) rather than being recomputed client-side.
const siteEffectiveFeatures = ref<ProductFeature[]>([])
const locationEffectiveFeatures = ref<ProductFeature[]>([])

const locationToggleableFeatures = computed<ProductFeature[]>(() => {
  const site = dashboard.site.value
  if (!site?.vertical) return []
  const template = resolvePublicTemplate({ vertical: site.vertical as SiteVertical }).slug
  const configurableHere = new Set(toggleableModulesForScope(template, 'location'))
  return siteEffectiveFeatures.value.filter(feature => configurableHere.has(feature))
})

interface LocationCapabilitySummary {
  site_effective_features?: ProductFeature[]
  location_effective_features?: ProductFeature[]
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isBusinessLocation = (value: unknown): value is BusinessLocation => {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.slug === 'string'
    && typeof value.title === 'string'
    && typeof value.is_primary === 'boolean'
    && typeof value.status === 'string'
    && isNullableString(value.city)
    && isNullableString(value.phone)
    && isNullableString(value.google_place_id)
}
const isCapabilitySummary = (value: unknown): value is LocationCapabilitySummary =>
  isRecord(value)
  && (value.site_effective_features === undefined
    || (Array.isArray(value.site_effective_features) && value.site_effective_features.every(item => typeof item === 'string')))
  && (value.location_effective_features === undefined
    || (Array.isArray(value.location_effective_features) && value.location_effective_features.every(item => typeof item === 'string')))
const isLocationResponse = (value: unknown): value is { success: true; location: BusinessLocation } & LocationCapabilitySummary =>
  isRecord(value) && value.success === true && isBusinessLocation(value.location) && isCapabilitySummary(value)
function fillLocationFeatures(summary: LocationCapabilitySummary) {
  siteEffectiveFeatures.value = summary.site_effective_features ?? []
  locationEffectiveFeatures.value = summary.location_effective_features ?? []
  const enabled = new Set(locationEffectiveFeatures.value)
  // Only ever read through locationToggleableFeatures (see the template's v-for and
  // saveLocationFeatures' filter), so a stale key from a previous load is harmless.
  for (const feature of locationToggleableFeatures.value) locationEnabledFeatureSet[feature] = enabled.has(feature)
}

async function saveLocationFeatures() {
  const requestedLocationId = locationId.value
  savingLocationFeatures.value = true
  try {
    // Delta against the SITE's effective set, not this location's prior state (see
    // siteEffectiveFeatures' doc comment) — collapses to `null` when the checked set exactly
    // matches what the site already supports. `enabled` is structurally always [] today:
    // locationToggleableFeatures is itself filtered from siteEffectiveFeatures (see its own
    // computed above), so every feature checked here already satisfies `siteSet.has(feature)`.
    // Kept as a real filter (not hardcoded to []) so this stays correct if that upstream
    // computed ever changes — don't "simplify" this away without re-checking that invariant.
    const siteSet = new Set(siteEffectiveFeatures.value)
    const enabled = locationToggleableFeatures.value.filter(feature => locationEnabledFeatureSet[feature] && !siteSet.has(feature))
    const disabled = locationToggleableFeatures.value.filter(feature => siteSet.has(feature) && !locationEnabledFeatureSet[feature])
    const featureOverrides = enabled.length === 0 && disabled.length === 0 ? null : { enabled, disabled }
    const response = await dashboardApi<{ success: boolean; location: BusinessLocation } & LocationCapabilitySummary>(`/api/dashboard/locations/${requestedLocationId}`, {
      method: 'PATCH',
      body: { feature_overrides: featureOverrides },
      validate: isLocationResponse,
    })
    if (locationId.value !== requestedLocationId) return
    location.value = response.location
    fillLocationFeatures(response)
    originalSignature.value = editorSignature(editorKey.value)
    toast.add({ description: 'Availability saved', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save availability'), color: 'error' })
  } finally {
    savingLocationFeatures.value = false
  }
}
const placeSyncResult = ref('')
const detailsSaving = ref(false)

const detailsForm = reactive({
  title: '',
  slug: '',
  city: '',
  neighborhood: '',
  phone: '',
  email: '',
  website_url: '',
  maps_url: '',
  google_review_url: '',
  google_place_id: '',
  price_level: '',
  address: '',
  short_description: '',
  description: '',
  is_primary: false,
  status: 'active',
  notification_phone: '',
  timezone: '',
})

const timezoneOptions = TIMEZONE_OPTIONS

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const openingHours = ref<DayHours[]>(WEEKDAYS.map(day => ({
  day,
  isOpen: true,
  openTime: '09:00',
  closeTime: '22:00'
})))

function fillDetailsForm(loc: BusinessLocation) {
  detailsForm.title = loc.title
  detailsForm.slug = loc.slug
  detailsForm.city = loc.city ?? ''
  detailsForm.neighborhood = loc.neighborhood ?? ''
  detailsForm.phone = loc.phone ?? ''
  detailsForm.email = loc.email ?? ''
  detailsForm.website_url = loc.website_url ?? ''
  detailsForm.maps_url = loc.maps_url ?? ''
  detailsForm.google_review_url = loc.google_review_url ?? ''
  detailsForm.google_place_id = loc.google_place_id ?? ''
  detailsForm.price_level = loc.price_level ?? ''
  detailsForm.address = loc.address?.addressLines?.join('\n') ?? ''
  detailsForm.short_description = loc.short_description ?? ''
  detailsForm.description = loc.description ?? ''
  openingHours.value = parseOpeningHours(loc.opening_hours?.weekdayDescriptions)
  detailsForm.is_primary = loc.is_primary
  detailsForm.status = loc.status
  detailsForm.notification_phone = loc.notification_phone ?? ''
  detailsForm.timezone = loc.timezone ?? ''
}

const twelveHourToTwentyFourHour = (value: string): string | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i)
  if (!match) return null
  const rawHour = Number(match[1])
  const minute = match[2]
  const period = match[3]!.toUpperCase()
  if (rawHour < 1 || rawHour > 12) return null
  let hour = rawHour % 12
  if (period === 'PM') hour += 12
  return `${String(hour).padStart(2, '0')}:${minute}`
}

const twentyFourHourToTwelveHour = (value: string): string => {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  if (!match) return '9:00 AM'
  const hour24 = Number(match[1])
  const minute = match[2]
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${minute} ${period}`
}

const parseOpeningHours = (weekdayDescriptions?: string[]): DayHours[] => {
  const defaults = WEEKDAYS.map(day => ({
    day,
    isOpen: true,
    openTime: '09:00',
    closeTime: '22:00'
  }))

  if (!weekdayDescriptions?.length) return defaults

  const byDay = new Map(defaults.map(item => [item.day, { ...item }]))

  for (const line of weekdayDescriptions) {
    const separatorIndex = String(line).indexOf(':')
    if (separatorIndex === -1) continue
    const rawDay = String(line).slice(0, separatorIndex)
    const rawValue = String(line).slice(separatorIndex + 1)
    const day = rawDay?.trim() as typeof WEEKDAYS[number] | undefined
    const value = rawValue?.trim() ?? ''
    if (!day || !byDay.has(day)) continue

    const current = byDay.get(day)
    if (!current) continue

    if (/^closed$/i.test(value)) {
      current.isOpen = false
      continue
    }

    if (/^open\s*24\s*hours$/i.test(value)) {
      current.isOpen = true
      current.openTime = '00:00'
      current.closeTime = '23:59'
      continue
    }

    const rangeMatch = value.match(/^(\d{1,2}:\d{2}\s*[AP]M)\s*[\-–]\s*(\d{1,2}:\d{2}\s*[AP]M)$/i)
    if (!rangeMatch) continue

    const openTime = twelveHourToTwentyFourHour(rangeMatch[1]!)
    const closeTime = twelveHourToTwentyFourHour(rangeMatch[2]!)
    if (!openTime || !closeTime) continue

    current.isOpen = true
    current.openTime = openTime
    current.closeTime = closeTime
  }

  return WEEKDAYS.map(day => byDay.get(day) || {
    day,
    isOpen: true,
    openTime: '09:00',
    closeTime: '22:00'
  })
}

const buildWeekdayDescriptions = (hours: DayHours[]): string[] => {
  return hours.map((day) => {
    if (!day.isOpen) return `${day.day}: Closed`
    if (day.openTime === '00:00' && day.closeTime === '23:59') return `${day.day}: Open 24 hours`
    return `${day.day}: ${twentyFourHourToTwelveHour(day.openTime)} - ${twentyFourHourToTwelveHour(day.closeTime)}`
  })
}

const setDayClosed = (dayName: string, value: boolean | 'indeterminate') => {
  if (value === 'indeterminate') return
  const day = openingHours.value.find(item => item.day === dayName)
  if (!day) return
  day.isOpen = !value
}

const updateDayTime = (dayName: string, field: 'openTime' | 'closeTime', value: string | number) => {
  const day = openingHours.value.find(item => item.day === dayName)
  if (!day) return
  day[field] = typeof value === 'string' ? value : String(value)
}

const setDetailsActive = (v: boolean | 'indeterminate') => {
  if (v === 'indeterminate') return
  detailsForm.status = v ? 'active' : 'inactive'
}

const addressSummary = computed(() => location.value?.address?.addressLines?.join(', ') || location.value?.city || 'Not set')
const hoursSummary = computed(() => {
  const descriptions = location.value?.opening_hours?.weekdayDescriptions ?? []
  const openDays = descriptions.filter(line => !/closed/i.test(line)).length
  return descriptions.length ? `${openDays} days open each week` : 'Not set'
})
const contentSummary = computed(() => location.value?.short_description?.trim() || location.value?.description?.trim() || 'Not set')
const discoverySummary = computed(() => location.value?.google_place_id ? 'Google Places connected' : 'Not connected')
const notificationSummary = computed(() => location.value?.notification_phone || location.value?.timezone || 'Not configured')
const featureSummary = computed(() => {
  const count = locationToggleableFeatures.value.filter(feature => locationEnabledFeatureSet[feature]).length
  return count ? `${count} ${count === 1 ? 'module' : 'modules'} available` : 'No location modules'
})
const navigationItems = computed(() => [
  { id: 'profile', label: 'Profile', summary: addressSummary.value, icon: 'i-lucide-map-pin', to: `${settingsPath.value}/profile` },
  { id: 'hours', label: 'Hours', summary: hoursSummary.value, icon: 'i-lucide-clock-3', to: `${settingsPath.value}/hours` },
  { id: 'content', label: 'Public content', summary: contentSummary.value, icon: 'i-lucide-align-left', to: `${settingsPath.value}/content` },
  { id: 'discovery', label: 'Discovery', summary: discoverySummary.value, icon: 'i-simple-icons-googlemaps', to: `${settingsPath.value}/discovery` },
  { id: 'notifications', label: 'Notifications', summary: notificationSummary.value, icon: 'i-lucide-bell', to: `${settingsPath.value}/notifications` },
  { id: 'features', label: 'Available features', summary: featureSummary.value, icon: 'i-lucide-layout-grid', to: `${settingsPath.value}/features` },
  { id: 'translations', label: 'Translations', summary: '', icon: 'i-lucide-languages', to: `${settingsPath.value}/translations` },
])
const navigationGroups = computed(() => [
  { id: 'location', label: 'Location', items: navigationItems.value.slice(0, 2) },
  { id: 'guest-facing', label: 'Guest-facing details', items: navigationItems.value.slice(2, 4) },
  { id: 'operations', label: 'Operations', items: navigationItems.value.slice(4) },
])
const detailTitles: Record<string, string> = {
  profile: 'Profile',
  hours: 'Hours',
  content: 'Public content',
  discovery: 'Discovery',
  notifications: 'Notifications',
  features: 'Available features',
  translations: 'Translations',
}
const hasDetail = computed(() => detailKey.value !== null)
const navbarTitle = computed(() => detailKey.value ? detailTitles[detailKey.value] : location.value?.title || 'Location')
const saving = computed(() => detailsSaving.value || savingLocationFeatures.value)

function editorSignature(key: string | null): string {
  switch (key) {
    case 'profile': return JSON.stringify([
      detailsForm.title, detailsForm.slug, detailsForm.city, detailsForm.neighborhood,
      detailsForm.phone, detailsForm.email, detailsForm.website_url, detailsForm.address,
      detailsForm.is_primary, detailsForm.status,
    ])
    case 'hours': return JSON.stringify(openingHours.value)
    case 'content': return JSON.stringify([detailsForm.short_description, detailsForm.description, detailsForm.price_level])
    case 'discovery': return JSON.stringify([detailsForm.google_place_id, detailsForm.maps_url, detailsForm.google_review_url])
    case 'notifications': return JSON.stringify([detailsForm.notification_phone, detailsForm.timezone])
    case 'features': return JSON.stringify(locationToggleableFeatures.value.map(feature => [feature, Boolean(locationEnabledFeatureSet[feature])]))
    default: return ''
  }
}
function isValidUrl(value: string): boolean {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
const validationMessage = computed(() => {
  if (editorKey.value === 'profile') {
    if (!detailsForm.title.trim()) return 'Enter a location name.'
    if (!detailsForm.slug.trim()) return 'Enter a location slug.'
    if (detailsForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detailsForm.email)) return 'Enter a valid email address.'
    if (!isValidUrl(detailsForm.website_url)) return 'Enter a complete website URL.'
  }
  if (editorKey.value === 'discovery' && ![detailsForm.maps_url, detailsForm.google_review_url].every(isValidUrl)) {
    return 'Enter complete Google Maps and review URLs.'
  }
  return null
})
const dirty = computed(() => editorSignature(editorKey.value) !== originalSignature.value)
const saveDisabled = computed(() => {
  if (editorKey.value === 'translations') return translationLocaleOptions.value.length === 0
  return !dirty.value || validationMessage.value !== null
})

// Translations panel: a separate localization layer over the same
// business_location resource, edited through the canonical per-resource
// localization API (server/utils/localization.ts) rather than the
// English-only PATCH endpoint used by the panels above.
const translationLocale = ref('')
const translationLocales = ref<string[]>([])
const translationLocaleOptions = computed(() => translationLocales.value)
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
const translationFields = reactive({ title: '', short_description: '', description: '', city: '', neighborhood: '', address: '', opening_hours_text: '', seo_title: '', seo_description: '' })
function isTranslationLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadTranslationLocales() {
  try {
    const response = await dashboardApi<{ languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> }>(
      `/api/editor/sites/${siteId}/locales`,
      { validate: isTranslationLocalesResponse },
    )
    translationLocales.value = response.languages
      .filter(item => item.locale_status === 'published' && !item.is_source)
      .map(item => item.locale)
    if (translationLocales.value.length && !translationLocale.value) translationLocale.value = translationLocales.value[0]!
  } catch (cause) {
    translationLocales.value = []
    translationError.value = getErrorMessage(cause, 'Failed to load site languages')
  }
}
function isTranslationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}
async function loadTranslationFields() {
  if (!translationLocale.value || !locationId.value) return
  translationError.value = null
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/business_location/${locationId.value}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isTranslationResponse },
    )
    const values = response.localization.values
    translationFields.title = typeof values.title === 'string' ? values.title : ''
    translationFields.short_description = typeof values.short_description === 'string' ? values.short_description : ''
    translationFields.description = typeof values.description === 'string' ? values.description : ''
    translationFields.city = typeof values.city === 'string' ? values.city : ''
    translationFields.neighborhood = typeof values.neighborhood === 'string' ? values.neighborhood : ''
    translationFields.address = typeof values.address === 'string' ? values.address : ''
    translationFields.opening_hours_text = Array.isArray(values.opening_hours) ? values.opening_hours.join('\n') : ''
    translationFields.seo_title = typeof values.seo_title === 'string' ? values.seo_title : ''
    translationFields.seo_description = typeof values.seo_description === 'string' ? values.seo_description : ''
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) translationError.value = getErrorMessage(cause, 'Failed to load translation')
    translationFields.title = ''; translationFields.short_description = ''; translationFields.description = ''
    translationFields.city = ''; translationFields.neighborhood = ''; translationFields.address = ''
    translationFields.opening_hours_text = ''; translationFields.seo_title = ''; translationFields.seo_description = ''
  }
}
watch(translationLocale, () => { void loadTranslationFields() })
async function saveTranslation() {
  if (!locationId.value || !translationLocale.value) return
  translationSaving.value = true; translationError.value = null
  try {
    const values: Record<string, string> = {}
    if (translationFields.title.trim()) values.title = translationFields.title.trim()
    if (translationFields.short_description.trim()) values.short_description = translationFields.short_description.trim()
    if (translationFields.description.trim()) values.description = translationFields.description.trim()
    if (translationFields.city.trim()) values.city = translationFields.city.trim()
    if (translationFields.neighborhood.trim()) values.neighborhood = translationFields.neighborhood.trim()
    if (translationFields.address.trim()) values.address = translationFields.address.trim()
    if (translationFields.seo_title.trim()) values.seo_title = translationFields.seo_title.trim()
    if (translationFields.seo_description.trim()) values.seo_description = translationFields.seo_description.trim()
    const openingHoursValues: Record<string, unknown> = {}
    const openingHoursLines = translationFields.opening_hours_text.split('\n').map(line => line.trim()).filter(Boolean)
    if (openingHoursLines.length) openingHoursValues.opening_hours = openingHoursLines
    await dashboardApi(`/api/editor/sites/${siteId}/localization/business_location/${locationId.value}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values: { ...values, ...openingHoursValues }, route_path: `/${translationLocale.value}/locations/${detailsForm.slug || String(route.params.locationSlug)}` },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    translationError.value = getErrorMessage(cause, 'Failed to save translation')
  } finally {
    translationSaving.value = false
  }
}
void loadTranslationLocales()

function resetDraft() {
  if (!location.value) return
  fillDetailsForm(location.value)
  fillLocationFeatures({
    site_effective_features: siteEffectiveFeatures.value,
    location_effective_features: locationEffectiveFeatures.value,
  })
  originalSignature.value = editorSignature(editorKey.value)
}
function cancelEditor() {
  resetDraft()
  router.push(settingsPath.value)
}
// Leaving a section resets its editor. This used to hang off the back button's
// click handler, which left browser back with stale editor state.
watch(() => route.path, (next, previous) => {
  if (previous && previous !== next) cancelEditor()
})

async function patchLocation(body: Record<string, unknown>, successMessage: string) {
  const requestedLocationId = locationId.value
  detailsSaving.value = true
  try {
    const response = await dashboardApi<{ success: true; location: BusinessLocation } & LocationCapabilitySummary>(
      `/api/dashboard/locations/${requestedLocationId}`,
      { method: 'PATCH', body, validate: isLocationResponse },
    )
    if (locationId.value !== requestedLocationId) return
    const previousSlug = String(route.params.locationSlug)
    location.value = response.location
    fillLocationFeatures(response)
    fillDetailsForm(response.location)
    originalSignature.value = editorSignature(editorKey.value)
    toast.add({ description: successMessage, color: 'success' })
    if (response.location.slug !== previousSlug) {
      await dashboard.refresh()
      const detailSuffix = detailKey.value ? `/${detailKey.value}` : ''
      await router.replace(`/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${response.location.slug}/settings${detailSuffix}`)
    }
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save location'), color: 'error' })
  } finally {
    detailsSaving.value = false
  }
}

async function saveCurrentEditor() {
  if (saveDisabled.value) return
  if (editorKey.value === 'translations') {
    await saveTranslation()
    return
  }
  if (editorKey.value === 'features') {
    await saveLocationFeatures()
    return
  }
  if (editorKey.value === 'profile') {
    await patchLocation({
      title: detailsForm.title.trim(),
      slug: detailsForm.slug.trim(),
      city: detailsForm.city.trim() || null,
      neighborhood: detailsForm.neighborhood.trim() || null,
      phone: detailsForm.phone.trim() || null,
      email: detailsForm.email.trim() || null,
      website_url: detailsForm.website_url.trim() || null,
      address: detailsForm.address.trim()
        ? { addressLines: detailsForm.address.split('\n').map(line => line.trim()).filter(Boolean) }
        : null,
      is_primary: detailsForm.is_primary,
      status: detailsForm.status,
    }, 'Profile saved')
    return
  }
  if (editorKey.value === 'hours') {
    await patchLocation({ opening_hours: { weekdayDescriptions: buildWeekdayDescriptions(openingHours.value) } }, 'Hours saved')
    return
  }
  if (editorKey.value === 'content') {
    await patchLocation({
      short_description: detailsForm.short_description.trim() || null,
      description: detailsForm.description.trim() || null,
      price_level: detailsForm.price_level.trim() || null,
    }, 'Public content saved')
    return
  }
  if (editorKey.value === 'discovery') {
    await patchLocation({
      google_place_id: detailsForm.google_place_id.trim() || null,
      maps_url: detailsForm.maps_url.trim() || null,
      google_review_url: detailsForm.google_review_url.trim() || null,
    }, 'Discovery settings saved')
    return
  }
  await patchLocation({
    notification_phone: detailsForm.notification_phone.trim() || null,
    timezone: detailsForm.timezone || null,
  }, 'Notifications saved')
}


async function syncGooglePlace() {
  if (!location.value?.google_place_id) return
  const requestedLocationId = locationId.value
  syncingPlace.value = true
  try {
    const res = await dashboardApi<{ success: boolean; reviewsUpserted: number; place: { rating: number | null; ratingCount: number | null } }>(
      '/api/integrations/google-places/sync',
      {
        method: 'POST',
        body: { locationId: requestedLocationId },
        validate: (value): value is { success: boolean; reviewsUpserted: number; place: { rating: number | null; ratingCount: number | null } } =>
          isRecord(value)
          && value.success === true
          && typeof value.reviewsUpserted === 'number'
          && isRecord(value.place)
          && (value.place.rating === null || typeof value.place.rating === 'number')
          && (value.place.ratingCount === null || typeof value.place.ratingCount === 'number'),
      }
    )
    if (locationId.value !== requestedLocationId) return
    const parts = ['Synced hours, address, and rating']
    if (res.reviewsUpserted > 0) parts.push(`${res.reviewsUpserted} new review${res.reviewsUpserted > 1 ? 's' : ''}`)
    if (res.place.rating) parts.push(`${res.place.rating} stars (${res.place.ratingCount?.toLocaleString()} reviews)`)
    placeSyncResult.value = parts.join(', ')
    toast.add({ title: 'Synced', description: placeSyncResult.value, color: 'success' })
    await loadLocationWorkspace()
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Google Places sync failed'), color: 'error' })
  } finally {
    syncingPlace.value = false
  }
}

interface LocationSettingsResource {
  location: { success: true; location: BusinessLocation } & LocationCapabilitySummary
}

const requestEvent = useRequestEvent()
const locationSettingsKey = computed(() => `dashboard-location-settings-${siteId}-${locationId.value}`)
const {
  data: locationSettingsResource,
  pending: locationSettingsPending,
  error: locationSettingsError,
  refresh: refreshLocationWorkspace,
} = await useAsyncData<LocationSettingsResource>(locationSettingsKey, async () => {
  const requestedLocationId = locationId.value
  if (!requestedLocationId) throw createError({ statusCode: 400, statusMessage: 'Location is required' })
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request event unavailable' })
    const { loadDashboardLocationSettings } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardLocationSettings(requestEvent, siteId, requestedLocationId)
  }
  const locationResponse = await dashboardApi<{ success: true; location: BusinessLocation } & LocationCapabilitySummary>(
    `/api/dashboard/locations/${requestedLocationId}`,
    { validate: isLocationResponse },
  )
  return { location: locationResponse }
}, {
  watch: [locationId],
})

watch(
  [locationSettingsResource, locationSettingsPending, locationSettingsError],
  ([resource, pending, resourceError]) => {
    loading.value = pending
    error.value = resourceError
      ? getErrorMessage(resourceError, 'Failed to load location')
      : null
    if (!resource) return
    location.value = resource.location.location
    fillLocationFeatures(resource.location)
    fillDetailsForm(resource.location.location)
    originalSignature.value = editorSignature(editorKey.value)
  },
  { immediate: true },
)

watch(detailKey, () => resetDraft())

const loadLocationWorkspace = async () => {
  await refreshLocationWorkspace()
  return !locationSettingsError.value
}

useSeoMeta({ title: 'Location Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
