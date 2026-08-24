<template>
  <UDashboardPanel id="site-media">
    <template #header>
      <UDashboardNavbar title="Media library">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Filters -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UInput v-model="search" placeholder="Search files…" icon="i-lucide-search" size="sm" />
        <div class="flex gap-1">
          <UButton
            v-for="k in kindTabs"
            :key="k.value"
            size="sm"
            :variant="kindFilter === k.value ? 'soft' : 'ghost'"
            color="neutral"
            @click="kindFilter = k.value; load()"
          >
            {{ k.label }}
          </UButton>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="selected.size" class="text-sm text-muted">{{ selected.size }} selected</span>
          <UButton
            v-if="selected.size"
            size="sm"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :loading="deleting"
            @click="deleteSelected"
          >
            Delete
          </UButton>
        </div>
      </div>

      <!-- Upload zone -->
      <div
        class="mb-4 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors cursor-pointer"
        @dragenter.prevent="handleDragEnter"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        :class="[isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-accented', uploadLoading ? 'pointer-events-none opacity-60' : '']"
        @click="openUploadPicker"
      >
        <UIcon name="i-lucide-upload" class="size-7 text-muted" />
        <p class="text-sm text-muted">Drag and drop images or videos here, or <span class="text-primary cursor-pointer">click to browse</span></p>
        <p class="text-xs text-muted">Images up to {{ formatSize(IMAGE_MAX_SIZE_BYTES) }} via Cloudflare Images · Videos up to {{ formatSize(VIDEO_MAX_SIZE_BYTES) }} via R2</p>
        <p class="text-xs text-muted">Use this site-wide library for page media, posts, galleries, and reusable assets.</p>
      </div>

      <UInput ref="fileInput" type="file" accept="image/*,video/*" class="hidden" :disabled="uploadLoading" @change="onFileSelect" />

      <UAlert v-if="uploadError" color="error" variant="soft" :description="uploadError" icon="i-lucide-triangle-alert" class="mb-4" />
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        title="Media could not be loaded"
        :description="loadError"
        icon="i-lucide-triangle-alert"
        class="mb-4"
      />
      <div v-if="pendingRetryFile" class="mb-4">
        <UButton size="sm" color="neutral" variant="soft" :loading="uploadLoading" :disabled="uploadLoading" @click="retryPendingUpload">
          Retry confirm
        </UButton>
      </div>

      <!-- Grid -->
      <div v-if="loading" class="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        <div v-for="i in 14" :key="i" class="aspect-square rounded-lg bg-elevated animate-pulse" />
      </div>

      <div v-else-if="!loadError && assets.length === 0 && (search || kindFilter)" class="py-16 text-center">
        <UIcon name="i-lucide-search-x" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-medium text-highlighted">No matches</p>
        <p class="mt-1 text-xs text-muted">Try a different search term or filter.</p>
      </div>

      <div v-else-if="!loadError && assets.length === 0" class="py-16 text-center">
        <UIcon name="i-lucide-image" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-medium text-highlighted">No media yet</p>
        <p class="mt-1 text-xs text-muted">Upload images or videos to get started.</p>
      </div>

      <div v-else class="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-all"
          :class="selected.has(asset.id) ? 'border-primary' : 'border-transparent'"
        >
          <!-- Thumbnail -->
          <img
            v-if="asset.thumbnail_url || (asset.kind === 'image' && asset.public_url)"
            :src="asset.thumbnail_url || asset.public_url || undefined"
            :alt="asset.alt_text || asset.file_name || ''"
            class="h-full w-full cursor-pointer object-cover"
            loading="lazy"
            @click="toggleSelect(asset.id)"
          />
          <div
            v-else
            class="flex h-full w-full cursor-pointer items-center justify-center bg-elevated"
            @click="toggleSelect(asset.id)"
          >
            <UIcon
              :name="asset.kind === 'video' ? 'i-lucide-film' : 'i-lucide-file'"
              class="size-6 text-muted"
            />
          </div>

          <!-- Checkbox -->
          <div
            class="absolute left-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
            :class="selected.has(asset.id) ? 'opacity-100' : ''"
          >
            <div
              class="flex size-5 cursor-pointer items-center justify-center rounded"
              :class="selected.has(asset.id) ? 'bg-primary' : 'bg-black/40'"
              @click.stop="toggleSelect(asset.id)"
            >
              <UIcon v-if="selected.has(asset.id)" name="i-lucide-check" class="size-3 text-white" />
            </div>
          </div>

          <!-- Kind badge -->
          <div class="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <UBadge :label="asset.kind" size="xs" color="neutral" variant="solid" class="uppercase" />
          </div>

          <!-- Filename on hover -->
          <div class="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-1.5 transition-transform group-hover:translate-y-0">
            <p class="truncate text-xs text-white">{{ asset.file_name || asset.kind }}</p>
            <p v-if="asset.file_size" class="text-xs text-white/60">{{ formatSize(asset.file_size) }}</p>
          </div>
        </div>
      </div>

      <!-- Load more -->
      <div v-if="hasMore" class="mt-6 text-center">
        <UButton color="neutral" variant="ghost" :loading="loadingMore" @click="loadMore">Load more</UButton>
      </div>

    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.media' })

