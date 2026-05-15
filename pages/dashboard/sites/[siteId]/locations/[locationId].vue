<template>
  <UPage>
    <UPageHeader
      :title="location?.title || 'Location'"
      :description="locationAddress || location?.city || 'Location workspace'"
      :links="headerLinks"
    >
      <template #headline>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="location?.is_primary" color="primary" variant="soft">Primary</UBadge>
          <UBadge v-if="location" :color="location.status === 'active' ? 'success' : 'warning'" variant="soft">{{ location.status }}</UBadge>
        </div>
      </template>
    </UPageHeader>

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
                <h2 class="font-semibold text-highlighted">Google Business</h2>
              </div>
            </template>

            <div class="space-y-4 text-sm">
              <div v-if="gbConnection" class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted">Account</span>
                  <span class="truncate text-right text-highlighted">{{ gbConnection.provider_account_email }}</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted">Status</span>
                  <UBadge color="success" variant="soft">Connected</UBadge>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted">Last synced</span>
                  <span class="text-right text-highlighted">{{ location.last_synced_at || 'Never' }}</span>
                </div>
              </div>

              <div v-else class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-muted">Status</span>
                  <UBadge color="neutral" variant="soft">Not connected</UBadge>
                </div>
                <p class="text-muted">Connect Google Business to sync reviews, photos, and location data.</p>
              </div>

              <div class="flex flex-col gap-2">
                <UButton
                  v-if="!gbConnection"
                  icon="i-simple-icons-google"
                  :loading="connectingGoogle"
                  block
                  @click="connectGoogleBusiness"
                >
                  Connect Google Business
                </UButton>
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
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Details</h2>
          </template>

          <dl class="grid gap-4 md:grid-cols-2">
            <div>
              <dt class="text-sm text-muted">Slug</dt>
              <dd class="mt-1 font-medium text-highlighted">/{{ location.slug }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Address</dt>
              <dd class="mt-1 font-medium text-highlighted">{{ locationAddress || 'Not set' }}</dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-highlighted">Location Fields</h2>
              <UButton v-if="detailsSaved" size="xs" color="success" variant="soft" icon="i-heroicons-check">Saved</UButton>
            </div>
          </template>

          <div class="space-y-5">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Name">
                <UInput v-model="detailsForm.title" />
              </UFormField>
              <UFormField label="Slug">
                <UInput v-model="detailsForm.slug" />
              </UFormField>
              <UFormField label="City">
                <UInput v-model="detailsForm.city" />
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
              <UFormField label="Maps URL">
                <UInput v-model="detailsForm.maps_url" type="url" />
              </UFormField>
              <UFormField label="Google Place ID">
                <UInput v-model="detailsForm.google_place_id" />
              </UFormField>
              <UFormField label="Rating">
                <UInput v-model="detailsForm.rating" type="number" min="0" max="5" step="0.1" />
              </UFormField>
              <UFormField label="Review Count">
                <UInput v-model="detailsForm.review_count" type="number" min="0" step="1" />
              </UFormField>
              <UFormField label="Price Level">
                <UInput v-model="detailsForm.price_level" />
              </UFormField>
              <UFormField label="Facebook URL">
                <UInput v-model="detailsForm.facebook_url" type="url" />
              </UFormField>
              <UFormField label="Instagram URL">
                <UInput v-model="detailsForm.instagram_url" type="url" />
              </UFormField>
              <UFormField label="TikTok URL">
                <UInput v-model="detailsForm.tiktok_url" type="url" />
              </UFormField>
            </div>

            <UFormField label="Address">
              <UTextarea v-model="detailsForm.address" :rows="2" />
            </UFormField>
            <UFormField label="Short Description">
              <UInput v-model="detailsForm.short_description" />
            </UFormField>
            <UFormField label="Description">
              <UTextarea v-model="detailsForm.description" :rows="4" />
            </UFormField>
            <UFormField label="Opening Hours">
              <UTextarea v-model="detailsForm.opening_hours" :rows="7" />
            </UFormField>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
              <div class="flex items-center gap-6">
                <UCheckbox v-model="detailsForm.is_primary" label="Primary location" />
                <UCheckbox
                  :model-value="detailsForm.status === 'active'"
                  label="Active"
                  @update:model-value="setDetailsActive"
                />
              </div>
              <UButton :loading="detailsSaving" icon="i-heroicons-check" @click="saveLocationDetails">Save fields</UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">Hero Media</h2>
              <UButton v-if="heroSaved" size="xs" color="success" variant="soft" icon="i-heroicons-check">Saved</UButton>
            </div>
          </template>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Hero Image">
              <MediaPicker
                v-model="heroImageAssetId"
                :site-id="siteId"
                :location-id="locationId"
                accept="image"
                title="Location hero image"
                @change="debouncedSaveHeroMedia"
              />
            </UFormField>
            <UFormField label="Hero Video">
              <MediaPicker
                v-model="heroVideoAssetId"
                :site-id="siteId"
                :location-id="locationId"
                accept="video"
                title="Location hero video"
                @change="debouncedSaveHeroMedia"
              />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-highlighted">Manual Reviews</h2>
              <UButton size="sm" icon="i-heroicons-plus" @click="startNewReview">Add review</UButton>
            </div>
          </template>

          <div class="space-y-5">
            <div v-if="reviewFormVisible" class="rounded-lg border border-default bg-elevated p-4">
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
            </div>

            <div v-if="reviewsLoading" class="flex items-center gap-3 text-sm text-muted">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
              Loading reviews...
            </div>
            <div v-else-if="manualReviews.length === 0" class="rounded-lg border border-dashed border-default px-6 py-10 text-center">
              <UIcon name="i-heroicons-star" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No manual reviews yet.</p>
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
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
            </div>
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
  phone: string | null
  email: string | null
  website_url: string | null
  maps_url: string | null
  description: string | null
  short_description: string | null
  price_level: string | null
  facebook_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
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

const route = useRoute()
const router = useRouter()
const toast = useToast()
const siteId = route.params.siteId as string
const locationId = route.params.locationId as string

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<ApiRecord | null>(null)
const location = ref<BusinessLocation | null>(null)
const menus = ref<ApiRecord[]>([])
const gbConnection = ref<GbConnection | null>(null)
const connectingGoogle = ref(false)

const locationAddress = computed(() => location.value?.address?.addressLines?.join(', ') || '')
const publicLocationUrl = computed(() => {
  if (!site.value?.public_url || !location.value?.slug) return ''
  return `${site.value.public_url.replace(/\/$/, '')}/locations/${location.value.slug}`
})

const headerLinks = computed(() => [
  { label: 'All Locations', icon: 'i-heroicons-arrow-left', to: `/dashboard/sites/${siteId}/locations`, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'View', icon: 'i-heroicons-arrow-top-right-on-square', to: publicLocationUrl.value, target: '_blank', color: 'neutral' as const, variant: 'outline' as const, disabled: !publicLocationUrl.value }
])

const locationTabs = computed(() => [
  { label: 'Overview', icon: 'i-heroicons-home', active: true, to: `/dashboard/sites/${siteId}/locations/${locationId}` },
  { label: 'Content', icon: 'i-heroicons-document-text', active: false, to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location` },
  { label: 'Menu', icon: 'i-heroicons-list-bullet', active: false, to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}` },
  { label: 'Details', icon: 'i-heroicons-map-pin', active: false, to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}` }
])

const workspaceActions = computed(() => [
  { label: 'Edit Local Content', icon: 'i-heroicons-document-text', to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location` },
  { label: 'Edit Local Menu', icon: 'i-heroicons-list-bullet', to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}` },
  { label: 'Edit Location Details', icon: 'i-heroicons-cog-6-tooth', to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}` },
  { label: 'Edit Brand Content', icon: 'i-heroicons-building-storefront', to: `/dashboard/sites/${siteId}/content` }
])

