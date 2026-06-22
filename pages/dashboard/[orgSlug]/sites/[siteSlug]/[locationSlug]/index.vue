<template>
  <UPage>

    <UPageBody>
      <UCard v-if="loading">
        <div class="flex items-center gap-3 text-sm text-muted">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          Loading location...
        </div>
      </UCard>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else-if="location" class="space-y-6">
        <UCard>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="tab in locationTabs"
              :key="tab.label"
              :to="tab.to"
              :icon="tab.icon"
              :variant="tab.active ? 'soft' : 'ghost'"
              :color="tab.active ? 'primary' : 'neutral'"
            >
              {{ tab.label }}
            </UButton>
          </div>
        </UCard>

        <div class="grid gap-4 md:grid-cols-4">
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
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">Local Work</h2>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UButton
                v-for="action in workspaceActions"
                :key="action.label"
                :to="action.to"
                :icon="action.icon"
                color="neutral"
                variant="soft"
                block
                class="justify-start"
              >
                {{ action.label }}
              </UButton>
            </div>
          </UCard>

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
                icon="i-heroicons-map"
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
              <UButton v-if="detailsSaved" size="xs" color="primary" variant="soft" icon="i-heroicons-check">Saved</UButton>
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
                    <UInput v-model="detailsForm.rating" type="number" min="0" max="5" step="0.1" />
                  </UFormField>
                  <UFormField label="Review Count">
                    <UInput v-model="detailsForm.review_count" type="number" min="0" step="1" />
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
              <UButton :loading="detailsSaving" icon="i-heroicons-check" @click="saveLocationDetails">Save fields</UButton>
            </div>
          </UCard>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-highlighted">Manual Reviews</h2>
              <UButton size="sm" icon="i-heroicons-plus" @click="startNewReview">Add review</UButton>
            </div>
          </template>

          <div class="space-y-5">
            <UCard v-if="reviewFormVisible">
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField label="Guest Name">
                  <UInput v-model="reviewForm.author_name" />
                </UFormField>
                <UFormField label="Rating">
                  <UInput v-model="reviewForm.rating" type="number" min="1" max="5" step="1" />
                </UFormField>
                <UFormField label="Title">
                  <UInput v-model="reviewForm.title" />
                </UFormField>
                <UFormField label="Date">
                  <UInput v-model="reviewForm.created_at" type="date" />
                </UFormField>
              </div>
              <UFormField class="mt-4" label="Review">
                <UTextarea v-model="reviewForm.content" :rows="4" />
              </UFormField>
              <div class="mt-4 flex justify-end gap-2">
                <UButton color="neutral" variant="ghost" @click="cancelReviewEdit">Cancel</UButton>
                <UButton :loading="reviewSaving" @click="saveReview">Save review</UButton>
              </div>
            </UCard>

            <div v-if="reviewsLoading" class="flex items-center gap-3 text-sm text-muted">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
              Loading reviews...
            </div>
            <UCard v-else-if="manualReviews.length === 0" :ui="{ root: 'border-dashed', body: 'px-6 py-10 sm:px-6 sm:py-10 text-center' }">
              <UIcon name="i-heroicons-star" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No manual reviews yet.</p>
            </UCard>
            <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
              <div v-for="review in manualReviews" :key="review.id" class="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium text-highlighted">{{ review.author_name }}</p>
                    <UBadge color="neutral" variant="soft">{{ review.rating }} stars</UBadge>
                    <UBadge :color="review.status === 'approved' ? 'success' : 'neutral'" variant="soft">{{ review.status }}</UBadge>
                  </div>
                  <p v-if="review.title" class="mt-2 text-sm font-medium text-highlighted">{{ review.title }}</p>
                  <p class="mt-1 text-sm text-muted">{{ review.content }}</p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <UButton size="xs" color="neutral" variant="soft" icon="i-heroicons-pencil-square" @click="editReview(review)">Edit</UButton>
                  <UButton size="xs" color="error" variant="ghost" icon="i-heroicons-trash" @click="deleteReview(review)">Delete</UButton>
                </div>
              </div>
            </UCard>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
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