import { IMAGE_MAX_SIZE_BYTES, VIDEO_MAX_SIZE_BYTES } from '~/composables/useMediaUpload'
import { getErrorMessage } from '~/utils/errors'

const siteId = await useDashboardSiteId()
const siteApiBase = `/api/editor/sites/${siteId}`
const toast = useToast()

interface MediaAsset {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  kind: 'image' | 'video' | 'file'
  provider: 'cloudflare_images' | 'cloudflare_r2' | 'external_url' | 'chowbot'
  source: 'uploaded' | 'google_sync' | 'generated' | 'external'
  cloudflare_image_id: string | null
  r2_key: string | null
  google_media_name: string | null
  public_url: string | null
  thumbnail_url: string | null
  mime_type: string | null
  file_name: string | null
  file_size: number | null
  width: number | null
  height: number | null
  duration: number | null
  alt_text: string | null
  status: 'pending' | 'active' | 'deleted' | 'failed'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

const assets = ref<MediaAsset[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const loadingMore = ref(false)
const deleting = ref(false)
const isDragging = ref(false)
const dragCounter = ref(0)
const fileInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const search = ref('')
const kindFilter = ref('')
const selected = ref(new Set<string>())
const offset = ref(0)
const hasMore = ref(false)
const LIMIT = 50
const isMediaResponse = (value: unknown): value is { media: MediaAsset[] } =>
  isRecord(value)
  && Array.isArray(value.media)
  && value.media.every(asset =>
    isRecord(asset)
    && typeof asset.id === 'string'
    && typeof asset.kind === 'string'
    && typeof asset.status === 'string',
  )
const {
  uploading: uploadLoading,
  error: uploadError,
  pendingRetryFile,
  upload,
} = useMediaUpload(siteApiBase)

const kindTabs = [
  { label: 'All', value: '' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
]

// Guards against a debounced search reload (or a filter click) landing while
// an earlier load()/loadMore() is still in flight — without this, a stale
// response can overwrite assets/hasMore with results for a since-changed
// search term or filter.
let mediaRequestToken = 0

async function load() {
  const requestToken = ++mediaRequestToken
  loading.value = true
  loadError.value = null
  offset.value = 0
  selected.value.clear()
  try {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: '0' })
    if (kindFilter.value) params.set('kind', kindFilter.value)
    if (search.value) params.set('search', search.value)
    const res = await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?${params}`, {
      validate: isMediaResponse,
    })
    if (requestToken !== mediaRequestToken) return
    assets.value = res.media ?? []
    hasMore.value = assets.value.length === LIMIT
  } catch (err) {
    if (requestToken !== mediaRequestToken) return
    if (import.meta.dev) console.error('Failed to load media:', err)
    loadError.value = getErrorMessage(err, 'Failed to load media')
    hasMore.value = false
    toast.add({ title: loadError.value, color: 'error' })
  } finally {
    if (requestToken === mediaRequestToken) loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value) return
  const requestToken = mediaRequestToken
  loadingMore.value = true
  const requestOffset = offset.value + LIMIT
  try {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(requestOffset) })
    if (kindFilter.value) params.set('kind', kindFilter.value)
    if (search.value) params.set('search', search.value)
    const res = await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?${params}`, {
      validate: isMediaResponse,
    })
    if (requestToken !== mediaRequestToken) return
    const more = res.media ?? []
    assets.value.push(...more)
    offset.value = requestOffset
    hasMore.value = more.length === LIMIT
  } catch (err) {
    if (requestToken !== mediaRequestToken) return
    if (import.meta.dev) console.error('Failed to load more media:', err)
    toast.add({ title: getErrorMessage(err, 'Failed to load more media'), color: 'error' })
  } finally {
    if (requestToken === mediaRequestToken) loadingMore.value = false
  }
}

