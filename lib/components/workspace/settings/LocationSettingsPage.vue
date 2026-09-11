<template>
  <UDashboardPanel
    id="location-settings"
    :ui="{ body: 'min-h-0 !gap-0 !overflow-hidden !p-0 sm:!p-0' }"
  >
    <template #header>
      <UDashboardNavbar :title="navbarTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="levelBackTo" label="Location" />
        </template>
        <template #right>
          <DashboardResourceLocalization
            v-if="location"
            :site-id="siteId"
            resource-type="business_location"
            :resource-id="location.id"
            resource-label="location"
            :fields="locationLocalizationFields"
            :route-path="localizedLocationPath"
            :language-settings-path="siteLocalizationSettingsPath"
          />
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
        :detail-title="detailTitles[editorKey]"
        :dismiss-to="settingsPath"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="detailKey" />
        </template>

        <template #detail>
          <UFormField v-if="editorKey === 'name'" label="Name" required>
            <UInput v-model="detailsForm.title" size="xl" autofocus class="w-full" />
          </UFormField>

          <UFormField
            v-else-if="editorKey === 'slug'"
            label="Slug"
            description="The location's segment in its public URL."
          >
            <UInput v-model="detailsForm.slug" size="xl" autofocus class="w-full" />
          </UFormField>

          <div v-else-if="editorKey === 'address'" class="space-y-6">
            <p class="text-base text-muted">Where guests find this location.</p>
            <UFormField label="Address"><UTextarea v-model="detailsForm.address" :rows="4" autofocus class="w-full" /></UFormField>
            <UFormField label="City"><UInput v-model="detailsForm.city" size="xl" class="w-full" /></UFormField>
            <UFormField label="Neighbourhood"><UInput v-model="detailsForm.neighborhood" size="xl" class="w-full" /></UFormField>
          </div>

          <div v-else-if="editorKey === 'contact'" class="space-y-6">
            <p class="text-base text-muted">How guests reach this location.</p>
            <UFormField label="Phone"><UInput v-model="detailsForm.phone" type="tel" size="xl" autofocus class="w-full" /></UFormField>
            <UFormField label="Email"><UInput v-model="detailsForm.email" type="email" size="xl" class="w-full" /></UFormField>
            <UFormField label="Website URL"><UInput v-model="detailsForm.website_url" type="url" size="xl" class="w-full" /></UFormField>
          </div>

          <div v-else-if="editorKey === 'status'" class="space-y-6">
            <p class="text-base text-muted">An inactive location is hidden from the public site.</p>
            <UCheckbox :model-value="detailsForm.status === 'active'" label="Active" @update:model-value="setDetailsActive" />
          </div>


          <div v-else-if="editorKey === 'hours'" class="space-y-6">
            <p class="text-base text-muted">Set the regular hours shown to guests. A Google Places sync replaces these hours with Google's current record.</p>
            <LocationHoursCard v-model:form="hoursForm" exceptions />
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
          </div>

          <div v-else-if="editorKey === 'reservations'" class="space-y-6">
            <p class="text-base text-muted">
              Reservations are open at this location while a policy exists here. Every rule you
              state below is a sentence guests read before they book; a rule left unchecked is not
              stated at all.
            </p>
            <UAlert
              v-if="!reservationConfigExists"
              color="neutral"
              variant="soft"
              icon="i-lucide-calendar-off"
              description="This location does not take reservations yet. Saving a policy opens them."
            />
            <ReservationPolicyForm v-model="reservationForm" />
            <UButton
              v-if="reservationConfigExists"
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              :loading="closingReservations"
              @click="closeReservations"
            >
              Stop taking reservations here
            </UButton>
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
import LocationHoursCard, { type LocationHoursForm } from '~/lib/components/workspace/location/LocationHoursCard.vue'
import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'

