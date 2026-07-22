<template>
  <UDashboardPanel id="location-photos">
    <template #header>
      <UDashboardNavbar title="Photos">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #trailing>
          <USelect v-model="categoryFilter" :items="categoryItems" value-key="id" label-key="label" class="w-44" />
          <UButton icon="i-lucide-upload" color="primary" variant="soft" :loading="uploading" :disabled="!locationId" @click="openUploadPicker">Upload</UButton>
          <UButton icon="i-lucide-paperclip" color="neutral" variant="soft" :disabled="!locationId" @click="openAttachModal">Attach existing</UButton>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadPhotos">Refresh</UButton>
          <input ref="fileInput" type="file" accept="image/*,video/*" class="hidden" :disabled="uploading" @change="onFileSelect" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>

      <div v-if="pendingRetryFile" class="mb-4">
        <UButton size="sm" color="neutral" variant="soft" :loading="uploading" :disabled="uploading" @click="retryPendingUpload">
          Retry confirm
        </UButton>
      </div>

      <div v-if="loading" class="grid grid-cols-3 gap-3 md:grid-cols-5 xl:grid-cols-7">
        <USkeleton v-for="i in 14" :key="i" class="aspect-square rounded-lg" />
      </div>

      <div v-else-if="filteredAssets.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
        <UIcon name="i-lucide-image" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">No location media yet</p>
        <p class="mt-1 text-sm text-muted">Upload images or videos here, or attach existing media to this location.</p>
        <div class="mt-5 flex justify-center gap-2">
          <UButton icon="i-lucide-upload" :loading="uploading" @click="openUploadPicker">Upload file</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-paperclip" @click="openAttachModal">Attach existing</UButton>
        </div>
      </div>

      <div v-else class="grid grid-cols-3 gap-3 md:grid-cols-5 xl:grid-cols-7">
        <div v-for="asset in filteredAssets" :key="asset.id" class="group relative aspect-square overflow-hidden rounded-lg border border-default bg-elevated">
          <img
            v-if="asset.thumbnail_url || asset.public_url"
            :src="asset.thumbnail_url || asset.public_url || undefined"
            :alt="asset.alt_text || asset.file_name || ''"
            class="h-full w-full object-cover"
            loading="lazy"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <UIcon name="i-lucide-film" class="size-6 text-muted" />
          </div>
          <div class="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1 opacity-0 transition group-hover:opacity-100">
            <p class="truncate text-xs text-white">{{ asset.file_name || asset.kind }}</p>
            <p class="truncate text-xs text-white/70">{{ categoryLabel(asset.category) }}</p>
          </div>
          <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <UDropdownMenu :items="categoryMenu(asset)" :content="{ align: 'end' }">
              <UButton size="xs" color="neutral" variant="solid" icon="i-lucide-tag" />
            </UDropdownMenu>
            <UButton size="xs" color="error" variant="solid" icon="i-lucide-x" @click="detachPhoto(asset)" />
          </div>
        </div>
      </div>

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
            <div v-if="attachLoading" class="mt-5 grid grid-cols-3 gap-3 md:grid-cols-5">
              <USkeleton v-for="i in 10" :key="i" class="aspect-square rounded-lg" />
            </div>
            <div v-else class="mt-5 grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto md:grid-cols-5">
              <button
                v-for="asset in attachableAssets"
                :key="asset.id"
                type="button"
                class="group relative aspect-square overflow-hidden rounded-lg border border-default bg-elevated text-left"
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
                  {{ asset.location_id ? 'Move here' : 'Attach' }}
                </span>
              </button>
            </div>
          </div>
        </template>
      </UModal>

      <VideoPosterPrompt
        :open="posterPromptOpen"
        :uploading="uploading"
        :video-name="pendingVideoFile?.name ?? null"
        @update:open="posterPromptOpen = $event"
        @submit="submitVideoUpload"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

import VideoPosterPrompt from '~/components/workspace/media/VideoPosterPrompt.vue'

interface MediaAsset {
  id: string
  kind: string
  public_url: string | null
  thumbnail_url: string | null
  alt_text: string | null
  file_name: string | null
  location_id: string | null
  category: string | null
}

