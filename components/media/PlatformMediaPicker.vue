<template>
  <!-- Trigger -->
  <button
    type="button"
    @click="open"
    class="w-full text-left"
  >
    <slot>
      <div
        class="group flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-default transition-colors hover:border-accented"
        :class="modelValue ? 'p-1' : 'p-2'"
      >
        <img
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
          <p class="text-xs text-muted">{{ selectedUrl ? 'Click to change' : 'Click to browse or generate' }}</p>
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
  </button>

  <!-- Modal -->
  <UModal
    v-model:open="isOpen"
    :title="panel === 'generate' ? 'Generate image' : 'Select image'"
    :ui="{ content: 'max-w-2xl' }"
    @close="panel = 'library'"
  >
    <template #body>
      <!-- Library panel -->
      <div v-if="panel === 'library'" class="space-y-4">
        <div v-if="loading" class="text-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="size-8 text-muted animate-spin mx-auto mb-2" />
          <p class="text-sm text-muted">Loading images...</p>
        </div>

        <div v-else-if="images.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-photo" class="size-8 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted mb-4">No images yet</p>
          <UButton size="sm" @click="panel = 'generate'">Generate one</UButton>
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
            <img :src="image.thumbnail_url || image.public_url || ''" alt="" class="h-full w-full object-cover" />
          </button>
        </div>
      </div>

      <!-- Generate panel -->
      <div v-else>
        <PlatformImageGeneratePanel
          ref="generatePanel"
          @keep="onGenerated"
          @back="panel = 'library'"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          v-if="panel === 'generate'"
          icon="i-heroicons-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="panel = 'library'"
        >
          Back
        </UButton>
        <div v-else />

        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
          <UButton
            v-if="panel === 'generate'"
            :disabled="!generatePanel?.canKeep"
            @click="generatePanel?.keep()"
          >
            Keep
          </UButton>
          <UButton
            v-else
            :disabled="!pendingAsset"
            @click="confirm"
          >
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
  change: [asset: { id: string; publicUrl: string; thumbnailUrl: string } | null]
}>()

type Panel = 'library' | 'generate'

interface PlatformMediaAsset {
  id: string
  public_url: string | null
  thumbnail_url: string | null
  alt_text: string | null
}

const isOpen = ref(false)
const panel = ref<Panel>('library')
const pendingAsset = ref<{ id: string; publicUrl: string; thumbnailUrl: string } | null>(null)
const generatePanel = ref<{ canKeep: boolean; keep: () => void } | null>(null)
const loading = ref(false)
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
  try {
    const res = await $fetch<{ media: PlatformMediaAsset[] }>('/api/admin/platform/media?limit=50', {
      signal: controller.signal
    })
    if (controller.signal.aborted) return
    images.value = res.media ?? []
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    console.error('Failed to load platform images:', err)
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
  panel.value = 'library'
  loadImages()
  isOpen.value = true
}

function onSelect(asset: PlatformMediaAsset) {
  pendingAsset.value = {
    id: asset.id,
    publicUrl: asset.public_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
  }
}

function onGenerated(asset: { id: string; publicUrl: string; thumbnailUrl: string }) {
  pendingAsset.value = asset
  selectedUrl.value = asset.thumbnailUrl || asset.publicUrl
  emit('update:modelValue', asset.id)
  emit('change', asset)
  isOpen.value = false
  panel.value = 'library'
  loadImages()
}

function confirm() {
  if (!pendingAsset.value) return
  selectedUrl.value = pendingAsset.value.thumbnailUrl || pendingAsset.value.publicUrl
  emit('update:modelValue', pendingAsset.value.id)
  emit('change', pendingAsset.value)
  isOpen.value = false
}

function clear() {
  selectedUrl.value = null
  pendingAsset.value = null
  emit('update:modelValue', null)
  emit('change', null)
}
</script>