import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import ReservationPolicyForm from '~/components/dashboard/ReservationPolicyForm.vue'
import type { LocationReservationConfig, LocationReservationConfigPatch } from '~/server/utils/reservations'
const dashboardApi = useDashboardApi()
import { getErrorMessage } from '~/utils/errors'
import { defaultModuleFeaturesForVertical, resolveCmsCapabilities, toggleableModulesForScope, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'


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
  opening_hours: OpeningHours
  special_hours: SpecialHours
  rating: number | null
  review_count: number | null
  status: string
  last_synced_at: string | null
  notification_phone?: string | null
  timezone?: string | null
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const locationPath = computed(() => `${sitePath.value}/locations/${String(route.params.locationSlug)}`)
const settingsPath = computed(() => `${locationPath.value}/settings`)
// `useEditorFrame` provides and injects, so it runs before any `await`, and it
// owns the split of the route below this level. The `route.params.segments`
// derivation this replaces was a second copy of the composable's `rest`.
const frame = useEditorFrame(settingsPath)

const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value)

// Up one level: out of a section back to the settings index, out of the index
// back to the location overview.
// The navbar leaves the level for the location overview. The open section's own
// way out is the sheet's close control, which lands on the settings index — the
// index that is already beside it at `lg`.
const levelBackTo = computed(() => locationPath.value)
const routeSegments = frame.rest
const detailKey = computed(() => routeSegments.value[0] ?? null)
const editorKey = computed(() => detailKey.value ?? 'name')
const validDetailKeys = new Set(['name', 'slug', 'address', 'contact', 'status', 'hours', 'content', 'discovery', 'notifications', 'reservations', 'features'])
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
  const template = resolvePublicTemplate({ themeId: site.theme_id, vertical: site.vertical as SiteVertical }).slug
  const configurableHere = new Set(toggleableModulesForScope(template, 'location'))
  return siteEffectiveFeatures.value.filter(feature => configurableHere.has(feature))
})

const locationFeatureLabels = computed<Map<ProductFeature, string>>(() => {
  const site = dashboard.site.value
  if (!site?.vertical) return new Map()
  const vertical = site.vertical as SiteVertical
  const template = resolvePublicTemplate({ themeId: site.theme_id, vertical }).slug
  const defaults = defaultModuleFeaturesForVertical(vertical)
  const effective = siteEffectiveFeatures.value
  const capabilities = resolveCmsCapabilities(vertical, template, {
    site: {
      enabled: effective.filter(feature => !defaults.includes(feature)),
      disabled: defaults.filter(feature => !effective.includes(feature)),
    },
  })
  return new Map(capabilities.managers.map(manager => [manager.id, manager.label]))
})

function locationFeatureLabel(feature: ProductFeature): string {
  const label = locationFeatureLabels.value.get(feature)
  if (!label) throw new Error(`No registry label for location module: ${feature}`)
  return label
}

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

// The reservation policy is its own row (location_reservation_configs), not a
// column on the location, so it loads and saves through its own endpoint. A
// null row means this location does not take reservations — the absence of the
// capability, not an empty policy.
const reservationConfig = ref<LocationReservationConfig | null>(null)
const reservationForm = ref<LocationReservationConfigPatch>({})
const reservationSaving = ref(false)
const closingReservations = ref(false)
const reservationConfigExists = computed(() => reservationConfig.value !== null)
const isReservationConfigResponse = (value: unknown): value is { success: true; config: LocationReservationConfig | null } =>
  isRecord(value) && value.success === true && (value.config === null || isRecord(value.config))

