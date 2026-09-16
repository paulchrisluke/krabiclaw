<template>
  <div class="space-y-6">
  <DashboardGridEditor
    v-model:selecting="selecting"
    v-model:selected="selectedIds"
    title="Media library"
    description="Site-wide library for page media, posts, galleries, and reusable assets."
    :items="gridItems"
    :pending="loading"
    :error="loadError"
    :empty-title="search || kindFilter ? 'No matches' : 'No media yet'"
    :empty-icon="search || kindFilter ? 'i-lucide-search-x' : 'i-lucide-image'"
    add-label="Upload media"
    selection-title="Select media"
    grid-class="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-7"
    :removing="deleting"
    @add="openUploadPicker"
    @open="openEditById"
    @remove-many="deleteMany"
  >
    <template #filters>
      <div class="flex flex-wrap items-center gap-2">
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
      </div>

      <div
        class="mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors"
        :class="[isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-accented', uploadLoading ? 'pointer-events-none opacity-60' : '']"
        @dragenter.prevent="handleDragEnter"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        @click="openUploadPicker"
      >
        <UIcon name="i-lucide-upload" class="size-7 text-muted" />
        <p class="text-sm text-muted">Drag and drop images or videos here, or <span class="cursor-pointer text-primary">click to browse</span></p>
        <p class="text-xs text-muted">Images up to {{ formatSize(IMAGE_MAX_SIZE_BYTES) }} via Cloudflare Images · Videos up to {{ formatSize(VIDEO_MAX_SIZE_BYTES) }} via R2</p>
      </div>

      <UInput ref="fileInput" type="file" accept="image/*,video/*" class="hidden" :disabled="uploadLoading" @change="onFileSelect" />

      <UAlert v-if="uploadError" color="error" variant="soft" :description="uploadError" icon="i-lucide-triangle-alert" class="mt-4" />
      <div v-if="pendingRetryFile" class="mt-4">
        <UButton size="sm" color="neutral" variant="soft" :loading="uploadLoading" :disabled="uploadLoading" @click="retryPendingUpload">
          Retry confirm
        </UButton>
      </div>
    </template>

    <template #tile="{ item }">
      <img
        v-if="item.row.thumbnail_url || (item.row.kind === 'image' && item.row.public_url)"
        :src="item.row.thumbnail_url || item.row.public_url || undefined"
        :alt="item.row.alt_text ?? ''"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <div v-else class="flex h-full w-full items-center justify-center bg-elevated">
        <UIcon :name="item.row.kind === 'video' ? 'i-lucide-film' : 'i-lucide-file'" class="size-6 text-muted" />
      </div>

      <UBadge :label="item.row.kind" size="xs" color="neutral" variant="solid" class="absolute right-1.5 top-1.5 uppercase opacity-0 transition-opacity group-hover:opacity-100" />

      <div class="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-1.5 transition-transform group-hover:translate-y-0">
        <p class="truncate text-xs text-white">{{ item.row.file_name || item.row.kind }}</p>
        <p v-if="item.row.file_size" class="text-xs text-white/60">{{ formatSize(item.row.file_size) }}</p>
      </div>
    </template>
  </DashboardGridEditor>

  <!--
    Alt text is a leaf, so it commits the way every other leaf does: the item
    sheet's own bar, dismiss on the left, Save on the right. It used to carry a
    lone Save button loose in the body, which made this the one place in the CMS
    where committing looked different.

    The field stays optional. An empty alt is the correct markup for a
    decorative image, and this is the one place a human sets it — the same field
    the media MCP tool writes, so an assistant filling it in and a person typing
    it are editing one value, not two.
  -->
  <DashboardListItemDialog
    v-model:open="editOpen"
    title="Media details"
    :removable="false"
    :saving="editSaving"
    :save-disabled="!altTextChanged"
    :error="editError"
    @save="saveAltText"
  >
    <template v-if="editingAsset" #default>
      <img
        v-if="editingAsset.thumbnail_url || (editingAsset.kind === 'image' && editingAsset.public_url)"
        :src="editingAsset.thumbnail_url || editingAsset.public_url || undefined"
        :alt="editAltText"
        class="mx-auto h-32 w-32 rounded-lg object-cover"
      >
      <!--
        The placeholder is a worked example rather than an instruction. "Describe
        this image" tells a writer what to do without showing what good looks
        like, and the alt text that came back was a noun or two; a sentence in
        the box demonstrates the length and the specificity. Saying who it is
        for is what makes anyone bother.
      -->
      <UFormField
        label="Alt text"
        description="A brief description of this image for readers who cannot see it. Leave it empty if the image is decorative."
      >
        <UInput
          v-model="editAltText"
          placeholder="e.g. A wood-fired oven with a margherita pizza blistering at the mouth"
          class="w-full"
        />
      </UFormField>
    </template>
    <template v-if="editingAsset" #actions>
      <DashboardResourceLocalization
        :site-id="siteId"
        resource-type="media_asset"
        :resource-id="editingAsset.id"
        resource-label="media details"
        :fields="mediaLocalizationFields"
        :language-settings-path="siteLocalizationSettingsPath"
      />
    </template>
  </DashboardListItemDialog>

  <UAlert v-if="deleteError" color="error" variant="soft" :description="deleteError" icon="i-lucide-circle-alert" class="mt-4" />

  <!-- Load more -->
  <div v-if="hasMore" class="mt-6 text-center space-y-3">
    <UButton color="neutral" variant="ghost" :loading="loadingMore" @click="loadMore">Load more</UButton>
    <UAlert v-if="loadMoreError" color="error" variant="soft" :description="loadMoreError" icon="i-lucide-circle-alert" />
  </div>
  </div>