function toggleSelect(id: string) {
  if (selected.value.has(id)) {
    selected.value.delete(id)
  } else {
    selected.value.add(id)
  }
}

async function deleteSelected() {
  if (!selected.value.size) return
  deleting.value = true
  const selectedIds = [...selected.value]
  try {
    await Promise.all(selectedIds.map(id =>
      dashboardApi(`${siteApiBase}/media/${id}`, {
        method: 'DELETE',
        validate: (value): value is { success: true } => isRecord(value) && value.success === true,
      })
    ))
    const deleted = new Set(selectedIds)
    assets.value = assets.value.filter(asset => !deleted.has(asset.id))
    selected.value.clear()
    toast.add({ title: `${selectedIds.length} item(s) deleted`, icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({ title: getErrorMessage(error, 'Failed to delete media'), color: 'error' })
  } finally { deleting.value = false }
}

function handleDragEnter() {
  dragCounter.value += 1
  isDragging.value = true
}

function handleDragOver() {
  if (dragCounter.value > 0) isDragging.value = true
}

function handleDragLeave() {
  dragCounter.value = Math.max(0, dragCounter.value - 1)
  isDragging.value = dragCounter.value > 0
}

function handleDrop(e: DragEvent) {
  dragCounter.value = 0
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) handleSelectedFile(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleSelectedFile(file)
  if (fileInput.value?.inputRef) fileInput.value.inputRef.value = ''
}

function openUploadPicker() {
  if (uploadLoading.value) return
  fileInput.value?.inputRef?.click()
}

function handleSelectedFile(file: File) {
  void uploadFile(file)
}

async function retryPendingUpload() {
  const pendingUpload = pendingRetryFile.value
  if (!pendingUpload) return
  await uploadFile(pendingUpload.file)
}

async function uploadFile(file: File) {
  try {
    const result = await upload(file)
    if (!result) return
    toast.add({ title: 'File uploaded', icon: 'i-lucide-circle-check', color: 'success' })
    await load()
  } catch (err) {
    uploadError.value = getErrorMessage(err, 'Upload failed.')
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const requestEvent = useRequestEvent()
const { data: initialMedia, pending: initialMediaPending, error: initialMediaError } = await useAsyncData(
  `dashboard-site-media:${siteId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardMedia } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardMedia(requestEvent, siteId, { limit: LIMIT, offset: 0 })
    }
    return await dashboardApi<{ media: MediaAsset[] }>(`${siteApiBase}/media?limit=${LIMIT}&offset=0`, {
      validate: isMediaResponse,
    })
  },
  { lazy: import.meta.client },
)

watch([initialMedia, initialMediaPending, initialMediaError], ([data, pending, error]) => {
  loading.value = pending
  if (error) {
    loadError.value = getErrorMessage(error, 'Failed to load media')
    return
  }
  if (data) {
    assets.value = data.media as MediaAsset[]
    hasMore.value = data.media.length === LIMIT
    loadError.value = null
  }
}, { immediate: true })

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => { void load() }, 300)
})
</script>