const heroImageAssetId = ref<string | null>(null)
const heroVideoAssetId = ref<string | null>(null)
const heroSaved = ref(false)
let heroSaveTimeout: ReturnType<typeof setTimeout> | null = null
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
  phone: '',
  email: '',
  website_url: '',
  maps_url: '',
  google_place_id: '',
  rating: '',
  review_count: '',
  price_level: '',
  facebook_url: '',
  instagram_url: '',
  tiktok_url: '',
  address: '',
  short_description: '',
  description: '',
  opening_hours: '',
  is_primary: false,
  status: 'active'
})

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
  if (loc) {
    heroImageAssetId.value = loc.hero_image_asset_id ?? null
    heroVideoAssetId.value = loc.hero_video_asset_id ?? null
    fillDetailsForm(loc)
  }
})

function fillDetailsForm(loc: BusinessLocation) {
  detailsForm.title = loc.title
  detailsForm.slug = loc.slug
  detailsForm.city = loc.city ?? ''
  detailsForm.phone = loc.phone ?? ''
  detailsForm.email = loc.email ?? ''
  detailsForm.website_url = loc.website_url ?? ''
  detailsForm.maps_url = loc.maps_url ?? ''
  detailsForm.google_place_id = loc.google_place_id ?? ''
  detailsForm.rating = loc.rating === null || loc.rating === undefined ? '' : String(loc.rating)
  detailsForm.review_count = loc.review_count === null || loc.review_count === undefined ? '' : String(loc.review_count)
  detailsForm.price_level = loc.price_level ?? ''
  detailsForm.facebook_url = loc.facebook_url ?? ''
  detailsForm.instagram_url = loc.instagram_url ?? ''
  detailsForm.tiktok_url = loc.tiktok_url ?? ''
  detailsForm.address = loc.address?.addressLines?.join('\n') ?? ''
  detailsForm.short_description = loc.short_description ?? ''
  detailsForm.description = loc.description ?? ''
  detailsForm.opening_hours = loc.opening_hours?.weekdayDescriptions?.join('\n') ?? ''
  detailsForm.is_primary = loc.is_primary
  detailsForm.status = loc.status
}

