<template>
  <div class="flex min-h-0 flex-col gap-3">
    <!-- Upload zone -->
    <div
      class="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-6 transition-colors cursor-pointer"
      :class="isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-accented'"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <UIcon name="i-lucide-upload" class="size-6 text-muted" />
      <div class="flex items-center gap-2">
        <UButton size="sm" color="neutral" variant="outline" @click.stop="fileInput?.click()">+ Add files</UButton>
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-sparkles" @click.stop="emit('generate')">
          Generate image
        </UButton>
      </div>
      <p class="text-xs text-muted">Drag and drop images or videos</p>
      <input
        ref="fileInput"
        type="file"
        :accept="computedAccept"
        class="hidden"
        @change="onFileSelect"
      />
    </div>

    <div v-if="uploading" class="flex items-center gap-2 text-xs font-medium text-default">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      <span>Uploading...</span>
    </div>

    <!-- Error -->
    <UAlert v-if="uploadError" color="error" variant="soft" :description="uploadError" icon="i-lucide-triangle-alert" />
    <UAlert v-if="loadError" color="error" variant="soft" :description="loadError" icon="i-lucide-triangle-alert" />

    <!-- Search + filters -->
    <div class="flex items-center gap-2">
      <UInput
        v-model="search"
        placeholder="Search files…"
        icon="i-lucide-search"
        size="sm"
        class="flex-1"
      />
      <USelect
        v-if="accept === 'any'"
        v-model="kindFilter"
        :items="kindOptions"
        value-key="value"
        label-key="label"
        size="sm"
        class="w-28"
      />
    </div>

    <!-- Grid -->
    <div v-if="loading" class="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      <div v-for="i in 12" :key="i" class="aspect-square rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else-if="!loadError && filteredAssets.length === 0" class="py-10 text-center">
      <UIcon name="i-lucide-image" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">No media yet. Upload or generate your first image.</p>
    </div>

    <div v-else class="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 overflow-y-auto max-h-80">
      <button
        v-for="asset in filteredAssets"
        :key="asset.id"
        type="button"
        class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="selectedId === asset.id
          ? 'border-primary'
          : 'border-transparent hover:border-accented'"
        @click="emit('select', asset)"
      >
        <!-- Media thumbnail -->
        <UImage
          v-if="asset.thumbnail_url || (asset.kind === 'image' && asset.public_url)"
          :src="asset.thumbnail_url || asset.public_url"
          :alt="asset.alt_text || asset.title || asset.description || ''"
          class="h-full w-full object-cover"
          loading="lazy"
        />
        <!-- Video / file placeholder -->
        <div v-else class="flex h-full w-full items-center justify-center bg-elevated">
          <video
            v-if="asset.kind === 'video' && asset.public_url"
            :src="asset.public_url"
            class="h-full w-full object-cover"
            muted
            playsinline
            preload="metadata"
          />
          <UIcon
            v-else
            :name="asset.kind === 'video' ? 'i-lucide-film' : 'i-lucide-file'"
            class="size-6 text-muted"
          />
        </div>

        <!-- Video overlay icon -->
        <div v-if="asset.kind === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
          <UIcon name="i-lucide-circle-play" class="size-8 text-white/70 shadow-sm" />
        </div>

        <!-- Selected overlay -->
        <div
          v-if="selectedId === asset.id"
          class="absolute inset-0 flex items-center justify-center bg-primary/20"
        >
          <div class="flex size-6 items-center justify-center rounded-full bg-primary">
            <UIcon name="i-lucide-check" class="size-3.5 text-white" />
          </div>
        </div>

        <!-- Hover filename -->
        <div class="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-1.5 py-1 transition-transform group-hover:translate-y-0">
          <p class="truncate text-xs text-white">{{ asset.file_name || asset.kind }}</p>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
const props = defineProps<{
  siteId: string
  selectedId?: string | null
  accept?: 'image' | 'video' | 'any'
  locationId?: string | null
}>()

interface MediaAsset {
  id: string
  kind?: string
  file_name?: string
  thumbnail_url?: string | null
  public_url?: string
  alt_text?: string
  title?: string
  description?: string
}

const isMediaAsset = (value: unknown): value is MediaAsset =>
  isRecord(value)
  && typeof value.id === 'string'
  && (value.kind === undefined || typeof value.kind === 'string')
  && (value.public_url === undefined || typeof value.public_url === 'string')
  && (value.thumbnail_url === undefined || value.thumbnail_url === null || typeof value.thumbnail_url === 'string')

const isMediaResponse = (value: unknown): value is { media: MediaAsset[] } =>
  isRecord(value)
  && Array.isArray(value.media)
  && value.media.every(isMediaAsset)

const emit = defineEmits<{
  select: [asset: MediaAsset]
  generate: []
  uploaded: [asset: MediaAsset]
}>()

