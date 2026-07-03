<template>
  <!-- Trigger -->
  <div
    @click="open"
    @keydown.enter.prevent="open"
    @keydown.space.prevent="open"
    class="w-full text-left cursor-pointer"
    role="button"
    tabindex="0"
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
            name="i-heroicons-photo"
            class="size-4 text-muted"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-default">
            {{ selectedUrl ? (selectedAlt || 'Image selected') : 'Select image' }}
          </p>
          <p class="text-xs text-muted">{{ selectedUrl ? 'Click to change' : 'Click to browse uploaded images' }}</p>
        </div>
        <UButton
          v-if="modelValue"
          icon="i-heroicons-x-mark"
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          @click.stop="clear"
        />
      </div>
    </slot>
  </div>

  <!-- Modal -->
  <UModal
    v-model:open="isOpen"
    title="Select image"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div v-if="loading" class="text-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="size-8 text-muted animate-spin mx-auto mb-2" />
          <p class="text-sm text-muted">Loading images...</p>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <UIcon name="i-heroicons-exclamation-triangle" class="size-8 text-error mx-auto mb-2" />
          <p class="text-sm text-error">{{ error }}</p>
          <UButton class="mt-3" size="sm" color="neutral" variant="soft" @click="loadImages">Retry</UButton>
        </div>

        <div v-else-if="images.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-photo" class="size-8 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted">No uploaded images yet</p>
          <p class="mt-1 text-xs text-muted">
            Upload one in the dashboard media library, then reopen this picker.
          </p>
        </div>

        <div v-else class="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          <button
            v-for="image in images"
            :key="image.id"
            type="button"
            class="relative aspect-square overflow-hidden rounded-lg border-2 transition-all"
            :class="pendingAsset?.id === image.id ? 'border-primary' : 'border-transparent hover:border-default'"
            @click="onSelect(image)"
          >
            <UImage :src="image.thumbnail_url || image.public_url || ''" alt="" class="h-full w-full object-cover" />
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <div />

        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
          <UButton :disabled="!pendingAsset" @click="confirm">
            Done
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [assetId: string | null]
  change: [asset: { id: string; publicUrl: string; thumbnailUrl: string; altText: string } | null]
}>()

interface PlatformMediaAsset {
  id: string
  public_url: string | null
  thumbnail_url: string | null
  alt_text: string | null
}

const isOpen = ref(false)
const pendingAsset = ref<{ id: string; publicUrl: string; thumbnailUrl: string; altText: string } | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const images = ref<PlatformMediaAsset[]>([])

const selectedUrl = ref<string | null>(null)
const selectedAlt = ref<string>('')
const modelLoadController = ref<AbortController | null>(null)
const libraryLoadController = ref<AbortController | null>(null)

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
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

  try {
    const res = await $fetch<{ media: PlatformMediaAsset[] }>(
      `/api/admin/platform/media?id=${encodeURIComponent(id)}&limit=1`,
      { signal: controller.signal }
    )

    if (controller.signal.aborted) return

    const asset = (res.media ?? [])[0]
    if (asset) {
      selectedUrl.value = asset.thumbnail_url ?? asset.public_url ?? null
      selectedAlt.value = asset.alt_text || ''
    } else {
      selectedUrl.value = null
      selectedAlt.value = ''
    }
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    selectedUrl.value = null
    selectedAlt.value = ''
  } finally {
    if (modelLoadController.value === controller) {
      modelLoadController.value = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  modelLoadController.value?.abort()
  libraryLoadController.value?.abort()
})

async function loadImages() {
  libraryLoadController.value?.abort()
  const controller = new AbortController()
  libraryLoadController.value = controller

  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ media: PlatformMediaAsset[] }>('/api/admin/platform/media?limit=50', {
      signal: controller.signal
    })
    if (controller.signal.aborted) return
    images.value = res.media ?? []
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    console.error('Failed to load platform images:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load images'
    images.value = []
  } finally {
    if (libraryLoadController.value === controller) {
      libraryLoadController.value = null
      loading.value = false
    }
  }
}

watch(isOpen, (open) => {
  if (!open) {
    libraryLoadController.value?.abort()
  }
})

function open() {
  libraryLoadController.value?.abort()
  pendingAsset.value = null
  loadImages()
  isOpen.value = true
}

function onSelect(asset: PlatformMediaAsset) {
  pendingAsset.value = {
    id: asset.id,
    publicUrl: asset.public_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
    altText: asset.alt_text || '',
  }
}

function confirm() {
  if (!pendingAsset.value) return
  selectedUrl.value = pendingAsset.value.thumbnailUrl || pendingAsset.value.publicUrl
  selectedAlt.value = pendingAsset.value.altText
  emit('update:modelValue', pendingAsset.value.id)
  emit('change', {
    id: pendingAsset.value.id,
    publicUrl: pendingAsset.value.publicUrl,
    thumbnailUrl: pendingAsset.value.thumbnailUrl,
    altText: pendingAsset.value.altText,
  })
  isOpen.value = false
}

function clear() {
  selectedUrl.value = null
  pendingAsset.value = null
  emit('update:modelValue', null)
  emit('change', null)
}
</script>
