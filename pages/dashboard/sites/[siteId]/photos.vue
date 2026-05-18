<template>
  <UPage>
    <UPageHeader title="Photos" description="Curate the guest-facing photo galleries for each location.">
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <USelect v-model="selectedLocationId" :items="locationItems" value-key="id" label-key="label" class="w-64" @update:model-value="loadPhotos" />
        <USelect v-model="categoryFilter" :items="categoryItems" value-key="id" label-key="label" class="w-44" />
        <UButton icon="i-heroicons-arrow-up-tray" color="primary" variant="soft" :loading="uploading" :disabled="!selectedLocationId" @click="openUploadPicker">Upload</UButton>
        <UButton icon="i-heroicons-paper-clip" color="neutral" variant="soft" :disabled="!selectedLocationId" @click="openAttachModal">Attach existing</UButton>
        <UButton icon="i-heroicons-arrow-path" color="neutral" variant="ghost" :loading="loading" @click="loadPhotos">Refresh</UButton>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onFileSelect" />
      </div>

      <div v-if="loading" class="grid grid-cols-3 gap-3 md:grid-cols-5 xl:grid-cols-7">
        <USkeleton v-for="i in 14" :key="i" class="aspect-square rounded-lg" />
      </div>

      <div v-else-if="filteredAssets.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
        <UIcon name="i-heroicons-photo" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">No location photos yet</p>
        <p class="mt-1 text-sm text-muted">Upload images here or attach existing media to this location.</p>
        <div class="mt-5 flex justify-center gap-2">
          <UButton icon="i-heroicons-arrow-up-tray" :loading="uploading" @click="openUploadPicker">Upload photo</UButton>
          <UButton color="neutral" variant="soft" icon="i-heroicons-paper-clip" @click="openAttachModal">Attach existing</UButton>
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
            <UIcon name="i-heroicons-film" class="size-6 text-muted" />
          </div>
          <div class="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1 opacity-0 transition group-hover:opacity-100">
            <p class="truncate text-xs text-white">{{ asset.file_name || asset.kind }}</p>
            <p class="truncate text-xs text-white/70">{{ categoryLabel(asset.category) }}</p>
          </div>
          <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <UDropdownMenu :items="categoryMenu(asset)" :content="{ align: 'end' }">
              <UButton size="xs" color="neutral" variant="solid" icon="i-heroicons-tag" />
            </UDropdownMenu>
            <UButton size="xs" color="error" variant="solid" icon="i-heroicons-x-mark" @click="detachPhoto(asset)" />
          </div>
        </div>
      </div>

      <UModal v-model:open="attachOpen" :ui="{ content: 'max-w-4xl' }">
        <template #content>
          <div class="p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">Attach existing media</h2>
                <p class="mt-1 text-sm text-muted">Choose images from the site media library for this location gallery.</p>
              </div>
              <UButton icon="i-heroicons-arrow-path" color="neutral" variant="ghost" :loading="attachLoading" @click="loadAttachableMedia" />
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
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface LocationRow {
  id: string
  title: string
}

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

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const locations = ref<LocationRow[]>([])
const selectedLocationId = ref('')
const assets = ref<MediaAsset[]>([])
const attachableAssets = ref<MediaAsset[]>([])
const loading = ref(true)
const uploading = ref(false)
const attachOpen = ref(false)
const attachLoading = ref(false)
const categoryFilter = ref('all')
const fileInput = ref<HTMLInputElement | null>(null)
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Media library', icon: 'i-heroicons-squares-2x2', to: paths.value.media, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'Edit photo page', icon: 'i-heroicons-document-text', to: `${paths.value.content}?page=location`, color: 'neutral' as const, variant: 'ghost' as const }
]))

const locationItems = computed(() => locations.value.map(location => ({ id: location.id, label: location.title })))
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

async function loadContext() {
  const [settingsRes, locationsRes] = await Promise.all([
    $fetch<{ settings: { public_url: string | null } }>(`/api/sites/${siteId}/settings`),
    $fetch<{ locations: LocationRow[] }>(`/api/sites/${siteId}/locations`)
  ])
  sitePublicUrl.value = settingsRes.settings.public_url
  locations.value = locationsRes.locations ?? []
  selectedLocationId.value ||= locations.value[0]?.id ?? ''
}

async function loadPhotos() {
  if (!selectedLocationId.value) {
    assets.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({ kind: 'image', locationId: selectedLocationId.value, limit: '100' })
    const res = await $fetch<{ media: MediaAsset[] }>(`/api/editor/sites/${siteId}/media?${params}`)
    assets.value = res.media ?? []
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load photos', color: 'error' })
  } finally {
    loading.value = false
  }
}

function openUploadPicker() {
  if (!selectedLocationId.value || uploading.value) return
  fileInput.value?.click()
}

function onFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) uploadPhoto(file)
  if (fileInput.value) fileInput.value.value = ''
}

async function confirmPendingUpload(assetId: string) {
  await $fetch(`/api/editor/sites/${siteId}/media/${assetId}/confirm`, { method: 'POST' })
}

async function uploadPhoto(file: File) {
  if (!file.type.startsWith('image/')) {
    toast.add({ description: 'Choose an image file', color: 'error' })
    return
  }
  uploading.value = true
  try {
    const { assetId, uploadUrl } = await $fetch<{ assetId: string; uploadUrl: string }>(`/api/editor/sites/${siteId}/media/request-upload`, {
      method: 'POST',
      body: {
        filename: file.name,
        locationId: selectedLocationId.value,
        category: categoryFilter.value === 'all' ? 'other' : categoryFilter.value
      }
    })
    const form = new FormData()
    form.append('file', file)
    const uploadResponse = await fetch(uploadUrl, { method: 'POST', body: form })
    if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`)
    await confirmPendingUpload(assetId)
    toast.add({ description: 'Photo uploaded', color: 'success' })
    await loadPhotos()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to upload photo', color: 'error' })
  } finally {
    uploading.value = false
  }
}

async function loadAttachableMedia() {
  attachLoading.value = true
  try {
    const params = new URLSearchParams({ kind: 'image', limit: '100' })
    const res = await $fetch<{ media: MediaAsset[] }>(`/api/editor/sites/${siteId}/media?${params}`)
    attachableAssets.value = (res.media ?? []).filter(asset => asset.location_id !== selectedLocationId.value)
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
    await $fetch(`/api/editor/sites/${siteId}/media/${asset.id}`, { method: 'PATCH', body })
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
    location_id: selectedLocationId.value,
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
    icon: asset.category === item.id ? 'i-heroicons-check' : 'i-heroicons-tag',
    onSelect: () => patchAsset(asset, { category: item.id }, 'Photo category updated')
  }))]
}

onMounted(async () => {
  try {
    await loadContext()
    await loadPhotos()
  } catch (error) {
    loading.value = false
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load photos page', color: 'error' })
  }
})

useSeoMeta({ title: 'Photos | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
