<template>
  <UDashboardPanel id="location-overview">
    <template #header>
      <UDashboardNavbar :title="location?.title || 'Location'">
        <template #leading>
          <UDashboardSidebarCollapse />
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
        <div class="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
          <UCard>
            <p class="text-sm text-muted">Phone</p>
            <p class="mt-2 truncate font-semibold text-highlighted">{{ location.phone || 'Not set' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Rating</p>
            <p class="mt-2 font-semibold text-highlighted">{{ location.rating ? `${location.rating} / 5` : 'Not synced' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Reviews</p>
            <p class="mt-2 font-semibold text-highlighted">{{ location.review_count ?? 0 }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Menus</p>
            <p class="mt-2 font-semibold text-highlighted">{{ menus.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Pageviews</p>
            <p class="mt-2 text-xl font-semibold text-highlighted">{{ analyticsLoading ? '...' : formatCount(analyticsSummary.pageViews) }}</p>
            <p class="mt-2 text-xs text-muted">Last 30 days</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Unique visitors</p>
            <p class="mt-2 text-xl font-semibold text-highlighted">{{ analyticsLoading ? '...' : formatCount(analyticsSummary.uniqueVisitors) }}</p>
            <p class="mt-2 text-xs text-muted">Last 30 days</p>
          </UCard>
        </div>

        <div class="xl:max-w-[22rem]">
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
                  <span class="font-medium text-highlighted">Business Profile</span>
                  <UBadge :color="gbConnection ? 'success' : 'neutral'" variant="soft">
                    {{ gbConnection ? 'Connected' : 'Not connected' }}
                  </UBadge>
                </div>
                <div v-if="gbConnection" class="space-y-3">
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-muted">Account</span>
                    <span class="truncate text-right text-highlighted">{{ gbConnection.provider_account_email }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-muted">Last synced</span>
                    <span class="text-right text-highlighted">{{ location.last_synced_at || 'Never' }}</span>
                  </div>
                </div>
                <p v-else class="text-muted">Connect Google Business to sync reviews, photos, and location data.</p>

                <UButton
                  v-if="!gbConnection"
                  icon="i-simple-icons-google"
                  :loading="connectingGoogle"
                  block
                  @click="connectGoogleBusiness"
                >
                  Connect Google Business
                </UButton>
              </section>

              <section class="space-y-3 border-t border-default pt-5">
                <div class="flex items-center justify-between gap-4">
                  <span class="font-medium text-highlighted">Places</span>
                  <UBadge :color="location.google_place_id ? 'success' : 'neutral'" variant="soft">
                    {{ location.google_place_id ? 'Ready' : 'No Place ID' }}
                  </UBadge>
                </div>
                <p class="text-muted">
                  {{ location.google_place_id ? `Place ID: ${location.google_place_id}` : 'Add a Google Place ID in Location Details to sync hours, address, rating, and reviews.' }}
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
                    searchable
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
import { TIMEZONE_OPTIONS } from '~/utils/timezone'
definePageMeta({ layout: 'dashboard' })

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
  google_location_id: string | null
  last_synced_at: string | null
  hero_image_asset_id?: string | null
  hero_video_asset_id?: string | null
  notification_phone?: string | null
  timezone?: string | null
}

interface GbConnection {
  id: string
  provider_account_email: string
  status: string
  expires_at?: string
  created_at: string
  updated_at: string
}

interface AnalyticsResponse {
  metrics: {
    pageViews: number
    uniqueVisitors: number
  }
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
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<ApiRecord | null>(null)
const location = ref<BusinessLocation | null>(null)
const menus = ref<ApiRecord[]>([])
const gbConnection = ref<GbConnection | null>(null)
let locationLoadToken = 0
const connectingGoogle = ref(false)
const syncingPlace = ref(false)
const placeSyncResult = ref('')
const _locationAddress = computed(() => location.value?.address?.addressLines?.join(', ') || '')
const _publicLocationUrl = computed(() => {
  if (!location.value?.slug || !site.value?.public_url) return ''
  return `${site.value.public_url.replace(/\/$/, '')}/locations/${location.value.slug}`
})

const detailsSaving = ref(false)
const detailsSaved = ref(false)
const analyticsLoading = ref(false)
const analyticsSummary = reactive({
  pageViews: 0,
  uniqueVisitors: 0
})

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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const errorMessage = (data as Record<string, unknown>).error
      if (typeof errorMessage === 'string' && errorMessage) return errorMessage
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function getDateString(date: Date): string {
  const [day] = date.toISOString().split('T')
  return day || ''
}

async function loadAnalyticsSummary() {
  analyticsLoading.value = true
  try {
    const endDate = getDateString(new Date())
    const start = new Date()
    start.setUTCDate(start.getUTCDate() - 29)
    const startDate = getDateString(start)
    const response = await $fetch<AnalyticsResponse>(`/api/sites/${siteId}/analytics`, {
      query: { startDate, endDate }
    })
    analyticsSummary.pageViews = response.metrics.pageViews
    analyticsSummary.uniqueVisitors = response.metrics.uniqueVisitors
  } catch {
    analyticsSummary.pageViews = 0
    analyticsSummary.uniqueVisitors = 0
  } finally {
    analyticsLoading.value = false
  }
}

watch(location, (loc) => {
  if (loc) fillDetailsForm(loc)
})

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
  detailsSaving.value = true
  try {
    const response = await $fetch<{ success: boolean; location: BusinessLocation }>(`/api/dashboard/locations/${locationId.value}`, {
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
      }
    })
    if (!response.success) throw new Error('Failed to save location')
    location.value = response.location
    detailsSaved.value = true
    toast.add({ description: 'Location fields saved', color: 'success' })
    setTimeout(() => { detailsSaved.value = false }, 2000)
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save location fields'), color: 'error' })
  } finally {
    detailsSaving.value = false
  }
}

const connectGoogleBusiness = async () => {
  connectingGoogle.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl: string }>(
      `/api/dashboard/locations/${locationId.value}/integrations/google-business/auth`,
      { method: 'POST' }
    )
    if (res.success && res.authUrl) {
      try {
        const parsed = new URL(res.authUrl)
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') {
          throw new Error('Invalid OAuth redirect URL')
        }
        window.location.href = res.authUrl
      } catch {
        toast.add({ description: 'Invalid OAuth redirect URL returned by server', color: 'error' })
        connectingGoogle.value = false
      }
    } else {
      toast.add({ description: 'Failed to start Google Business connection', color: 'error' })
      connectingGoogle.value = false
    }
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to start Google Business connection'), color: 'error' })
    connectingGoogle.value = false
  }
}

const loadGbConnection = async () => {
  try {
    const res = await $fetch<{ success: boolean; connection: GbConnection | null }>(
      `/api/dashboard/locations/${locationId.value}/integrations/google-business`
    )
    gbConnection.value = res.connection
  } catch {
    // Google Business connection is optional for a location.
  }
}

async function syncGooglePlace() {
  if (!location.value?.google_place_id) return
  syncingPlace.value = true
  try {
    const res = await $fetch<{ success: boolean; reviewsUpserted: number; place: { rating: number | null; ratingCount: number | null } }>(
      '/api/integrations/google-places/sync',
      { method: 'POST', body: { locationId: locationId.value } }
    )
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

const loadLocationWorkspace = async () => {
  loading.value = true
  error.value = null
  try {
    const [settingsResponse, locationResponse, menusResponse] = await Promise.all([
      $fetch<{ success: boolean; settings: ApiRecord }>(`/api/dashboard/settings`),
      $fetch<{ success: boolean; location: BusinessLocation }>(`/api/dashboard/locations/${locationId.value}`),
      $fetch<{ success: boolean; menus: ApiRecord[] }>(`/api/dashboard/editor/menus?locationId=${locationId.value}`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationResponse.success) throw new Error('Failed to load location')
    if (!menusResponse.success) throw new Error('Failed to load menus')

    site.value = settingsResponse.settings
    location.value = locationResponse.location
    menus.value = menusResponse.menus
    return true
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load location'
    return false
  } finally {
    loading.value = false
  }
}

const { evaluateAndSuggest } = useUpsellTriggers()

onMounted(async () => {
  const currentToken = ++locationLoadToken
  await loadLocationWorkspace()
  if (currentToken !== locationLoadToken) return
  await Promise.all([loadAnalyticsSummary(), loadGbConnection()])
  if (currentToken !== locationLoadToken) return

  if (route.query.gb === 'connected') {
    toast.add({ description: 'Google Business connected successfully', color: 'success' })
    const { gb: _gb, ...restQuery } = route.query
    router.replace({ path: route.path, query: restQuery })
  }

  evaluateAndSuggest()
})

watch(() => dashboardLocation.currentLocationId.value, async () => {
  const currentToken = ++locationLoadToken
  await loadLocationWorkspace()
  if (currentToken !== locationLoadToken) return
  await Promise.all([loadAnalyticsSummary(), loadGbConnection()])
})

useSeoMeta({ title: 'Location Workspace | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
