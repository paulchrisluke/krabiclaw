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
          v-if="selectedUrl && selectedKind === 'image'"
          :src="selectedUrl"
          class="size-10 shrink-0 rounded object-cover"
          :alt="selectedAlt"
        />
        <div
          v-else-if="selectedUrl && selectedKind === 'video'"
          class="flex size-10 shrink-0 items-center justify-center rounded bg-elevated"
        >
          <UIcon name="i-heroicons-film" class="size-5 text-muted" />
        </div>
        <div
          v-else
          class="flex size-10 shrink-0 items-center justify-center rounded bg-elevated"
        >
          <UIcon
            :name="accept === 'video' ? 'i-heroicons-film' : 'i-heroicons-photo'"
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
    :title="panel === 'generate' ? 'Generate image' : title"
    :ui="{ content: 'max-w-2xl' }"
    @close="panel = 'library'"
  >
    <template #body>
      <MediaLibraryGrid
        v-if="panel === 'library'"
        :site-id="siteId"
        :selected-id="modelValue"
        :accept="accept"
        :location-id="locationId"
        @select="onSelect"
        @generate="panel = 'generate'"
        @uploaded="onUploaded"
      />

      <MediaGeneratePanel
        v-else
        ref="generatePanel"
        :site-id="siteId"
        :location-id="locationId"
        @keep="onGenerated"
        @back="panel = 'library'"
      />
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
  siteId: string
  modelValue?: string | null
  accept?: 'image' | 'video' | 'any'
  locationId?: string | null
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [assetId: string | null]
  change: [asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null]
}>()

type Panel = 'library' | 'generate'

interface PickerMediaAsset {
  id: string
  kind?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
  publicUrl?: string | null
  thumbnailUrl?: string | null
  alt_text?: string | null
}

const isOpen = ref(false)
const panel = ref<Panel>('library')
const pendingAsset = ref<{ id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null>(null)
const generatePanel = ref<ApiRecord | null>(null)

const selectedUrl = ref<string | null>(null)
const selectedKind = ref<string | null>(null)
const selectedAlt = ref<string>('')
const modelLoadController = ref<AbortController | null>(null)

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

watch(() => props.modelValue, async (id) => {
  modelLoadController.value?.abort()

  if (!id) {
    selectedUrl.value = null
    selectedKind.value = null
    selectedAlt.value = ''
    return
  }

  const controller = new AbortController()
  modelLoadController.value = controller

  try {
    const res = await $fetch<{ media: PickerMediaAsset[] }>(
      `/api/editor/sites/${props.siteId}/media?id=${encodeURIComponent(id)}&limit=1`,
      { signal: controller.signal }
    )

    if (controller.signal.aborted) return

    const asset = (res.media ?? [])[0]
    if (asset) {
      selectedUrl.value = asset.thumbnail_url ?? asset.public_url ?? null
      selectedKind.value = asset.kind ?? 'image'
      selectedAlt.value = asset.alt_text || ''
    } else {
      selectedUrl.value = null
      selectedKind.value = null
      selectedAlt.value = ''
    }
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    selectedUrl.value = null
    selectedKind.value = null
    selectedAlt.value = ''
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
  pendingAsset.value = null
  panel.value = 'library'
  isOpen.value = true
}

function onSelect(asset: PickerMediaAsset) {
  pendingAsset.value = {
    id: asset.id,
    publicUrl: asset.public_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
    kind: asset.kind ?? 'image',
  }
}

function onUploaded(asset: PickerMediaAsset) {
  pendingAsset.value = {
    id: asset.id,
    publicUrl: asset.publicUrl ?? asset.public_url ?? '',
    thumbnailUrl: asset.thumbnailUrl ?? asset.thumbnail_url ?? '',
    kind: asset.kind ?? (asset.publicUrl?.toLowerCase().endsWith('.mp4') ? 'video' : 'image'),
  }
}

function onGenerated(asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string }) {
  pendingAsset.value = asset
  selectedUrl.value = asset.thumbnailUrl || asset.publicUrl
  selectedKind.value = asset.kind || 'image'
  emit('update:modelValue', asset.id)
  emit('change', asset)
  isOpen.value = false
  panel.value = 'library'
}

function confirm() {
  if (!pendingAsset.value) return
  selectedUrl.value = pendingAsset.value.thumbnailUrl || pendingAsset.value.publicUrl
  selectedKind.value = pendingAsset.value.kind || 'image'
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
