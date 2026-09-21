<template>
  <!--
    The gear's list: what a guest never sees about this location, one row per
    setting, each a leaf below. Languages is a row that opens the sheet.
  -->
  <DashboardIndexPanel id="location-settings" title="Settings" :auto-open="editor.navigationGroups.value[0]?.items.find(item => item.to)?.to ?? null">
    <div v-if="editor.loading.value" class="space-y-4">
      <USkeleton v-for="index in 6" :key="index" class="h-32 rounded-xl" />
    </div>
    <UAlert v-else-if="editor.error.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.error.value" />
    <EditorNavigationList v-else-if="editor.location.value" :groups="editor.navigationGroups.value" :active-item="level.child.value" @act="onRowAction" />
  </DashboardIndexPanel>

  <DashboardResourceLocalization
    v-if="editor.location.value"
    v-model:open="localizeOpen"
    row-trigger
    :site-id="siteId"
    resource-type="business_location"
    :resource-id="editor.location.value.id"
    resource-label="location"
    :fields="editor.locationLocalizationFields.value"
    :route-path="editor.localizedLocationPath"
    :language-settings-path="editor.siteLocalizationSettingsPath.value"
  />
</template>

<script lang="ts">
import type { LocationHoursForm } from '~/lib/components/workspace/location/LocationHoursCard.vue'
import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'

