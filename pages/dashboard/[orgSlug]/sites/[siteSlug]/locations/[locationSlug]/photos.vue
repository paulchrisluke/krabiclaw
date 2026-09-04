<template>
  <UDashboardPanel id="location-photos">
    <template #header>
      <!--
        The navbar carries the way out of the level and nothing else. Its filter,
        Upload, Attach and Refresh all now live on the screen they act on, and
        keeping a second copy here is how two sets of controls drift apart.
      -->
      <UDashboardNavbar title="Location" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="paths.project" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>

      <DashboardGridEditor
        v-model:selecting="selecting"
        v-model:selected="selectedIds"
        title="Photos"
        description="Upload images or videos here, or attach existing media to this location."
        :items="gridItems"
        :pending="loading"
        :error="loadError"
        empty-title="No location media yet"
        empty-icon="i-lucide-image"
        add-label="Add photos"
        selection-title="Select photos"
        grid-class="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:grid-cols-7"
        :removing="galleryMutating"
        @add="openAttachModal"
        @open="openPhoto"
        @remove-many="detachMany"
      >
        <template #actions>
          <UButton icon="i-lucide-upload" color="neutral" variant="soft" :loading="uploading" aria-label="Upload a file" square @click="openUploadPicker" />
        </template>

        <template #filters>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="item in categoryItems"
              :key="item.id"
              size="sm"
              color="neutral"
              :variant="categoryFilter === item.id ? 'soft' : 'ghost'"
              @click="categoryFilter = item.id"
            >
              {{ item.label }}
            </UButton>
          </div>

          <div v-if="pendingRetryFile" class="mt-4">
            <UButton size="sm" color="neutral" variant="soft" :loading="uploading" :disabled="uploading" @click="retryPendingUpload">
              Retry confirm
            </UButton>
          </div>
          <UAlert v-if="uploadError" color="error" variant="soft" :description="uploadError" icon="i-lucide-triangle-alert" class="mt-4" />
          <UInput ref="fileInput" type="file" accept="image/*,video/*" class="hidden" :disabled="uploading" @change="onFileSelect" />
        </template>

        <template #tile="{ item }">
          <img
            v-if="item.row.thumbnail_url || item.row.public_url"
            :src="item.row.thumbnail_url || item.row.public_url || undefined"
            :alt="item.row.alt_text || item.row.file_name || ''"
            class="h-full w-full object-cover"
            loading="lazy"
          >
          <div v-else class="flex h-full w-full items-center justify-center bg-elevated">
            <UIcon name="i-lucide-film" class="size-6 text-muted" />
          </div>
          <div class="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1 opacity-0 transition group-hover:opacity-100">
            <p class="truncate text-xs text-white">{{ item.row.file_name || item.row.kind }}</p>
            <p class="truncate text-xs text-white/70">{{ categoryLabel(item.row.category) }}</p>
          </div>
        </template>
      </DashboardGridEditor>

      <DashboardListItemDialog
        v-model:open="photoOpen"
        :title="openPhotoAsset?.file_name || 'Photo'"
        removable
        :saving="galleryMutating"
        :removing="galleryMutating"
        @save="savePhoto"
        @remove="detachOpenPhoto"
      >
        <img
          v-if="openPhotoAsset && (openPhotoAsset.thumbnail_url || openPhotoAsset.public_url)"
          :src="openPhotoAsset.thumbnail_url || openPhotoAsset.public_url || undefined"
          :alt="openPhotoAsset.alt_text || openPhotoAsset.file_name || ''"
          class="mx-auto max-h-64 rounded-lg object-contain"
        >
        <UFormField label="Category">
          <USelect v-model="photoCategory" :items="assignableCategories" value-key="id" label-key="label" class="w-full" />
        </UFormField>
      </DashboardListItemDialog>

      <UModal v-model:open="attachOpen" :ui="{ content: 'max-w-4xl' }">
        <template #content>
          <div class="p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">Attach existing media</h2>
                <p class="mt-1 text-sm text-muted">Choose images or videos from the site media library for this location gallery.</p>
              </div>
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="attachLoading" @click="loadAttachableMedia" />
            </div>
            <div v-if="attachLoading" class="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
              <USkeleton v-for="i in 10" :key="i" class="aspect-square rounded-lg" />
            </div>
            <div v-else class="mt-5 grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-5">
              <button
                v-for="asset in attachableAssets"
                :key="asset.id"
                type="button"
                class="group relative aspect-square overflow-hidden rounded-lg border border-default bg-elevated text-left"
                :disabled="galleryMutating"
                @click="attachPhoto(asset)"
              >
                <img
                  v-if="asset.thumbnail_url || asset.public_url"
                  :src="asset.thumbnail_url || asset.public_url || undefined"
                  :alt="asset.alt_text || asset.file_name || ''"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
                <span class="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                  Attach
                </span>
              </button>
            </div>
          </div>
        </template>
      </UModal>

    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardGridEditor from '~/components/dashboard/DashboardGridEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'