const _siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()
const toast = useToast()
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const assets = ref<MediaAsset[]>([])
const attachableAssets = ref<MediaAsset[]>([])
const loading = ref(true)
const attachOpen = ref(false)
const attachLoading = ref(false)
const categoryFilter = ref('all')
const fileInput = ref<HTMLInputElement | null>(null)
const posterPromptOpen = ref(false)
const pendingVideoFile = ref<File | null>(null)
const { uploading, error: uploadError, pendingRetryFile, upload } = useMediaUpload()

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
  try {
    const params = new URLSearchParams({ locationId: locationId.value, limit: '100' })
    const res = await $fetch<{ media: MediaAsset[] }>(`/api/dashboard/editor/media?${params}`)
    assets.value = res.media ?? []
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load photos', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openUploadPicker() {
  if (!locationId.value || uploading.value) return
  fileInput.value?.click()
}

function onFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) handleSelectedFile(file)
  if (fileInput.value) fileInput.value.value = ''
}

function handleSelectedFile(file: File) {
  if (file.type.startsWith('video/')) {
    pendingVideoFile.value = file
    posterPromptOpen.value = true
    return
  }

  void uploadSelectedFile(file)
}

async function submitVideoUpload(poster: File | null) {
  posterPromptOpen.value = false
  const videoFile = pendingVideoFile.value
  pendingVideoFile.value = null
  if (!videoFile) return
  await uploadSelectedFile(videoFile, poster)
}

async function retryPendingUpload() {
  const pendingUpload = pendingRetryFile.value
  if (!pendingUpload) return
  await uploadSelectedFile(pendingUpload.file, pendingUpload.options.poster ?? null, pendingUpload.options)
}

async function uploadSelectedFile(file: File, poster: File | null = null, existingOptions?: { category?: string | null, locationId?: string | null }) {
  try {
    const options = existingOptions ?? {
      locationId: locationId.value,
      category: categoryFilter.value === 'all' ? 'other' : categoryFilter.value,
    }
    const result = await upload(file, {
      ...options,
      poster,
    })
    if (!result) {
      if (uploadError.value) toast.add({ description: uploadError.value, color: 'error' })
      return
    }

    toast.add({
      description: result.kind === 'video' ? 'Video uploaded' : 'Photo uploaded',
      color: 'success'
    })
    if (result.posterWarning) {
      toast.add({ title: 'Video uploaded without a poster image', description: result.posterWarning, color: 'warning' })
    } else if (result.kind === 'video' && !poster) {
      toast.add({
        title: 'Video uploaded without a poster image',
        description: 'Without a poster, this video may appear blank while it loads.',
        color: 'warning'
      })
    }
    await loadPhotos()
  } catch (error) {
    toast.add({ description: uploadError.value ?? (error instanceof Error ? error.message : 'Failed to upload file'), color: 'error' })
  }
}

async function loadAttachableMedia() {
  attachLoading.value = true
  try {
    const params = new URLSearchParams({ limit: '100' })
    const res = await $fetch<{ media: MediaAsset[] }>(`/api/dashboard/editor/media?${params}`)
    attachableAssets.value = (res.media ?? []).filter(asset => asset.location_id !== locationId.value)
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
    await $fetch(`/api/dashboard/editor/media/${asset.id}`, { method: 'PATCH', body })
    toast.add({ description: successMessage, color: 'success' })
    await loadPhotos()
    return true
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update photo', color: 'error' })
    return false
  }
}

async function attachPhoto(asset: MediaAsset) {
  const updated = await patchAsset(asset, {
    location_id: locationId.value,
    category: categoryFilter.value === 'all' ? (asset.category || 'other') : categoryFilter.value
  }, 'Photo attached')
  if (updated) {
    attachableAssets.value = attachableAssets.value.filter(item => item.id !== asset.id)
  }
}

async function detachPhoto(asset: MediaAsset) {
  await patchAsset(asset, { location_id: null }, 'Photo detached from this location')
}

function categoryMenu(asset: MediaAsset) {
  return [categoryItems.filter(item => item.id !== 'all').map(item => ({
    label: item.label,
    icon: asset.category === item.id ? 'i-lucide-check' : 'i-lucide-tag',
    onSelect: () => patchAsset(asset, { category: item.id }, 'Photo category updated')
  }))]
}

onMounted(async () => {
  try {
    await loadPhotos()
  } catch (error) {
    loading.value = false
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load photos page', color: 'error' })
  }
})

watch(locationId, () => {
  void loadPhotos()
})

useSeoMeta({ title: 'Photos | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