function reservationPatchFrom(config: LocationReservationConfig | null): LocationReservationConfigPatch {
  if (!config) return {}
  const { location_id: _locationId, organization_id: _organizationId, created_at: _createdAt, updated_at: _updatedAt, ...patch } = config
  return patch
}

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
  status: 'active',
  notification_phone: '',
})
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)
const locationLocalizationFields = computed(() => [
  { key: 'title', label: 'Name', source: location.value?.title },
  { key: 'short_description', label: 'Short description', source: location.value?.short_description },
  { key: 'description', label: 'Description', source: location.value?.description, multiline: true, rows: 6 },
  { key: 'city', label: 'City', source: location.value?.city },
  { key: 'neighborhood', label: 'Neighbourhood', source: location.value?.neighborhood },
  { key: 'address', label: 'Address', source: location.value?.address?.addressLines?.join('\n'), multiline: true, rows: 3 },
])
function localizedLocationPath(locale: string): string {
  const slug = location.value?.slug
  if (!slug) throw new Error('The location slug is unavailable.')
  return `/${locale}/locations/${slug}`
}


const hoursForm = ref<LocationHoursForm>({ timezone: '', hours: null, specialHours: null })

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
  hoursForm.value = { timezone: loc.timezone ?? '', hours: parseOpeningHours(loc.opening_hours), specialHours: parseSpecialHours(loc.special_hours) }
  detailsForm.status = loc.status
  detailsForm.notification_phone = loc.notification_phone ?? ''
  }

const setDetailsActive = (v: boolean | 'indeterminate') => {
  if (v === 'indeterminate') return
  detailsForm.status = v ? 'active' : 'inactive'
}

const addressSummary = computed(() => location.value?.address?.addressLines?.join(', ') || location.value?.city || 'Not set')
const nameSummary = computed(() => location.value?.title?.trim() || 'Not named yet')
const slugSummary = computed(() => location.value?.slug?.trim() || 'Not set')
const contactSummary = computed(() => location.value?.phone?.trim() || location.value?.email?.trim() || location.value?.website_url?.trim() || 'Not set')
const statusSummary = computed(() => location.value?.status === 'active' ? 'Active' : 'Hidden from the public site')
const hoursSummary = computed(() => location.value?.opening_hours === null ? 'Not set' : `${location.value?.opening_hours?.periods.length ?? 0} opening periods`)
const contentSummary = computed(() => location.value?.short_description?.trim() || location.value?.description?.trim() || 'Not set')
const discoverySummary = computed(() => location.value?.google_place_id ? 'Google Places connected' : 'Not connected')
const notificationSummary = computed(() => location.value?.notification_phone || 'Not configured')
const reservationSummary = computed(() => {
  const config = reservationConfig.value
  if (!config) return 'Not taking reservations'
  return config.slot_capacity === null ? 'Open, no seat limit' : `Open, ${config.slot_capacity} guests per slot`
})
const featureSummary = computed(() => {
  const count = locationToggleableFeatures.value.filter(feature => locationEnabledFeatureSet[feature]).length
  return count ? `${count} ${count === 1 ? 'module' : 'modules'} available` : 'No location modules'
})
const navigationItems = computed(() => [
  { id: 'name', label: 'Name', summary: nameSummary.value, icon: 'i-lucide-type', to: `${settingsPath.value}/name` },
  { id: 'slug', label: 'Slug', summary: slugSummary.value, icon: 'i-lucide-link', to: `${settingsPath.value}/slug` },
  { id: 'address', label: 'Address', summary: addressSummary.value, icon: 'i-lucide-map-pin', to: `${settingsPath.value}/address` },
  { id: 'contact', label: 'Contact', summary: contactSummary.value, icon: 'i-lucide-phone', to: `${settingsPath.value}/contact` },
  { id: 'status', label: 'Status', summary: statusSummary.value, icon: 'i-lucide-eye', to: `${settingsPath.value}/status` },
  { id: 'hours', label: 'Hours', summary: hoursSummary.value, icon: 'i-lucide-clock-3', to: `${settingsPath.value}/hours` },
  { id: 'content', label: 'Public content', summary: contentSummary.value, icon: 'i-lucide-align-left', to: `${settingsPath.value}/content` },
  { id: 'discovery', label: 'Discovery', summary: discoverySummary.value, icon: 'i-simple-icons-googlemaps', to: `${settingsPath.value}/discovery` },
  { id: 'notifications', label: 'Notifications', summary: notificationSummary.value, icon: 'i-lucide-bell', to: `${settingsPath.value}/notifications` },
  { id: 'reservations', label: 'Reservations', summary: reservationSummary.value, icon: 'i-lucide-calendar-check', to: `${settingsPath.value}/reservations` },
  { id: 'features', label: 'Available features', summary: featureSummary.value, icon: 'i-lucide-layout-grid', to: `${settingsPath.value}/features` },
])
const navigationGroups = computed(() => [
  { id: 'location', label: 'Location', items: navigationItems.value.slice(0, 6) },
  { id: 'guest-facing', label: 'Guest-facing details', items: navigationItems.value.slice(6, 8) },
  { id: 'operations', label: 'Operations', items: navigationItems.value.slice(8) },
])
const detailTitles: Record<string, string> = {
  name: 'Name',
  slug: 'Slug',
  address: 'Address',
  contact: 'Contact',
  status: 'Status',
  hours: 'Hours',
  content: 'Public content',
  discovery: 'Discovery',
  notifications: 'Notifications',
  reservations: 'Reservations',
  features: 'Available features',
}
const hasDetail = computed(() => routeSegments.value.length > 0)
// Names the level, not the open section: at `lg` the section's title is a
// heading on its own pane with the index still beside it.
const navbarTitle = computed(() => location.value?.title || 'Location')
const saving = computed(() => detailsSaving.value || savingLocationFeatures.value || reservationSaving.value)