const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.photos' })

const { paths } = useDashboardSiteLinks()


interface MediaAsset {
  id: string
  kind: string
  public_url: string | null
  thumbnail_url: string | null
  alt_text: string | null
  file_name: string | null
  category: string | null
  placement_updated_at?: string | null
}

const dashboardLocation = useDashboardLocation()
const toast = useToast()
const siteId = await useDashboardSiteId()
const siteApiBase = `/api/editor/sites/${siteId}`
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const assets = ref<MediaAsset[]>([])
const attachableAssets = ref<MediaAsset[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const attachOpen = ref(false)
const attachLoading = ref(false)
const categoryFilter = ref('all')
const fileInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const galleryMutating = ref(false)
const selecting = ref(false)
const selectedIds = ref<string[]>([])
const photoOpen = ref(false)
const openPhotoAsset = ref<MediaAsset | null>(null)
const photoCategory = ref<string>('other')
const { uploading, error: uploadError, pendingRetryFile, upload } = useMediaUpload(siteApiBase)
const isMediaResponse = (value: unknown): value is { media: MediaAsset[] } =>
  isRecord(value)
  && Array.isArray(value.media)
  && value.media.every(asset =>
    isRecord(asset)
    && typeof asset.id === 'string'
    && typeof asset.kind === 'string',
  )

const categoryItems = [
  { id: 'all', label: 'All categories' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
  { id: 'food', label: 'Food' },
  { id: 'menu', label: 'Menu' },
  { id: 'team', label: 'Team' },
  { id: 'other', label: 'Other' }
]

const filteredAssets = computed(() => {
  if (categoryFilter.value === 'all') return assets.value
  return assets.value.filter(asset => (asset.category || 'other') === categoryFilter.value)
})

const gridItems = computed(() => filteredAssets.value.map(row => ({
  id: row.id,
  title: row.file_name || row.kind,
  row,
})))

const assignableCategories = computed(() => categoryItems.filter(item => item.id !== 'all'))

// The photo's own screen: what it is, where it belongs, and the way to take it
// off this location. It replaces a tag dropdown and a delete cross that both
// lived on hover, at the corner of a tile you had to avoid clicking.
function openPhoto(item: { id: string }) {
  const asset = filteredAssets.value.find(entry => entry.id === item.id)
  if (!asset) return
  openPhotoAsset.value = asset
  photoCategory.value = asset.category ?? 'other'
  photoOpen.value = true
}

async function savePhoto() {
  const asset = openPhotoAsset.value
  if (!asset) return
  if (photoCategory.value !== (asset.category ?? 'other')) {
    // patchAsset reports its own failure and returns false. Closing regardless
    // would show the toast and then take away the form still holding the change,
    // so the only way back would be to find the photo and set it again.
    const saved = await patchAsset(asset, { category: photoCategory.value }, 'Photo category updated')
    if (!saved) return
  }
  photoOpen.value = false
}

async function detachOpenPhoto() {
  const asset = openPhotoAsset.value
  if (!asset) return
  const before = filteredAssets.value.length
  await detachMany([asset.id])
  // Stay open if the photo is still attached: the detach failed, and closing
  // would leave the grid contradicting the toast.
  if (filteredAssets.value.length < before) photoOpen.value = false
}

function categoryLabel(category: string | null) {
  return categoryItems.find(item => item.id === (category || 'other'))?.label ?? 'Other'
}

async function loadPhotos() {
  if (!locationId.value) {
    assets.value = []
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const params = new URLSearchParams({ ownerType: 'business_location', ownerId: locationId.value, slot: 'gallery', limit: '100' })
    const res = await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?${params}`, {
      validate: isMediaResponse,
    })
    assets.value = res.media
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load photos'
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load photos', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openUploadPicker() {
  if (!locationId.value || uploading.value) return
  fileInput.value?.inputRef?.click()
}

function onFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) handleSelectedFile(file)
  if (fileInput.value?.inputRef) fileInput.value.inputRef.value = ''
}

function handleSelectedFile(file: File) {
  void uploadSelectedFile(file)
}

async function retryPendingUpload() {
  const pendingUpload = pendingRetryFile.value
  if (!pendingUpload) return
  await uploadSelectedFile(pendingUpload.file, pendingUpload.options)
}

async function uploadSelectedFile(file: File, existingOptions?: { category?: string | null }) {
  try {
    const options = existingOptions ?? {
      category: categoryFilter.value === 'all' ? 'other' : categoryFilter.value,
    }
    const result = await upload(file, {
      ...options,
    })
    if (!result) {
      if (uploadError.value) toast.add({ description: uploadError.value, color: 'error' })
      return
    }

    await attachPhotoById(result.asset_id, result.kind === 'video' ? 'Video uploaded and attached' : 'Photo uploaded and attached')
  } catch (error) {
    toast.add({ description: uploadError.value ?? (error instanceof Error ? error.message : 'Failed to upload file'), color: 'error' })
  }
}

async function loadAttachableMedia() {
  attachLoading.value = true
  try {
    const params = new URLSearchParams({ limit: '100' })
    const res = await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?${params}`, {
      validate: isMediaResponse,
    })
    const attachedIds = new Set(assets.value.map(asset => asset.id))
    attachableAssets.value = res.media.filter(asset => !attachedIds.has(asset.id))
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load media library', color: 'error' })
  } finally {
    attachLoading.value = false
  }
}

async function openAttachModal() {
  attachOpen.value = true
  await loadAttachableMedia()
}

async function patchAsset(asset: MediaAsset, body: ApiRecord, successMessage: string) {
  try {
    await dashboardApi(`${siteApiBase}/media/${asset.id}`, {
      method: 'PATCH',
      body,
      validate: (value): value is { updated: true } =>
        isRecord(value) && value.updated === true,
    })
    toast.add({ description: successMessage, color: 'success' })
    await loadPhotos()
    return true
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update photo', color: 'error' })
    return false
  }
}

const GALLERY_PLACEMENT = () => ({ owner_type: 'business_location' as const, owner_id: locationId.value as string, slot: 'gallery' })

async function attachPhotoById(assetId: string, successMessage: string): Promise<boolean> {
  if (!locationId.value) return false
  galleryMutating.value = true
  try {
    await dashboardApi(`${siteApiBase}/media/placements/attach`, {
      method: 'POST',
      body: { placement: GALLERY_PLACEMENT(), asset_id: assetId },
      validate: (value): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids),
    })
    toast.add({ description: successMessage, color: 'success' })
    await loadPhotos()
    return true
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 409) {
      toast.add({ description: 'This photo is already attached.', color: 'warning' })
      await loadPhotos()
      return false
    }
    toast.add({ description: error instanceof Error ? error.message : 'Failed to attach media', color: 'error' })
    return false
  } finally {
    galleryMutating.value = false
  }
}

