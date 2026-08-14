<template>
  <UDashboardPanel id="location-settings">
    <template #header>
      <UDashboardNavbar title="Location Settings">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard v-if="loading">
        <div class="flex items-center gap-3 text-sm text-muted">
          <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin" />
          Loading location...
        </div>
      </UCard>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="error"
      />

      <div v-else-if="location" class="space-y-6">
        <div class="xl:max-w-2xl">
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-simple-icons-google" class="size-4 text-primary" />
                <h2 class="font-semibold text-highlighted">Google</h2>
              </div>
            </template>

            <div class="space-y-5 text-sm">
              <section class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <span class="font-medium text-highlighted">Google Places</span>
                  <UBadge :color="location.google_place_id ? 'success' : 'neutral'" variant="soft">
                    {{ location.google_place_id ? 'Ready' : 'Not configured' }}
                  </UBadge>
                </div>
                <div v-if="location.google_place_id" class="space-y-3">
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-muted">Last imported</span>
                    <span class="text-right text-highlighted">{{ location.last_synced_at || 'Never' }}</span>
                  </div>
                </div>
                <p class="text-muted">
                  {{ location.google_place_id ? `Place ID: ${location.google_place_id}` : 'Add a Google Place ID in Location Details to import hours, address, ratings, and reviews.' }}
                </p>
                <p v-if="placeSyncResult" class="text-success">{{ placeSyncResult }}</p>
                <UButton
                  icon="i-simple-icons-googlemaps"
                  color="neutral"
                  variant="soft"
                  :disabled="!location.google_place_id"
                  :loading="syncingPlace"
                  block
                  @click="syncGooglePlace"
                >
                  Sync Google Places
                </UButton>
              </section>

              <UButton
                v-if="location.maps_url"
                :to="location.maps_url"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-lucide-map"
                block
              >
                Open Maps
              </UButton>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Available at this location</h2>
              <p class="mt-1 text-sm text-muted">Which of the site's business modules are live at this specific location. Only modules the site itself supports can be turned on here.</p>
            </div>
          </template>
          <div v-if="locationToggleableFeatures.length" class="grid gap-3 sm:grid-cols-2">
            <UCheckbox
              v-for="feature in locationToggleableFeatures"
              :key="feature"
              v-model="locationEnabledFeatureSet[feature]"
              :label="LOCATION_FEATURE_LABELS[feature] ?? humanizeFeatureId(feature)"
            />
          </div>
          <p v-else class="text-sm text-muted">No toggleable modules available — enable them on the site first.</p>
          <template #footer>
            <div class="flex justify-end">
              <UButton color="neutral" variant="outline" :loading="savingLocationFeatures" @click="saveLocationFeatures">Save availability</UButton>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Location Details</h2>
                <p class="mt-1 text-sm text-muted">Manage location-specific profile and operational fields.</p>
              </div>
              <UButton v-if="detailsSaved" size="xs" color="primary" variant="soft" icon="i-lucide-check">Saved</UButton>
            </div>
          </template>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <section class="grid gap-6 p-6 md:grid-cols-[1fr_2fr]">
              <div>
                <h3 class="font-semibold text-highlighted">Core Profile</h3>
                <p class="mt-1 text-sm text-muted">Basic location identity and contact details shown across the site.</p>
              </div>
              <div class="space-y-5">
                <div class="flex items-center gap-6">
                  <UCheckbox v-model="detailsForm.is_primary" label="Primary location" />
                  <UCheckbox
                    :model-value="detailsForm.status === 'active'"
                    label="Active"
                    @update:model-value="setDetailsActive"
                  />
                </div>
                <div class="grid gap-5 sm:grid-cols-2">
                  <UFormField label="Name">
                    <UInput v-model="detailsForm.title" />
                  </UFormField>
                  <UFormField label="Slug">
                    <UInput v-model="detailsForm.slug" />
                  </UFormField>
                  <UFormField label="City">
                    <UInput v-model="detailsForm.city" />
                  </UFormField>
                  <UFormField label="Neighbourhood" help="Short tag shown on the location hero, e.g. &quot;Beachside · 2 min from Centre Point&quot;">
                    <UInput v-model="detailsForm.neighborhood" />
                  </UFormField>
                  <UFormField label="Phone">
                    <UInput v-model="detailsForm.phone" type="tel" />
                  </UFormField>
                  <UFormField label="Email">
                    <UInput v-model="detailsForm.email" type="email" />
                  </UFormField>
                  <UFormField label="Website URL">
                    <UInput v-model="detailsForm.website_url" type="url" />
                  </UFormField>
                </div>
                <UFormField label="Address">
                  <UTextarea v-model="detailsForm.address" :rows="2" />
                </UFormField>
              </div>
            </section>

            <section class="grid gap-6 p-6 md:grid-cols-[1fr_2fr]">
              <div>
                <h3 class="font-semibold text-highlighted">Notifications</h3>
                <p class="mt-1 text-sm text-muted">Internal alert routing for this location. Not shown to guests.</p>
              </div>
              <div class="space-y-5">
                <UFormField
                  label="Notification Phone (WhatsApp)"
                  help="WhatsApp number for booking and reservation alerts at this location. Falls back to the site-level WhatsApp number if blank. International format: +66812345678"
                >
                  <UInput v-model="detailsForm.notification_phone" type="tel" placeholder="+66..." />
                </UFormField>
                <UFormField
                  label="Timezone"
                  help="Used to interpret experience booking time slots at this location, e.g. Asia/Bangkok. Falls back to the site default if blank."
                >
                  <USelectMenu
                    v-model="detailsForm.timezone"
                    :items="timezoneOptions"
                    placeholder="Select timezone"
                  />
                </UFormField>
              </div>
            </section>

            <section class="grid gap-6 p-6 md:grid-cols-[1fr_2fr]">
              <div>
                <h3 class="font-semibold text-highlighted">Discovery</h3>
                <p class="mt-1 text-sm text-muted">Location-specific mapping and place metadata.</p>
              </div>
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField label="Maps URL">
                  <UInput v-model="detailsForm.maps_url" type="url" />
                </UFormField>
                <UFormField label="Google Review URL">
                  <UInput v-model="detailsForm.google_review_url" type="url" />
                </UFormField>
                <UFormField label="Google Place ID">
                  <UInput v-model="detailsForm.google_place_id" />
                </UFormField>
              </div>
            </section>

            <section class="grid gap-6 p-6 md:grid-cols-[1fr_2fr]">
              <div>
                <h3 class="font-semibold text-highlighted">Content and Metadata</h3>
                <p class="mt-1 text-sm text-muted">Descriptions, hours, and rating data for this specific location.</p>
              </div>
              <div class="space-y-5">
                <div class="grid gap-5 sm:grid-cols-2">
                  <UFormField label="Rating">
                    <UInputNumber v-model="detailsForm.rating" :min="0" :max="5" :step="0.1" class="w-full" />
                  </UFormField>
                  <UFormField label="Review Count">
                    <UInputNumber v-model="detailsForm.review_count" :min="0" :step="1" class="w-full" />
                  </UFormField>
                  <UFormField label="Price Level">
                    <UInput v-model="detailsForm.price_level" />
                  </UFormField>
                  <UFormField label="Short Description">
                    <UInput v-model="detailsForm.short_description" />
                  </UFormField>
                </div>

                <UFormField label="Description">
                  <UTextarea v-model="detailsForm.description" :rows="4" />
                </UFormField>

                <UFormField label="Opening Hours">
                  <UCard :ui="{ body: 'p-3 sm:p-3' }">
                    <div class="space-y-2">
                      <UCard
                        v-for="day in openingHours"
                        :key="day.day"
                        :ui="{ body: 'p-3 sm:p-3' }"
                      >
                        <div class="grid gap-2 sm:grid-cols-[9rem_1fr]">
                          <div class="flex items-center justify-between sm:block">
                            <p class="text-sm font-medium text-highlighted">{{ day.day }}</p>
                            <UCheckbox
                              :model-value="!day.isOpen"
                              label="Closed"
                              @update:model-value="setDayClosed(day.day, $event)"
                            />
                          </div>

                          <div class="grid gap-2 sm:grid-cols-2">
                            <UFormField label="Open" size="sm">
                              <UInput
                                :model-value="day.openTime"
                                type="time"
                                :disabled="!day.isOpen"
                                @update:model-value="updateDayTime(day.day, 'openTime', $event)"
                              />
                            </UFormField>
                            <UFormField label="Close" size="sm">
                              <UInput
                                :model-value="day.closeTime"
                                type="time"
                                :disabled="!day.isOpen"
                                @update:model-value="updateDayTime(day.day, 'closeTime', $event)"
                              />
                            </UFormField>
                          </div>
                        </div>
                      </UCard>
                    </div>
                  </UCard>
                </UFormField>
              </div>
            </section>

            <div class="flex justify-end p-6">
              <UButton :loading="detailsSaving" icon="i-lucide-check" @click="saveLocationDetails">Save fields</UButton>
            </div>
          </UCard>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import { TIMEZONE_OPTIONS } from '~/utils/timezone'