interface ManualReview {
  id: string
  author_name: string
  rating: number
  title: string | null
  content: string
  status: string
  source: string
  created_at: string
  updated_at: string
}

interface GbConnection {
  id: string
  provider_account_email: string
  status: string
  expires_at?: string
  created_at: string
  updated_at: string
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
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const routeLocation = String(route.params.locationSlug || '')
const resolvedLocation = computed(() =>
  dashboard.locations.value.find(location => location.slug === routeLocation || location.id === routeLocation)
)
const locationId = computed(() => resolvedLocation.value?.id ?? routeLocation)

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<ApiRecord | null>(null)
const location = ref<BusinessLocation | null>(null)
const menus = ref<ApiRecord[]>([])
const gbConnection = ref<GbConnection | null>(null)
const connectingGoogle = ref(false)
const syncingPlace = ref(false)
const placeSyncResult = ref('')
const { paths, buildHeaderLinks, locationMenuPath, locationContentPath, locationPath } = useDashboardSiteLinks(siteId, computed(() => {
  const value = site.value?.public_url
  return typeof value === 'string' ? value : null
}))

const _locationAddress = computed(() => location.value?.address?.addressLines?.join(', ') || '')
const publicLocationUrl = computed(() => {
  if (!location.value?.slug || !site.value?.public_url) return ''
  return `${site.value.public_url.replace(/\/$/, '')}/locations/${location.value.slug}`
})

const _headerLinks = computed(() => buildHeaderLinks([
  { label: 'All Locations', icon: 'i-heroicons-arrow-left', to: paths.value.locations, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'Preview', icon: 'i-heroicons-arrow-top-right-on-square', to: publicLocationUrl.value, target: '_blank', color: 'neutral' as const, variant: 'outline' as const, disabled: !publicLocationUrl.value }
], { includePreview: false }))

const locationTabs = computed(() => [
  { label: 'Overview', icon: 'i-heroicons-home', active: true, to: locationPath(locationId.value) },
  { label: 'Content', icon: 'i-heroicons-document-text', active: false, to: locationContentPath(locationId.value) },
  { label: 'Menu', icon: 'i-heroicons-list-bullet', active: false, to: locationMenuPath(locationId.value) },
  { label: 'Details', icon: 'i-heroicons-map-pin', active: false, to: `${paths.value.settings}?tab=locations&locationId=${locationId.value}` }
])

const workspaceActions = computed(() => [
  { label: 'Edit Local Content', icon: 'i-heroicons-document-text', to: locationContentPath(locationId.value) },
  { label: 'Edit Local Menu', icon: 'i-heroicons-list-bullet', to: locationMenuPath(locationId.value) },
  { label: 'Edit Location Details', icon: 'i-heroicons-cog-6-tooth', to: `${paths.value.settings}?tab=locations&locationId=${locationId.value}` },
  { label: 'Edit Brand Content', icon: 'i-heroicons-building-storefront', to: paths.value.content }
])

const detailsSaving = ref(false)
const detailsSaved = ref(false)
const reviewsLoading = ref(false)
const reviewSaving = ref(false)
const reviewFormVisible = ref(false)
const editingReviewId = ref<string | null>(null)
const manualReviews = ref<ManualReview[]>([])

const detailsForm = reactive({
  title: '',
  slug: '',
  city: '',
  neighborhood: '',
  phone: '',
  email: '',
  website_url: '',
  maps_url: '',
  google_place_id: '',
  rating: '',
  review_count: '',
  price_level: '',
  address: '',
  short_description: '',
  description: '',
  is_primary: false,
  status: 'active',
  notification_phone: '',
  timezone: '',
})

const timezoneOptions = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const openingHours = ref<DayHours[]>(WEEKDAYS.map(day => ({
  day,
  isOpen: true,
  openTime: '09:00',
  closeTime: '22:00'
})))

const reviewForm = reactive({
  author_name: '',
  rating: '5',
  title: '',
  content: '',
  created_at: ''
})

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
  detailsForm.google_place_id = loc.google_place_id ?? ''
  detailsForm.rating = loc.rating === null || loc.rating === undefined ? '' : String(loc.rating)
  detailsForm.review_count = loc.review_count === null || loc.review_count === undefined ? '' : String(loc.review_count)
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

const optionalNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const optionalInteger = (value: string) => {
  const trimmed = value.trim()
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

function resetReviewForm() {
  editingReviewId.value = null
  reviewForm.author_name = ''
  reviewForm.rating = '5'
  reviewForm.title = ''
  reviewForm.content = ''
  reviewForm.created_at = new Date().toISOString().slice(0, 10)
}

function startNewReview() {
  resetReviewForm()
  reviewFormVisible.value = true
}

function editReview(review: ManualReview) {
  editingReviewId.value = review.id
  reviewForm.author_name = review.author_name
  reviewForm.rating = String(review.rating)
  reviewForm.title = review.title ?? ''
  reviewForm.content = review.content
  reviewForm.created_at = review.created_at ? review.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  reviewFormVisible.value = true
}

function cancelReviewEdit() {
  reviewFormVisible.value = false
  resetReviewForm()
}

async function loadManualReviews() {
  reviewsLoading.value = true
  try {
    const response = await $fetch<{ success: boolean; reviews: ManualReview[] }>(
      `/api/dashboard/locations/${locationId.value}/reviews`
    )
    if (!response.success) throw new Error('Failed to load manual reviews')
    manualReviews.value = response.reviews
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to load manual reviews'), color: 'error' })
  } finally {
    reviewsLoading.value = false
  }
}

async function saveReview() {
  reviewSaving.value = true
  try {
    const rating = Number(reviewForm.rating)
    const body = {
      author_name: reviewForm.author_name,
      rating: Number.isInteger(rating) ? rating : 5,
      title: reviewForm.title || null,
      content: reviewForm.content,
      status: 'approved',
      created_at: reviewForm.created_at ? `${reviewForm.created_at}T00:00:00.000Z` : new Date().toISOString()
    }
    if (editingReviewId.value) {
      const response = await $fetch<{ success: boolean; review: ManualReview }>(
        `/api/dashboard/locations/${locationId.value}/reviews/${editingReviewId.value}`,
        { method: 'PATCH', body }
      )
      if (!response.success) throw new Error('Failed to update review')
      const idx = manualReviews.value.findIndex(review => review.id === editingReviewId.value)
      if (idx !== -1) manualReviews.value[idx] = response.review
    } else {
      const response = await $fetch<{ success: boolean; review: ManualReview }>(
        `/api/dashboard/locations/${locationId.value}/reviews`,
        { method: 'POST', body }
      )
      if (!response.success) throw new Error('Failed to create review')
      manualReviews.value.unshift(response.review)
    }
    reviewFormVisible.value = false
    resetReviewForm()
    toast.add({ description: 'Review saved', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save review'), color: 'error' })
  } finally {
    reviewSaving.value = false
  }
}

async function deleteReview(review: ManualReview) {
  if (!confirm(`Delete review from "${review.author_name}"? This cannot be undone.`)) return
  reviewSaving.value = true
  try {
    await $fetch(`/api/dashboard/locations/${locationId.value}/reviews/${review.id}`, { method: 'DELETE' })
    manualReviews.value = manualReviews.value.filter(item => item.id !== review.id)
    toast.add({ description: 'Review deleted', color: 'neutral' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to delete review'), color: 'error' })
  } finally {
    reviewSaving.value = false
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
  const workspaceLoaded = await loadLocationWorkspace()
  await loadGbConnection()
  if (workspaceLoaded) await loadManualReviews()

  if (route.query.gb === 'connected') {
    toast.add({ description: 'Google Business connected successfully', color: 'success' })
    const { gb: _gb, ...restQuery } = route.query
    router.replace({ path: route.path, query: restQuery })
  }

  evaluateAndSuggest()
})

useSeoMeta({ title: 'Location Workspace | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