import type { Ref } from 'vue'
import type { LocationReservationConfig, LocationReservationConfigPatch } from '~/server/utils/reservations'
import { getErrorMessage } from '~/utils/errors'
import { defaultModuleFeaturesForVertical, resolveCmsCapabilities, toggleableModulesForScope, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'
import { postalAddressFromAnswers, type PostalAddress } from '~/utils/postal-address'


export interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: PostalAddress | null
  phone: string | null
  email: string | null
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

/**
 * The editors a guest sees the result of — name, description, hours, address,
 * contact, the reservation policy — open from the location index's cards. The
 * rest are the gear's.
 */
export const HUB_KEYS = ['name', 'description', 'hours', 'address', 'contact', 'reservations'] as const
export const SETTINGS_KEYS = ['status', 'slug', 'discovery', 'notifications', 'features'] as const
export type LocationEditorKey = typeof HUB_KEYS[number] | typeof SETTINGS_KEYS[number]

/**
 * One location's editable state and the save for one of its concerns. The
 * settings rail reads it with no key for its row summaries; a leaf reads it
 * with its own key so `saveDisabled`, `validationMessage` and `save` are about
 * that one concern. Loads share one `useAsyncData` key per location, so the
 * rail and the leaf beside it are one request.
 */
export async function useLocationEditor(siteId: string, locationId: Ref<string | null>, key: LocationEditorKey | null, settingsPath = '') {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
    const editorError = ref<string | null>(null)
  const dashboard = useDashboardSite()



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
      && (value.address === null || isRecord(value.address))
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
    editorError.value = null
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
      originalSignature.value = editorSignature(key)
      await dashboard.refresh()
    } catch (error) {
      editorError.value = getErrorMessage(error, 'Failed to save availability')
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

  /**
   * The address the form's fields make. The same mapping onboarding uses, so a
   * street with no country is refused here exactly as it is there.
   */
  function addressFromForm(): PostalAddress | null {
    const [streetAddress, ...rest] = detailsForm.addressLines.split('\n').map(line => line.trim()).filter(Boolean)
    return postalAddressFromAnswers({
      streetAddress: streetAddress ?? null,
      addressLine2: rest.join(', ') || null,
      city: detailsForm.locality,
      region: detailsForm.administrativeArea,
      postalCode: detailsForm.postalCode,
      country: detailsForm.regionCode,
      sublocality: detailsForm.sublocality,
    })
  }

  const detailsForm = reactive({
    title: '',
    slug: '',
    phone: '',
    email: '',
    maps_url: '',
    google_review_url: '',
    google_place_id: '',
    price_level: '',
    addressLines: '',
    regionCode: '',
    locality: '',
    sublocality: '',
    administrativeArea: '',
    postalCode: '',
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
    // The address localizes part by part, the way it is stored: a translator
    // writes the street lines and the place names, not one run-together line.
    { key: 'address.addressLines', label: 'Street', source: location.value?.address?.addressLines, kind: 'string-list' as const, rows: 3 },
    { key: 'address.sublocality', label: 'Neighbourhood', source: location.value?.address?.sublocality },
    { key: 'address.locality', label: 'City', source: location.value?.address?.locality },
    { key: 'address.administrativeArea', label: 'State or province', source: location.value?.address?.administrativeArea },
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
    detailsForm.phone = loc.phone ?? ''
    detailsForm.email = loc.email ?? ''
    detailsForm.maps_url = loc.maps_url ?? ''
    detailsForm.google_review_url = loc.google_review_url ?? ''
    detailsForm.google_place_id = loc.google_place_id ?? ''
    detailsForm.price_level = loc.price_level ?? ''
    detailsForm.addressLines = loc.address?.addressLines?.join('\n') ?? ''
    detailsForm.regionCode = loc.address?.regionCode ?? ''
    detailsForm.locality = loc.address?.locality ?? ''
    detailsForm.sublocality = loc.address?.sublocality ?? ''
    detailsForm.administrativeArea = loc.address?.administrativeArea ?? ''
    detailsForm.postalCode = loc.address?.postalCode ?? ''
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

  const slugSummary = computed(() => location.value?.slug?.trim() || 'Not set')
  const statusSummary = computed(() => location.value?.status === 'active' ? 'Active' : 'Hidden from the public site')
  const discoverySummary = computed(() => location.value?.google_place_id ? 'Google Places connected' : 'Not connected')
  const notificationSummary = computed(() => location.value?.notification_phone || 'Not configured')
  const featureSummary = computed(() => {
    const count = locationToggleableFeatures.value.filter(feature => locationEnabledFeatureSet[feature]).length
    return count ? `${count} ${count === 1 ? 'module' : 'modules'} available` : 'No location modules'
  })
  const navigationGroups = computed(() => [{
    id: 'settings',
    items: [
      { id: 'status', label: 'Status', summary: statusSummary.value, to: `${settingsPath}/status` },
      { id: 'slug', label: 'Link', summary: slugSummary.value, to: `${settingsPath}/slug` },
      { id: 'languages', label: 'Languages', summary: 'Translate the name, description and address', action: { label: 'Localize' } },
      { id: 'discovery', label: 'Google Business Profile', summary: discoverySummary.value, to: `${settingsPath}/discovery` },
      { id: 'notifications', label: 'WhatsApp number', summary: notificationSummary.value, to: `${settingsPath}/notifications` },
      { id: 'features', label: 'Features', summary: featureSummary.value, to: `${settingsPath}/features` },
    ],
  }])

  // Every write this screen can be in the middle of, including the one that
  // stops reservations: Save stayed live during that delete, and a save landing
  // on top of it recreated the policy it had just removed.
  const saving = computed(() => detailsSaving.value || savingLocationFeatures.value || reservationSaving.value || closingReservations.value)

  function editorSignature(key: string | null): string {
    switch (key) {
      case 'name': return JSON.stringify(detailsForm.title)
      case 'slug': return JSON.stringify(detailsForm.slug)
      case 'address': return JSON.stringify([detailsForm.addressLines, detailsForm.regionCode, detailsForm.locality, detailsForm.sublocality, detailsForm.administrativeArea, detailsForm.postalCode])
      case 'contact': return JSON.stringify([detailsForm.phone, detailsForm.email])
      case 'status': return JSON.stringify(detailsForm.status)
      case 'hours': return JSON.stringify(hoursForm.value)
      case 'description': return JSON.stringify([detailsForm.short_description, detailsForm.description, detailsForm.price_level])
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
    if (key === 'name' && !detailsForm.title.trim()) return 'Enter a location name.'
    if (key === 'slug' && !detailsForm.slug.trim()) return 'Enter a location slug.'
    if (key === 'contact') {
      if (detailsForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detailsForm.email)) return 'Enter a valid email address.'
    }
    if (key === 'hours') {
      if (!hoursForm.value.timezone) return 'Choose the location timezone.'
      try {
        parseOpeningHours(hoursForm.value.hours)
        parseSpecialHours(hoursForm.value.specialHours)
      } catch (error) { return error instanceof Error ? error.message : 'Invalid hours' }
    }
    if (key === 'discovery' && ![detailsForm.maps_url, detailsForm.google_review_url].every(isValidUrl)) {
      return 'Enter complete Google Maps and review URLs.'
    }
    return null
  })
  const dirty = computed(() => editorSignature(key) !== originalSignature.value)
  const saveDisabled = computed(() => {
    return !dirty.value || validationMessage.value !== null
  })


  function resetDraft() {
    editorError.value = null
    if (!location.value) return
    fillDetailsForm(location.value)
    reservationForm.value = reservationPatchFrom(reservationConfig.value)
    fillLocationFeatures({
      site_effective_features: siteEffectiveFeatures.value,
      location_effective_features: locationEffectiveFeatures.value,
    })
    originalSignature.value = editorSignature(key)
  }

  async function patchLocation(body: Record<string, unknown>) {
    const requestedLocationId = locationId.value
    detailsSaving.value = true
    editorError.value = null
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
      originalSignature.value = editorSignature(key)
      // The index beside this editor draws the same location from its own read.
      await refreshNuxtData(`dashboard-location-overview:${siteId}:${requestedLocationId}`)
      if (response.location.slug !== previousSlug) {
        await dashboard.refresh()
        // The record moved: same level, its new address.
        await navigateTo(route.path.replace(`/locations/${previousSlug}`, `/locations/${response.location.slug}`), { replace: true })
      }
    } catch (error) {
      editorError.value = getErrorMessage(error, 'Failed to save location')
    } finally {
      detailsSaving.value = false
    }
  }

  async function saveReservationPolicy() {
    const requestedLocationId = locationId.value
    reservationSaving.value = true
    editorError.value = null
    try {
      const response = await dashboardApi<{ success: true; config: LocationReservationConfig | null }>(
        `/api/editor/sites/${siteId}/locations/${requestedLocationId}/reservation-config`,
        { method: 'PUT', body: reservationForm.value, validate: isReservationConfigResponse },
      )
      if (locationId.value !== requestedLocationId) return
      reservationConfig.value = response.config
      reservationForm.value = reservationPatchFrom(response.config)
      originalSignature.value = editorSignature(key)
      await refreshNuxtData(`dashboard-location-overview:${siteId}:${requestedLocationId}`)
    } catch (error) {
      editorError.value = getErrorMessage(error, 'Failed to save the reservation policy')
    } finally {
      reservationSaving.value = false
    }
  }

  async function closeReservations() {
    const requestedLocationId = locationId.value
    closingReservations.value = true
    editorError.value = null
    try {
      await dashboardApi<{ success: true }>(
        `/api/editor/sites/${siteId}/locations/${requestedLocationId}/reservation-config`,
        { method: 'DELETE', validate: (value: unknown): value is { success: true } => isRecord(value) && value.success === true },
      )
      if (locationId.value !== requestedLocationId) return
      reservationConfig.value = null
      reservationForm.value = {}
      originalSignature.value = editorSignature(key)
      await refreshNuxtData(`dashboard-location-overview:${siteId}:${requestedLocationId}`)
    } catch (error) {
      editorError.value = getErrorMessage(error, 'Failed to close reservations')
    } finally {
      closingReservations.value = false
    }
  }

  async function saveCurrentEditor() {
    if (saveDisabled.value) return
    if (key === 'reservations') {
      await saveReservationPolicy()
      return
    }
    if (key === 'features') {
      await saveLocationFeatures()
      return
    }
    if (key === 'name') {
      await patchLocation({ title: detailsForm.title.trim() })
      return
    }
    if (key === 'slug') {
      await patchLocation({ slug: detailsForm.slug.trim() })
      return
    }
    if (key === 'address') {
      await patchLocation({ address: addressFromForm() })
      return
    }
    if (key === 'contact') {
      await patchLocation({
        phone: detailsForm.phone.trim() || null,
        email: detailsForm.email.trim() || null,
      })
      return
    }
    if (key === 'status') {
      await patchLocation({ status: detailsForm.status })
      return
    }
    if (key === 'hours') {
      await patchLocation({ opening_hours: parseOpeningHours(hoursForm.value.hours), special_hours: parseSpecialHours(hoursForm.value.specialHours), timezone: hoursForm.value.timezone })
      return
    }
    if (key === 'description') {
      await patchLocation({
        short_description: detailsForm.short_description.trim() || null,
        description: detailsForm.description.trim() || null,
        price_level: detailsForm.price_level.trim() || null,
      })
      return
    }
    if (key === 'discovery') {
      await patchLocation({
        google_place_id: detailsForm.google_place_id.trim() || null,
        maps_url: detailsForm.maps_url.trim() || null,
        google_review_url: detailsForm.google_review_url.trim() || null,
      })
      return
    }
    // The timezone belongs to Hours, which requires it. Editing it here as well
    // let a Notifications save write null over the value Hours validates, and
    // the location's opening times are read in that zone.
    await patchLocation({
      notification_phone: detailsForm.notification_phone.trim() || null,
    })
  }

  async function syncGooglePlace() {
    if (!location.value?.google_place_id) return
    const requestedLocationId = locationId.value
    syncingPlace.value = true
    editorError.value = null
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
      await loadLocationWorkspace()
    } catch (err) {
      editorError.value = getErrorMessage(err, 'Google Places sync failed')
    } finally {
      syncingPlace.value = false
    }
  }

  interface LocationSettingsResource {
    location: { success: true; location: BusinessLocation } & LocationCapabilitySummary
    reservationConfig: { success: true; config: LocationReservationConfig | null }
  }

  const locationSettingsKey = computed(() => `dashboard-location-settings-${siteId}-${locationId.value}`)
  const {
    data: locationSettingsResource,
    pending: locationSettingsPending,
    error: locationSettingsError,
    refresh: refreshLocationWorkspace,
  } = await useAsyncData<LocationSettingsResource>(locationSettingsKey, async () => {
    const requestedLocationId = locationId.value
    if (!requestedLocationId) throw createError({ statusCode: 400, statusMessage: 'Location is required' })
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
      originalSignature.value = editorSignature(key)
    },
    { immediate: true },
  )



  const loadLocationWorkspace = async () => {
    await refreshLocationWorkspace()
    return !locationSettingsError.value
  }

  return {
    loading, error, location, saving, saveDisabled, validationMessage, editorError, dirty,
    detailsForm, hoursForm, reservationForm, reservationConfigExists, closingReservations,
    locationToggleableFeatures, locationEnabledFeatureSet, locationFeatureLabel,
    syncingPlace, placeSyncResult, syncGooglePlace, setDetailsActive,
    navigationGroups, locationLocalizationFields, localizedLocationPath, siteLocalizationSettingsPath,
    revert: resetDraft, save: saveCurrentEditor, closeReservations, loadLocationWorkspace,
  }
}
</script>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

const level = useRouteLevel()
const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, null, level.path.value)

const localizeOpen = ref(false)
function onRowAction(id: string) {
  if (id === 'languages') localizeOpen.value = true
}

useSeoMeta({ title: 'Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>
