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
      <UIcon name="i-heroicons-arrow-up-tray" class="size-6 text-muted" />
      <div class="flex items-center gap-2">
        <UButton size="sm" color="neutral" variant="outline" @click.stop="fileInput?.click()">+ Add files</UButton>
        <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-sparkles" @click.stop="emit('generate')">
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

    <!-- Progress -->
    <div v-if="uploading" class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-default">Uploading...</span>
        <span class="text-xs text-muted">Please don't close this tab</span>
      </div>
      <UProgress animation="carousel" color="primary" size="xs" />
    </div>

    <!-- Error -->
    <UAlert v-if="uploadError" color="error" variant="soft" :description="uploadError" icon="i-heroicons-exclamation-triangle" />

    <!-- Search + filters -->
    <div class="flex items-center gap-2">
      <UInput
        v-model="search"
        placeholder="Search files…"
        icon="i-heroicons-magnifying-glass"
        size="sm"
        class="flex-1"
        @input="loadAssets"
      />
      <USelect
        v-if="accept === 'any'"
        v-model="kindFilter"
        :items="kindOptions"
        value-key="value"
        label-key="label"
        size="sm"
        class="w-28"
        @update:model-value="loadAssets"
      />
    </div>

    <!-- Grid -->
    <div v-if="loading" class="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      <div v-for="i in 12" :key="i" class="aspect-square rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else-if="assets.length === 0" class="py-10 text-center">
      <UIcon name="i-heroicons-photo" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">No media yet. Upload or generate your first image.</p>
    </div>

    <div v-else class="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 overflow-y-auto max-h-80">
      <button
        v-for="asset in assets"
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
            :name="asset.kind === 'video' ? 'i-heroicons-film' : 'i-heroicons-document'"
            class="size-6 text-muted"
          />
        </div>

        <!-- Video overlay icon -->
        <div v-if="asset.kind === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
          <UIcon name="i-heroicons-play-circle" class="size-8 text-white/70 shadow-sm" />
        </div>

        <!-- Selected overlay -->
        <div
          v-if="selectedId === asset.id"
          class="absolute inset-0 flex items-center justify-center bg-primary/20"
        >
          <div class="flex size-6 items-center justify-center rounded-full bg-primary">
            <UIcon name="i-heroicons-check" class="size-3.5 text-white" />
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
  thumbnail_url?: string
  public_url?: string
  alt_text?: string
  title?: string
  description?: string
}

const emit = defineEmits<{
  select: [asset: MediaAsset]
  generate: []
  uploaded: [asset: MediaAsset]
}>()

const toast = useToast()
const ALL_MEDIA_KIND = 'all'

const assets = ref<MediaAsset[]>([])
const loading = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const kindFilter = ref(props.accept === 'video' ? 'video' : 'image')
const loadAbortController = ref<AbortController | null>(null)
const loadRequestId = ref(0)
const pendingConfirmIds = ref<string[]>([])

const computedAccept = computed(() => {
  if (props.accept === 'video') return 'video/mp4,video/webm,video/quicktime'
  if (props.accept === 'any') return 'image/*,video/*'
  return 'image/*'
})

const kindOptions = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'All', value: ALL_MEDIA_KIND },
]

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

  try {
    const params = new URLSearchParams()
    if (kindFilter.value && kindFilter.value !== ALL_MEDIA_KIND) params.set('kind', kindFilter.value)
    if (props.locationId) params.set('locationId', props.locationId)
    const res = await $fetch<{ media: MediaAsset[] }>(`/api/dashboard/editor/media?${params}`, {
      signal: controller.signal,
    })

    if (controller.signal.aborted || requestId !== loadRequestId.value) return

    const all = res.media ?? []
    assets.value = search.value
      ? all.filter(a => (a.file_name ?? '').toLowerCase().includes(search.value.toLowerCase()))
      : all
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err instanceof Error ? err : new Error(String(err)))) return
    if (requestId === loadRequestId.value) {
      assets.value = []
    }
  } finally {
    if (requestId === loadRequestId.value) {
      loading.value = false
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) upload(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) upload(file)
  if (fileInput.value) fileInput.value.value = ''
}

async function upload(file: File) {
  uploadError.value = null
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  if (!isImage && !isVideo) {
    uploadError.value = 'Only images and videos are supported.'
    return
  }

  if (isImage) {
    await uploadImage(file)
  } else {
    await uploadVideo(file)
  }
}

async function uploadImage(file: File) {
  uploading.value = true
  try {
    const { assetId, uploadUrl } = await $fetch<{ assetId: string; uploadUrl: string; imageId: string }>(
      `/api/dashboard/editor/media/request-upload`,
      { method: 'POST', body: { filename: file.name, locationId: props.locationId } }
    )

    const form = new FormData()
    form.append('file', file)
    const res = await fetch(uploadUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)

    const confirmEndpoint = `/api/dashboard/editor/media/${assetId}/confirm`
    let asset: MediaAsset | null = null
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        asset = await $fetch<MediaAsset>(confirmEndpoint, { method: 'POST' })
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < 3) await sleep(250 * attempt)
      }
    }

    if (!asset) {
      if (!pendingConfirmIds.value.includes(assetId)) pendingConfirmIds.value.push(assetId)
      console.error('Media confirm failed after retries', {
        assetId,
        confirmEndpoint,
        error: getErrorMessage(lastError, 'Unknown error'),
      })
      throw new Error(`Confirmation failed for asset ${assetId}`)
    }

    toast.add({ title: 'File uploaded', icon: 'i-heroicons-check-circle', color: 'success' })
    await loadAssets()
    emit('uploaded', asset)
  } catch (err) {
    uploadError.value = getErrorMessage(err, 'Upload failed.')
  } finally {
    uploading.value = false
  }
}

async function uploadVideo(file: File) {
  if (file.size > 50 * 1024 * 1024) {
    uploadError.value = 'Videos must be under 50 MB.'
    return
  }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    if (props.locationId) form.append('locationId', props.locationId)
    const asset = await $fetch<MediaAsset>(`/api/dashboard/editor/media/upload`, { method: 'POST', body: form })
    toast.add({ title: 'File uploaded', icon: 'i-heroicons-check-circle', color: 'success' })
    await loadAssets()
    emit('uploaded', asset)
  } catch (err) {
    uploadError.value = getErrorMessage(err, 'Upload failed.')
  } finally {
    uploading.value = false
  }
}

onMounted(loadAssets)

onUnmounted(() => {
  loadAbortController.value?.abort()
})
</script>