function editorSignature(key: string | null): string {
  switch (key) {
    case 'name': return JSON.stringify(detailsForm.title)
    case 'slug': return JSON.stringify(detailsForm.slug)
    case 'address': return JSON.stringify([detailsForm.address, detailsForm.city, detailsForm.neighborhood])
    case 'contact': return JSON.stringify([detailsForm.phone, detailsForm.email, detailsForm.website_url])
    case 'status': return JSON.stringify(detailsForm.status)
    case 'hours': return JSON.stringify(hoursForm.value)
    case 'content': return JSON.stringify([detailsForm.short_description, detailsForm.description, detailsForm.price_level])
    case 'discovery': return JSON.stringify([detailsForm.google_place_id, detailsForm.maps_url, detailsForm.google_review_url])
    case 'notifications': return JSON.stringify([detailsForm.notification_phone])
    case 'reservations': return JSON.stringify(reservationForm.value)
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
  if (editorKey.value === 'name' && !detailsForm.title.trim()) return 'Enter a location name.'
  if (editorKey.value === 'slug' && !detailsForm.slug.trim()) return 'Enter a location slug.'
  if (editorKey.value === 'contact') {
    if (detailsForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detailsForm.email)) return 'Enter a valid email address.'
    if (!isValidUrl(detailsForm.website_url)) return 'Enter a complete website URL.'
  }
  if (editorKey.value === 'hours') {
    if (!hoursForm.value.timezone) return 'Choose the location timezone.'
    try {
      parseOpeningHours(hoursForm.value.hours)
      parseSpecialHours(hoursForm.value.specialHours)
    } catch (error) { return error instanceof Error ? error.message : 'Invalid hours' }
  }
  if (editorKey.value === 'discovery' && ![detailsForm.maps_url, detailsForm.google_review_url].every(isValidUrl)) {
    return 'Enter complete Google Maps and review URLs.'
  }
  return null
})
const dirty = computed(() => editorSignature(editorKey.value) !== originalSignature.value)
const saveDisabled = computed(() => {
  return !dirty.value || validationMessage.value !== null
})