</template>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import DashboardGridEditor from '~/components/dashboard/DashboardGridEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'

const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.media' })


import { IMAGE_MAX_SIZE_BYTES, VIDEO_MAX_SIZE_BYTES } from '~/composables/useMediaUpload'
import { getErrorMessage } from '~/utils/errors'

const siteId = await useDashboardSiteId()
const siteApiBase = `/api/editor/sites/${siteId}`

interface MediaAsset {
  id: string
  organization_id: string
  site_id: string
  kind: 'image' | 'video' | 'file'
  provider: 'cloudflare_images' | 'cloudflare_r2'
  source: 'uploaded' | 'generated'
  cloudflare_image_id: string | null
  r2_key: string | null
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
const loadMoreError = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const loadingMore = ref(false)
const deleting = ref(false)
const isDragging = ref(false)
const dragCounter = ref(0)
const fileInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const search = ref('')
const kindFilter = ref('')
const selecting = ref(false)
const selectedIds = ref<string[]>([])

const gridItems = computed(() => assets.value.map(row => ({
  id: row.id,
  title: row.file_name || row.kind,
  row,
})))
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
  // A reload replaces the grid, so a selection made against the old one would be
  // pointing at rows that may no longer be in it.
  selectedIds.value = []
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
  } finally {
    if (requestToken === mediaRequestToken) loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value) return
  const requestToken = mediaRequestToken
  loadingMore.value = true
  loadMoreError.value = null
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
    loadMoreError.value = getErrorMessage(err, 'Failed to load more media')
  } finally {
    if (requestToken === mediaRequestToken) loadingMore.value = false
  }
}


// The grid hands back an id; the page holds the record.
function openEditById(item: { id: string }) {
  const asset = assets.value.find(entry => entry.id === item.id)
  if (!asset) return
  openEdit(asset)
}

async function deleteMany(ids: string[]) {
  if (!ids.length) return
  deleting.value = true
  deleteError.value = null
  try {
    // allSettled, not all: `all` rejects on the first failure and skips the
    // filter below, so a batch where nine of ten deletions succeeded left all ten
    // on screen and told the user nothing had happened.
    const outcomes = await Promise.allSettled(ids.map(id =>
      dashboardApi(`${siteApiBase}/media/${id}`, {
        method: 'DELETE',
        validate: (value): value is { success: true } => isRecord(value) && value.success === true,
      })
    ))
    const deleted = new Set(ids.filter((_, index) => outcomes[index]?.status === 'fulfilled'))
    assets.value = assets.value.filter(asset => !deleted.has(asset.id))
    // Close selection rather than clear it: leaving the takeover open would show
    // a count for rows that no longer exist.
    selecting.value = false

    const failed = ids.length - deleted.size
    if (failed) {
      deleteError.value = `${deleted.size} of ${ids.length} deleted, ${failed} failed`
    }
  } catch (error) {
    deleteError.value = getErrorMessage(error, 'Failed to delete media')
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

// ── Edit ──
const editOpen = ref(false)
const editingAsset = ref<MediaAsset | null>(null)
const editAltText = ref('')
/** Save stays inert until the alt text actually differs from what is stored. */
const altTextChanged = computed(() => editAltText.value.trim() !== (editingAsset.value?.alt_text ?? ''))
const editSaving = ref(false)
const editError = ref<string | null>(null)
const mediaLocalizationFields = computed(() => [
  { key: 'alt_text', label: 'Alt text', source: editingAsset.value?.alt_text },
])
const route = useRoute()
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)

function openEdit(asset: MediaAsset) {
  editingAsset.value = asset
  editAltText.value = asset.alt_text ?? ''
  editError.value = null
  editOpen.value = true
}

let openedLocalizationTarget = ''
watch(assets, (rows) => {
  const target = typeof route.query.localize === 'string' ? route.query.localize : ''
  if (!target.startsWith('media_asset:') || target === openedLocalizationTarget) return
  const asset = rows.find(row => target === `media_asset:${row.id}`)
  if (!asset) return
  openedLocalizationTarget = target
  openEdit(asset)
}, { immediate: true })

async function saveAltText() {
  if (!editingAsset.value) return
  editSaving.value = true
  editError.value = null
  try {
    await dashboardApi(`${siteApiBase}/media/${editingAsset.value.id}`, {
      method: 'PATCH',
      body: { alt_text: editAltText.value.trim() || null },
      validate: isRecord,
    })
    const updated = editAltText.value.trim() || null
    editingAsset.value.alt_text = updated
    const target = assets.value.find(item => item.id === editingAsset.value?.id)
    if (target) target.alt_text = updated
    // Committing closes the sheet, the same as every other item sheet.
    editOpen.value = false
  } catch (cause) {
    editError.value = getErrorMessage(cause, 'Failed to save alt text')
  } finally {
    editSaving.value = false
  }
}

</script>