import { getErrorMessage } from '~/utils/errors'
import { toggleableModulesForScope, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'
definePageMeta({ layout: 'dashboard' })

const LOCATION_FEATURE_LABELS: Partial<Record<ProductFeature, string>> = {
  menu: 'Menu',
  reservations: 'Reservations',
  ordering: 'Online ordering',
  experiences: 'Experiences',
}

// Every location-configurable module has an entry above today (config/cms-registry.ts's saya/blawby
// ProductModuleDefinition lists), but this humanizes the fallback rather than only the map so a
// future template/module doesn't silently render a raw snake_case id here.
function humanizeFeatureId(feature: string): string {
  return feature.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
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
  hero_media_asset_id?: string | null
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

const loading = ref(true)
const error = ref<string | null>(null)
const location = ref<BusinessLocation | null>(null)
const syncingPlace = ref(false)
const savingLocationFeatures = ref(false)
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
    toast.add({ description: 'Availability saved', color: 'success' })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save availability'), color: 'error' })
  } finally {
    savingLocationFeatures.value = false
  }
}
const placeSyncResult = ref('')
const detailsSaving = ref(false)
const detailsSaved = ref(false)

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
  rating: null as number | null,
  review_count: null as number | null,
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
  detailsForm.rating = loc.rating ?? null
  detailsForm.review_count = loc.review_count ?? null
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
    const [rawDay, rawValue] = String(line).split(':', 2)
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

