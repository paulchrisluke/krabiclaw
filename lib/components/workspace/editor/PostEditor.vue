<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex items-center justify-between gap-3 border-b border-default bg-elevated px-4 py-2.5">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted">{{ eyebrow }}</p>
        <p v-if="statusText" class="mt-0.5 truncate text-xs text-muted">{{ statusText }}</p>
      </div>
      <div class="flex shrink-0 gap-1">
        <UButton
          v-if="canDelete"
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          aria-label="Delete post"
          @click="$emit('delete')"
        />
        <UButton
          v-if="canClose"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          aria-label="Close editor"
          @click="$emit('close')"
        />
      </div>
    </div>

    <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <div class="space-y-4 p-4">
        <UFormField label="Title">
          <UInput v-model="title" :placeholder="titlePlaceholder" size="lg" />
        </UFormField>

        <UFormField label="Slug">
          <UInput v-model="slug" placeholder="auto-generated-from-title" />
        </UFormField>

        <UFormField v-if="locationOptions.length > 0" label="Location">
          <USelect
            v-model="locationId"
            :items="[{ value: '', label: 'All locations (site-wide)' }, ...locationOptions]"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <div v-if="showExcerpt || showCategory" class="grid gap-4 sm:grid-cols-2">
          <UFormField v-if="showExcerpt" label="Excerpt">
            <UTextarea v-model="excerpt" :rows="3" placeholder="One or two sentences that summarize the post." />
          </UFormField>
          <UFormField v-if="showCategory" label="Category">
            <USelect
              v-model="category"
              :items="categoryItems"
              value-key="value"
              label-key="label"
              placeholder="Select a category"
            />
          </UFormField>
        </div>

        <UFormField :label="bodyLabel">
          <UTextarea
            v-model="body"
            :rows="bodyRows"
            :placeholder="bodyPlaceholder"
            :class="markdown ? 'font-mono text-sm' : ''"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="SEO title">
            <UInput v-model="seoTitle" placeholder="Optional search title" />
          </UFormField>
          <UFormField label="SEO description">
            <UTextarea v-model="seoDescription" :rows="2" placeholder="Optional search summary" />
          </UFormField>
        </div>

        <UFormField v-if="showImage" label="Cover image">
          <MediaPicker
            v-model="coverMediaId"
            :site-id="siteId"
            accept="image"
            title="Select post image"
            @change="handleImageChange"
          />
        </UFormField>

        <div v-if="showImage" class="space-y-2">
          <UFormField label="Gallery">
            <MediaPicker
              v-model="galleryPickerAssetId"
              :site-id="siteId"
              accept="any"
              title="Add gallery media"
              @change="handleGalleryChange"
            />
          </UFormField>
          <div v-if="galleryMedia.length > 0" class="space-y-2">
            <div
              v-for="(item, index) in galleryMedia"
              :key="item.asset_id"
              class="grid gap-2 rounded-md border border-default p-2 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
            >
              <div class="size-12 overflow-hidden rounded bg-muted">
                <img
                  v-if="item.public_url && item.kind !== 'video'"
                  :src="item.public_url"
                  :alt="item.alt_text || 'Gallery media'"
                  class="h-full w-full object-cover"
                />
                <div v-else class="flex h-full w-full items-center justify-center">
                  <UIcon :name="item.kind === 'video' ? 'i-lucide-film' : 'i-lucide-image'" class="size-4 text-muted" />
                </div>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="error"
                variant="ghost"
                aria-label="Remove gallery media"
                @click="removeGalleryItem(index)"
              />
            </div>
          </div>
        </div>

        <div v-if="showChannels" class="border-t border-default pt-4">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Publish to</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="channel in channelOptions"
              :key="channel.value"
              class="flex items-center gap-2 rounded-md border border-default px-3 py-2 text-sm"
              :class="channel.disabled ? 'text-muted' : 'text-default'"
            >
              <UCheckbox
                :model-value="selectedChannels.includes(channel.value)"
                :disabled="channel.disabled"
                @update:model-value="toggleChannel(channel.value, Boolean($event))"
              />
              <span class="min-w-0 flex-1 truncate">{{ channel.label }}</span>
              <UBadge v-if="channel.disabled" size="xs" color="neutral" variant="soft">Not connected</UBadge>
            </label>
          </div>
        </div>

        <div v-if="errorMessage || successMessage" class="space-y-2">
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />
        </div>

        <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
          <UButton color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="$emit('save')">
            {{ saveLabel }}
          </UButton>
          <UButton :loading="publishing" :disabled="!canPublish" @click="$emit('publish')">
            {{ publishLabel }}
          </UButton>
          <UButton v-if="showUnpublish" color="neutral" variant="ghost" :loading="saving" @click="$emit('unpublish')">
            Unpublish
          </UButton>
        </div>
      </div>

      <div v-if="showPreview" class="border-t border-default bg-muted/30 p-4 lg:border-l lg:border-t-0">
        <div class="sticky top-4 space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">Preview</p>
          <div class="overflow-hidden rounded-lg border border-default bg-default">
            <video
              v-if="imagePreviewUrl && imageKind === 'video'"
              :src="imagePreviewUrl"
              autoplay
              muted
              loop
              playsinline
              class="max-h-56 w-full object-cover"
            />
            <img v-else-if="imagePreviewUrl" :src="imagePreviewUrl" :alt="title || 'Post image'" class="max-h-56 w-full object-cover" />
            <div class="space-y-3 p-4">
              <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                <UBadge v-if="category" color="neutral" variant="soft">{{ category }}</UBadge>
                <span v-if="publishedAt">{{ formattedPublishedAt }}</span>
              </div>
              <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ title }}</h2>
              <p v-if="excerpt" class="text-sm leading-6 text-muted">{{ excerpt }}</p>
              <p class="whitespace-pre-line text-sm leading-6 text-default">{{ body || 'Start writing to preview the post.' }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ChannelOption {
  value: string
  label: string
  disabled?: boolean
}

interface PostMediaItem {
  asset_id: string
  slot: 'cover' | 'gallery'
  alt_text: string
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
}

const title = defineModel<string>('title', { required: true })
const body = defineModel<string>('body', { required: true })
const slug = defineModel<string>('slug', { default: '' })
const seoTitle = defineModel<string>('seoTitle', { default: '' })
const seoDescription = defineModel<string>('seoDescription', { default: '' })
const excerpt = defineModel<string>('excerpt', { default: '' })
const category = defineModel<string>('category', { default: '' })
const media = defineModel<PostMediaItem[]>('media', { default: () => [] })
const selectedChannels = defineModel<string[]>('selectedChannels', { default: () => [] })
const locationId = defineModel<string>('locationId', { default: '' })
const galleryPickerAssetId = ref<string | null>(null)
const coverMedia = computed(() => media.value.find(item => item.slot === 'cover') ?? null)
const coverMediaId = computed({
  get: () => coverMedia.value?.asset_id ?? null,
  set: (assetId: string | null) => {
    if (assetId) return
    media.value = media.value.filter(item => item.slot !== 'cover')
  },
})
const imagePreviewUrl = computed(() => coverMedia.value?.thumbnail_url ?? coverMedia.value?.public_url ?? null)
const imageKind = computed(() => coverMedia.value?.kind ?? 'image')
const galleryMedia = computed({
  get: () => media.value.filter(item => item.slot === 'gallery'),
  set: (items: PostMediaItem[]) => {
    media.value = [
      ...media.value.filter(item => item.slot !== 'gallery'),
      ...items.map(item => ({ ...item, slot: 'gallery' as const })),
    ]
  },
})

interface LocationOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  eyebrow: string
  statusText?: string
  publishedAt?: string | null
  siteId?: string
  categories?: string[]
  channelOptions?: ChannelOption[]
  locationOptions?: LocationOption[]
  showExcerpt?: boolean
  showCategory?: boolean
  showImage?: boolean
  showChannels?: boolean
  showPreview?: boolean
  showUnpublish?: boolean
  canDelete?: boolean
  canClose?: boolean
  saving?: boolean
  publishing?: boolean
  errorMessage?: string
  successMessage?: string
  markdown?: boolean
  titlePlaceholder?: string
  bodyPlaceholder?: string
  bodyLabel?: string
  bodyRows?: number
  saveLabel?: string
  publishLabel?: string
}>(), {
  statusText: '',
  publishedAt: null,
  siteId: '',
  categories: () => [],
  channelOptions: () => [],
  locationOptions: () => [],
  showExcerpt: false,
  showCategory: false,
  showImage: false,
  showChannels: false,
  showPreview: true,
  showUnpublish: false,
  canDelete: false,
  canClose: false,
  saving: false,
  publishing: false,
  errorMessage: '',
  successMessage: '',
  markdown: false,
  titlePlaceholder: 'Optional headline...',
  bodyPlaceholder: 'Write the post...',
  bodyLabel: 'Body',
  bodyRows: 10,
  saveLabel: 'Save',
  publishLabel: 'Publish to channels'
})