const toast = useToast()
const ALL_MEDIA_KIND = 'all'
const { uploading, error: mediaUploadError, upload: uploadMedia } = useMediaUpload(`/api/editor/sites/${props.siteId}`)

const assets = ref<MediaAsset[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const kindFilter = ref(props.accept === 'video' ? 'video' : 'image')
const loadAbortController = ref<AbortController | null>(null)
const loadRequestId = ref(0)

const computedAccept = computed(() => {
  if (props.accept === 'video') return 'video/mp4,video/webm'
  if (props.accept === 'any') return 'image/*,video/mp4,video/webm'
  return 'image/*'
})

const kindOptions = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'All', value: ALL_MEDIA_KIND },
]

const filteredAssets = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return assets.value
  return assets.value.filter(asset =>
    asset.title?.toLowerCase().includes(query) ||
    asset.file_name?.toLowerCase().includes(query) ||
    asset.public_url?.toLowerCase().includes(query) ||
    asset.id.toLowerCase().includes(query)
  )
})

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

async function loadAssets() {
  const requestId = ++loadRequestId.value
  loadAbortController.value?.abort()
  const controller = new AbortController()
  loadAbortController.value = controller
  loading.value = true
  loadError.value = null

  try {
    const params = new URLSearchParams()
    if (kindFilter.value && kindFilter.value !== ALL_MEDIA_KIND) params.set('kind', kindFilter.value)
    if (props.locationId) params.set('locationId', props.locationId)
    const res = await dashboardApi<{ media: MediaAsset[] }>(`/api/editor/sites/${props.siteId}/media?${params}`, {
      signal: controller.signal,
      validate: isMediaResponse,
    })

    if (controller.signal.aborted || requestId !== loadRequestId.value) return

    assets.value = res.media
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err instanceof Error ? err : new Error(String(err)))) return
    if (requestId === loadRequestId.value) {
      loadError.value = getErrorMessage(err, 'Failed to load media')
    }
  } finally {
    if (requestId === loadRequestId.value) {
      loading.value = false
    }
  }
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) void upload(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void upload(file)
  if (fileInput.value) fileInput.value.value = ''
}

async function upload(file: File) {
  uploadError.value = null
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  const acceptedTypes = computedAccept.value.split(',').map(type => type.trim())
  const isAccepted = acceptedTypes.some(type => type.endsWith('/*')
    ? file.type.startsWith(type.slice(0, -1))
    : file.type === type
  )

  if (!isImage && !isVideo) {
    uploadError.value = 'Only images and videos are supported.'
    return
  }
  if (!isAccepted) {
    uploadError.value = props.accept === 'video'
      ? 'Only MP4 and WebM videos are supported.'
      : props.accept === 'image'
        ? 'Only image files are supported.'
        : 'Only images, MP4 videos, and WebM videos are supported.'
    return
  }

  try {
    const result = await uploadMedia(file, {
      locationId: props.locationId,
    })
    if (!result) {
      uploadError.value = mediaUploadError.value ?? 'Upload failed.'
      return
    }

    toast.add({ title: 'File uploaded', color: 'success' })
    await loadAssets()
    emit('uploaded', assets.value.find(asset => asset.id === result.id) ?? {
      id: result.id,
      kind: result.kind,
      file_name: file.name,
      public_url: result.publicUrl ?? undefined,
      thumbnail_url: result.thumbnailUrl ?? null,
    })
  } catch (err) {
    uploadError.value = getErrorMessage(err, 'Upload failed.')
  }
}

const requestEvent = useRequestEvent()
const initialMediaKey = computed(() =>
  `dashboard-media-library:${props.siteId}:${props.locationId ?? 'site'}:${kindFilter.value}`,
)
const {
  data: initialMedia,
  pending: initialMediaPending,
  error: initialMediaError,
} = await useAsyncData(initialMediaKey, async () => {
  const kind = kindFilter.value && kindFilter.value !== ALL_MEDIA_KIND
    ? kindFilter.value
    : undefined
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardMedia } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardMedia(requestEvent, props.siteId, {
      kind,
      locationId: props.locationId ?? undefined,
      limit: 100,
    })
  }
  const params = new URLSearchParams({ limit: '100' })
  if (kind) params.set('kind', kind)
  if (props.locationId) params.set('locationId', props.locationId)
  return await dashboardApi<{ media: MediaAsset[] }>(
    `/api/editor/sites/${props.siteId}/media?${params}`,
    { validate: isMediaResponse },
  )
}, { lazy: import.meta.client })

watch([initialMedia, initialMediaPending, initialMediaError], ([data, pending, error]) => {
  loading.value = pending
  if (error) {
    loadError.value = getErrorMessage(error, 'Failed to load media')
    return
  }
  if (data) {
    assets.value = data.media as MediaAsset[]
    loadError.value = null
  }
}, { immediate: true })

onUnmounted(() => {
  loadAbortController.value?.abort()
})
</script>