const optionalNumber = (value: string | number | null | undefined): number | null => {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const optionalInteger = (value: string | number | null | undefined): number | null => {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

async function saveLocationDetails() {
  const requestedLocationId = locationId.value
  detailsSaving.value = true
  try {
    const response = await dashboardApi<{ success: boolean; location: BusinessLocation }>(`/api/dashboard/locations/${requestedLocationId}`, {
      method: 'PATCH',
      body: {
        title: detailsForm.title,
        slug: detailsForm.slug,
        city: detailsForm.city || null,
        neighborhood: detailsForm.neighborhood || null,
        phone: detailsForm.phone || null,
        email: detailsForm.email || null,
        website_url: detailsForm.website_url || null,
        maps_url: detailsForm.maps_url || null,
        google_review_url: detailsForm.google_review_url || null,
        google_place_id: detailsForm.google_place_id || null,
        rating: optionalNumber(detailsForm.rating),
        review_count: optionalInteger(detailsForm.review_count),
        price_level: detailsForm.price_level || null,
        address: detailsForm.address ? { addressLines: detailsForm.address.split('\n').map(line => line.trim()).filter(Boolean) } : null,
        short_description: detailsForm.short_description || null,
        description: detailsForm.description || null,
        opening_hours: { weekdayDescriptions: buildWeekdayDescriptions(openingHours.value) },
        is_primary: detailsForm.is_primary,
        status: detailsForm.status,
        notification_phone: detailsForm.notification_phone || null,
        timezone: detailsForm.timezone || null,
      },
      validate: isLocationResponse,
    })
    if (locationId.value !== requestedLocationId) return
    if (!response.success) throw new Error('Failed to save location')
    location.value = response.location
    fillDetailsForm(response.location)
    if (response.location.slug !== route.params.locationSlug) {
      await dashboard.refresh()
      await router.replace({
        name: route.name as string,
        params: { ...route.params, locationSlug: response.location.slug },
        query: route.query,
      })
    }
    detailsSaved.value = true
    toast.add({ description: 'Location fields saved', color: 'success' })
    setTimeout(() => { detailsSaved.value = false }, 2000)
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save location fields'), color: 'error' })
  } finally {
    detailsSaving.value = false
  }
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

watchEffect(() => {
  loading.value = locationSettingsPending.value
  error.value = locationSettingsError.value
    ? getErrorMessage(locationSettingsError.value, 'Failed to load location')
    : null
  const resource = locationSettingsResource.value
  if (!resource) return
  location.value = resource.location.location
  fillLocationFeatures(resource.location)
  fillDetailsForm(resource.location.location)
})

const loadLocationWorkspace = async () => {
  await refreshLocationWorkspace()
  return !locationSettingsError.value
}

useSeoMeta({ title: 'Location Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