const setDetailsActive = (v: boolean | 'indeterminate') => {
  if (v === 'indeterminate') return
  detailsForm.status = v ? 'active' : 'inactive'
}

async function saveLocationDetails() {
  detailsSaving.value = true
  try {
    const response = await $fetch<{ success: boolean; location: BusinessLocation }>(`/api/sites/${siteId}/locations/${locationId}`, {
      method: 'PATCH',
      body: {
        title: detailsForm.title,
        slug: detailsForm.slug,
        city: detailsForm.city || null,
        phone: detailsForm.phone || null,
        email: detailsForm.email || null,
        website_url: detailsForm.website_url || null,
        maps_url: detailsForm.maps_url || null,
        google_place_id: detailsForm.google_place_id || null,
        rating: detailsForm.rating,
        review_count: detailsForm.review_count,
        price_level: detailsForm.price_level || null,
        facebook_url: detailsForm.facebook_url || null,
        instagram_url: detailsForm.instagram_url || null,
        tiktok_url: detailsForm.tiktok_url || null,
        address: detailsForm.address ? { addressLines: detailsForm.address.split('\n').map(line => line.trim()).filter(Boolean) } : null,
        short_description: detailsForm.short_description || null,
        description: detailsForm.description || null,
        opening_hours: detailsForm.opening_hours ? { weekdayDescriptions: detailsForm.opening_hours.split('\n').map(line => line.trim()).filter(Boolean) } : null,
        is_primary: detailsForm.is_primary,
        status: detailsForm.status
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

async function saveHeroMedia() {
  try {
    await $fetch(`/api/sites/${siteId}/locations/${locationId}`, {
      method: 'PATCH',
      body: { hero_image_asset_id: heroImageAssetId.value, hero_video_asset_id: heroVideoAssetId.value },
    })
    heroSaved.value = true
    setTimeout(() => { heroSaved.value = false }, 2000)
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save'), color: 'error' })
  }
}

function debouncedSaveHeroMedia() {
  if (heroSaveTimeout) {
    clearTimeout(heroSaveTimeout)
  }
  heroSaveTimeout = setTimeout(() => {
    saveHeroMedia()
  }, 500)
}

const connectGoogleBusiness = async () => {
  connectingGoogle.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl: string }>(
      `/api/sites/${siteId}/locations/${locationId}/integrations/google-business/auth`,
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
      `/api/sites/${siteId}/locations/${locationId}/integrations/google-business`
    )
    gbConnection.value = res.connection
  } catch {
    // Google Business connection is optional for a location.
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
      `/api/sites/${siteId}/locations/${locationId}/reviews`
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
    const body = {
      author_name: reviewForm.author_name,
      rating: reviewForm.rating,
      title: reviewForm.title || null,
      content: reviewForm.content,
      status: 'approved',
      created_at: reviewForm.created_at ? `${reviewForm.created_at}T00:00:00.000Z` : new Date().toISOString()
    }
    if (editingReviewId.value) {
      const response = await $fetch<{ success: boolean; review: ManualReview }>(
        `/api/sites/${siteId}/locations/${locationId}/reviews/${editingReviewId.value}`,
        { method: 'PATCH', body }
      )
      if (!response.success) throw new Error('Failed to update review')
      const idx = manualReviews.value.findIndex(review => review.id === editingReviewId.value)
      if (idx !== -1) manualReviews.value[idx] = response.review
    } else {
      const response = await $fetch<{ success: boolean; review: ManualReview }>(
        `/api/sites/${siteId}/locations/${locationId}/reviews`,
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
    await $fetch(`/api/sites/${siteId}/locations/${locationId}/reviews/${review.id}`, { method: 'DELETE' })
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
      $fetch<ApiRecord>(`/api/sites/${siteId}/settings`),
      $fetch<{ success: boolean; location: BusinessLocation }>(`/api/sites/${siteId}/locations/${locationId}`),
      $fetch<{ success: boolean; menus: ApiRecord[] }>(`/api/editor/sites/${siteId}/menus?locationId=${locationId}`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationResponse.success) throw new Error('Failed to load location')
    if (!menusResponse.success) throw new Error('Failed to load menus')

    site.value = settingsResponse.settings
    location.value = locationResponse.location
    menus.value = menusResponse.menus
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load location'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadLocationWorkspace()
  await loadGbConnection()
  await loadManualReviews()

  if (route.query.gb === 'connected') {
    toast.add({ description: 'Google Business connected successfully', color: 'success' })
    const { gb: _gb, ...restQuery } = route.query
    router.replace({ path: route.path, query: restQuery })
  }
})

useSeoMeta({ title: 'Location Workspace | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