const emit = defineEmits<{
  save: []
  publish: []
  unpublish: []
  delete: []
  close: []
  imageChange: [asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null]
}>()

const { trackEditorSessionStarted } = useAnalytics()
onMounted(() => {
  if (props.siteId) trackEditorSessionStarted(props.siteId)
})

const categoryItems = computed(() => props.categories.map((item) => ({ label: item, value: item })))
const canSave = computed(() => Boolean(title.value.trim() || body.value.trim()))
const canPublish = computed(() => {
  if (!body.value.trim()) return false
  if (!props.showChannels) return true
  return selectedChannels.value.length > 0
})
const formattedPublishedAt = computed(() => {
  if (!props.publishedAt) return ''
  const publishedAt = new Date(props.publishedAt)
  if (Number.isNaN(publishedAt.getTime())) return ''
  return publishedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
})

function handleImageChange(asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null) {
  media.value = [
    ...(asset
      ? [{
          asset_id: asset.asset_id,
          slot: 'cover' as const,
          alt_text: '',
          public_url: asset.public_url,
          thumbnail_url: asset.thumbnail_url,
          kind: asset.kind ?? 'image',
        }]
      : []),
    ...media.value.filter(item => item.slot !== 'cover'),
  ]
  emit('imageChange', asset)
}

function handleGalleryChange(asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null) {
  if (!asset) return
  const exists = galleryMedia.value.some((item) => item.asset_id === asset.asset_id)
  if (!exists) {
    galleryMedia.value = [
      ...galleryMedia.value,
      {
        asset_id: asset.asset_id,
        slot: 'gallery',
        alt_text: '',
        public_url: asset.public_url,
        thumbnail_url: asset.thumbnail_url,
        kind: asset.kind ?? 'image',
      },
    ]
  }
  galleryPickerAssetId.value = null
}

function removeGalleryItem(index: number) {
  galleryMedia.value = galleryMedia.value.filter((_, itemIndex) => itemIndex !== index)
}

function toggleChannel(value: string, checked: boolean) {
  if (checked) {
    selectedChannels.value = selectedChannels.value.includes(value)
      ? selectedChannels.value
      : [...selectedChannels.value, value]
    return
  }

  selectedChannels.value = selectedChannels.value.filter((channel) => channel !== value)
}
</script>
