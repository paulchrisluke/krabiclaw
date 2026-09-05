<template>
  <!-- Trigger -->
  <div
    @click="open"
    @keydown.enter.prevent="open"
    @keydown.space.prevent="open"
    class="w-full text-left"
    :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
    role="button"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
  >
    <slot>
      <div
        class="group flex items-center gap-2 overflow-hidden rounded-lg border border-default transition-colors hover:border-accented"
        :class="modelValue ? 'p-1' : 'p-2'"
      >
        <UImage
          v-if="selectedUrl"
          :src="selectedUrl"
          class="size-10 shrink-0 rounded object-cover"
          :alt="selectedAlt"
        />
        <div
          v-else
          class="flex size-10 shrink-0 items-center justify-center rounded bg-elevated"
        >
          <UIcon
            :name="accept === 'video' ? 'i-lucide-film' : 'i-lucide-image'"
            class="size-4 text-muted"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-default">
            {{ selectedUrl ? (selectedAlt || 'Media selected') : 'Select media' }}
          </p>
          <p class="text-xs text-muted">{{ selectedUrl ? 'Click to change' : 'Click to browse' }}</p>
        </div>
        <UButton
          v-if="modelValue"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          @click.stop="clear"
        />
      </div>
    </slot>
  </div>
  <UAlert
    v-if="modelLoadError"
    color="error"
    variant="soft"
    :description="modelLoadError"
    class="mt-2"
  />

  <!-- Modal -->
  <UModal
    v-model:open="isOpen"
    :title="title"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <MediaLibraryGrid
        :site-id="siteId"
        :selected-id="pendingAsset?.asset_id ?? modelValue"
        :accept="accept"
        :location-id="locationId"
        @select="onSelect"
        @uploaded="onUploaded"
      />
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton :disabled="!pendingAsset" @click="confirm">Done</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
const props = defineProps<{
  siteId: string
  modelValue?: string | null
  accept?: 'image' | 'video' | 'any'
  locationId?: string | null
  title?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [assetId: string | null]
  change: [asset: SelectedMediaAsset | null]
}>()

const { trackImageUploaded, trackVideoUploaded, trackMediaLibraryViewed } = useAnalytics()

interface PickerMediaAsset {
  id: string
  kind?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
  alt_text?: string | null
  file_name?: string | null
  size?: number | null
}

interface SelectedMediaAsset {
  asset_id: string
  public_url: string | null
  thumbnail_url: string | null
  kind: string
  alt_text: string
}

const isPickerMediaResponse = (value: unknown): value is { media: PickerMediaAsset[] } =>
  isRecord(value)
  && Array.isArray(value.media)
  && value.media.every(asset =>
    isRecord(asset)
    && typeof asset.id === 'string'
    && (asset.kind === undefined || asset.kind === null || typeof asset.kind === 'string')
    && (asset.public_url === undefined || asset.public_url === null || typeof asset.public_url === 'string')
    && (asset.thumbnail_url === undefined || asset.thumbnail_url === null || typeof asset.thumbnail_url === 'string')
    && (asset.alt_text === undefined || asset.alt_text === null || typeof asset.alt_text === 'string')
    && (asset.file_name === undefined || asset.file_name === null || typeof asset.file_name === 'string'),
  )

const isOpen = ref(false)
const pendingAsset = ref<SelectedMediaAsset | null>(null)

const selectedUrl = ref<string | null>(null)
const selectedAlt = ref<string>('')
const modelLoadController = ref<AbortController | null>(null)
const modelLoadError = ref<string | null>(null)

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function assetAlt(asset: Pick<PickerMediaAsset, 'alt_text' | 'file_name'> | Pick<SelectedMediaAsset, 'alt_text'>): string {
  if ('alt_text' in asset && typeof asset.alt_text === 'string' && asset.alt_text) return asset.alt_text
  return 'file_name' in asset && typeof asset.file_name === 'string' ? asset.file_name : ''
}

watch(() => props.modelValue, async (id) => {
  modelLoadController.value?.abort()

  if (!id) {
    selectedUrl.value = null
    selectedAlt.value = ''
    return
  }

  const controller = new AbortController()
  modelLoadController.value = controller
  modelLoadError.value = null

  try {
    const res = await dashboardApi<{ media: PickerMediaAsset[] }>(
      `/api/editor/sites/${props.siteId}/media?id=${encodeURIComponent(id)}&limit=1`,
      { signal: controller.signal, validate: isPickerMediaResponse },
    )

    if (controller.signal.aborted) return

    const asset = (res.media ?? [])[0]
    if (asset) {
      selectedUrl.value = asset.thumbnail_url ?? asset.public_url ?? null
      selectedAlt.value = assetAlt(asset)
    } else {
      selectedUrl.value = null
      selectedAlt.value = ''
    }
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    modelLoadError.value = getErrorMessage(err, 'Failed to load the selected media')
  } finally {
    if (modelLoadController.value === controller) {
      modelLoadController.value = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  modelLoadController.value?.abort()
})

function open() {
  if (props.disabled) return
  pendingAsset.value = null
  isOpen.value = true
  trackMediaLibraryViewed(props.siteId)
}

function onSelect(asset: PickerMediaAsset) {
  pendingAsset.value = {
    asset_id: asset.id,
    public_url: asset.public_url ?? null,
    thumbnail_url: asset.thumbnail_url ?? null,
    kind: asset.kind ?? 'image',
    alt_text: assetAlt(asset),
  }
}

function onUploaded(asset: PickerMediaAsset) {
  const url = asset.public_url ?? ''
  const kind = asset.kind ?? (url.toLowerCase().endsWith('.mp4') ? 'video' : 'image')
  const size = asset.size ?? 0
  pendingAsset.value = {
    asset_id: asset.id,
    public_url: asset.public_url ?? null,
    thumbnail_url: asset.thumbnail_url ?? null,
    kind,
    alt_text: assetAlt(asset),
  }
  if (kind === 'image') {
    trackImageUploaded(props.siteId, size, 'cloudflare_images')
  } else {
    trackVideoUploaded(props.siteId, size, 'cloudflare_r2')
  }
}

function confirm() {
  if (!pendingAsset.value) return
  selectedUrl.value = pendingAsset.value.thumbnail_url || pendingAsset.value.public_url
  selectedAlt.value = assetAlt(pendingAsset.value)
  emit('update:modelValue', pendingAsset.value.asset_id)
  emit('change', pendingAsset.value)
  isOpen.value = false
}

function clear() {
  selectedUrl.value = null
  selectedAlt.value = ''
  pendingAsset.value = null
  emit('update:modelValue', null)
  emit('change', null)
}
</script>