async function attachPhoto(asset: MediaAsset) {
  const updated = await attachPhotoById(asset.id, 'Media attached')
  if (updated) {
    attachableAssets.value = attachableAssets.value.filter(item => item.id !== asset.id)
  }
}

async function detachMany(ids: string[]) {
  if (!locationId.value || !ids.length) return
  galleryMutating.value = true
  try {
    await Promise.all(ids.map(assetId => dashboardApi(`${siteApiBase}/media/placements/remove`, {
      method: 'POST',
      body: { placement: GALLERY_PLACEMENT(), asset_id: assetId },
      validate: (value): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids),
    })))
    toast.add({ description: `${ids.length} item(s) detached from this location`, color: 'success' })
    selecting.value = false
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to remove media', color: 'error' })
  } finally {
    galleryMutating.value = false
    // Reload whatever the outcome. A rejected batch may still have detached some
    // of its photos, and the grid is the only thing telling the user which.
    await loadPhotos()
  }
}


const requestEvent = useRequestEvent()
const photosKey = computed(() => `dashboard-location-photos:${siteId}:${locationId.value ?? 'missing'}`)
const { data: photosResource, pending: photosPending, error: photosError } = await useAsyncData(
  photosKey,
  async () => {
    if (!locationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardMedia } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardMedia(requestEvent, siteId, {
        ownerType: 'business_location',
        ownerId: locationId.value,
        slot: 'gallery',
        limit: 100,
      })
    }
    const params = new URLSearchParams({ ownerType: 'business_location', ownerId: locationId.value, slot: 'gallery', limit: '100' })
    return await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?${params}`, {
      validate: isMediaResponse,
    })
  },
  { lazy: import.meta.client },
)

watch([photosResource, photosPending, photosError], ([resource, pending, error]) => {
  loading.value = pending
  if (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load photos'
    return
  }
  if (resource) {
    assets.value = resource.media as MediaAsset[]
    loadError.value = null
  }
}, { immediate: true })

useSeoMeta({ title: 'Photos | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