function resetDraft() {
  if (!location.value) return
  fillDetailsForm(location.value)
  reservationForm.value = reservationPatchFrom(reservationConfig.value)
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
  if (previous && previous !== next) resetDraft()
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

async function saveReservationPolicy() {
  const requestedLocationId = locationId.value
  reservationSaving.value = true
  try {
    const response = await dashboardApi<{ success: true; config: LocationReservationConfig | null }>(
      `/api/editor/sites/${siteId}/locations/${requestedLocationId}/reservation-config`,
      { method: 'PUT', body: reservationForm.value, validate: isReservationConfigResponse },
    )
    if (locationId.value !== requestedLocationId) return
    reservationConfig.value = response.config
    reservationForm.value = reservationPatchFrom(response.config)
    originalSignature.value = editorSignature(editorKey.value)
    toast.add({ description: 'Reservation policy saved', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save the reservation policy'), color: 'error' })
  } finally {
    reservationSaving.value = false
  }
}

async function closeReservations() {
  const requestedLocationId = locationId.value
  closingReservations.value = true
  try {
    await dashboardApi<{ success: true }>(
      `/api/editor/sites/${siteId}/locations/${requestedLocationId}/reservation-config`,
      { method: 'DELETE', validate: (value: unknown): value is { success: true } => isRecord(value) && value.success === true },
    )
    if (locationId.value !== requestedLocationId) return
    reservationConfig.value = null
    reservationForm.value = {}
    originalSignature.value = editorSignature(editorKey.value)
    toast.add({ description: 'This location no longer takes reservations', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to close reservations'), color: 'error' })
  } finally {
    closingReservations.value = false
  }
}

async function saveCurrentEditor() {
  if (saveDisabled.value) return
  if (editorKey.value === 'reservations') {
    await saveReservationPolicy()
    return
  }
  if (editorKey.value === 'features') {
    await saveLocationFeatures()
    return
  }
  if (editorKey.value === 'name') {
    await patchLocation({ title: detailsForm.title.trim() }, 'Name saved')
    return
  }
  if (editorKey.value === 'slug') {
    await patchLocation({ slug: detailsForm.slug.trim() }, 'Slug saved')
    return
  }
  if (editorKey.value === 'address') {
    await patchLocation({
      address: detailsForm.address.trim()
        ? { addressLines: detailsForm.address.split('\n').map(line => line.trim()).filter(Boolean) }
        : null,
      city: detailsForm.city.trim() || null,
      neighborhood: detailsForm.neighborhood.trim() || null,
    }, 'Address saved')
    return
  }
  if (editorKey.value === 'contact') {
    await patchLocation({
      phone: detailsForm.phone.trim() || null,
      email: detailsForm.email.trim() || null,
      website_url: detailsForm.website_url.trim() || null,
    }, 'Contact saved')
    return
  }
  if (editorKey.value === 'status') {
    await patchLocation({ status: detailsForm.status }, 'Status saved')
    return
  }
  if (editorKey.value === 'hours') {
    await patchLocation({ opening_hours: parseOpeningHours(hoursForm.value.hours), special_hours: parseSpecialHours(hoursForm.value.specialHours), timezone: hoursForm.value.timezone }, 'Hours saved')
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
  // The timezone belongs to Hours, which requires it. Editing it here as well
  // let a Notifications save write null over the value Hours validates, and
  // the location's opening times are read in that zone.
  await patchLocation({
    notification_phone: detailsForm.notification_phone.trim() || null,
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
  reservationConfig: { success: true; config: LocationReservationConfig | null }
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
  const [locationResponse, reservationResponse] = await Promise.all([
    dashboardApi<{ success: true; location: BusinessLocation } & LocationCapabilitySummary>(
      `/api/dashboard/locations/${requestedLocationId}`,
      { validate: isLocationResponse },
    ),
    dashboardApi<{ success: true; config: LocationReservationConfig | null }>(
      `/api/editor/sites/${siteId}/locations/${requestedLocationId}/reservation-config`,
      { validate: isReservationConfigResponse },
    ),
  ])
  return { location: locationResponse, reservationConfig: reservationResponse }
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
    reservationConfig.value = resource.reservationConfig.config
    reservationForm.value = reservationPatchFrom(resource.reservationConfig.config)
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
