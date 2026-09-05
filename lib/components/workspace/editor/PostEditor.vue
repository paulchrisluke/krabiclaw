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
          <UInput v-model="title" :placeholder="titlePlaceholder" size="lg" class="w-full" />
        </UFormField>

        <UFormField v-if="showSlug" label="Slug">
          <UInput v-model="slug" placeholder="auto-generated-from-title" class="w-full" />
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
            <UTextarea v-model="excerpt" :rows="3" placeholder="One or two sentences that summarize the post." class="w-full" />
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
            class="w-full"
            :class="markdown ? 'font-mono text-sm' : ''"
          />
        </UFormField>

        <div v-if="showSeo" class="grid gap-4 sm:grid-cols-2">
          <UFormField label="SEO title">
            <UInput v-model="seoTitle" placeholder="Optional search title" class="w-full" />
          </UFormField>
          <UFormField label="SEO description">
            <UTextarea v-model="seoDescription" :rows="2" placeholder="Optional search summary" class="w-full" />
          </UFormField>
        </div>

        <UFormField v-if="showImage" label="Cover image">
          <DashboardCoverPhotoField
            :site-id="siteId"
            :model-value="coverMediaId"
            :preview-url="coverPreviewUrl"
            :preview-alt="title || 'Post image'"
            title="Select post image"
            @update:model-value="coverMediaId = $event"
            @change="handleImageChange"
          />
        </UFormField>

        <UFormField v-if="showImage" label="Gallery">
          <DashboardMediaGalleryField
            :items="galleryItems"
            :site-id="siteId"
            :cover-first="false"
            @add="addGalleryItem"
            @remove="(index: number) => removeGalleryItem(index)"
            @move="(index: number, direction: -1 | 1) => moveGalleryItem(index, direction)"
            @reorder="(from: number, to: number) => reorderGalleryItem(from, to)"
            @asset-change="(index: number, asset) => setGalleryAsset(index, asset)"
          />
        </UFormField>

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
import DashboardCoverPhotoField from '~/components/dashboard/DashboardCoverPhotoField.vue'
import DashboardMediaGalleryField from '~/components/dashboard/DashboardMediaGalleryField.vue'

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
const locationId = defineModel<string>('locationId', { default: '' })
const coverMedia = computed(() => media.value.find(item => item.slot === 'cover') ?? null)
const coverMediaId = computed({
  get: () => coverMedia.value?.asset_id ?? null,
  set: (assetId: string | null) => {
    if (assetId) return
    media.value = media.value.filter(item => item.slot !== 'cover')
  },
})
const imagePreviewUrl = computed(() => coverMedia.value?.thumbnail_url ?? coverMedia.value?.public_url ?? null)
// The cover field renders large, so it prefers the full asset over the thumbnail.
const coverPreviewUrl = computed(() => coverMedia.value?.public_url ?? coverMedia.value?.thumbnail_url ?? null)
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

// The shared gallery field keys rows by a stable `_key`; gallery membership here
// is keyed by asset, and a freshly added empty row has no asset yet.
const galleryItems = computed(() => galleryMedia.value.map((item, index) => ({
  _key: item.asset_id || `gallery-${index}`,
  asset_id: item.asset_id || null,
  url: item.public_url ?? null,
  thumbnail_url: item.thumbnail_url ?? null,
  kind: item.kind ?? 'image',
})))

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
  locationOptions?: LocationOption[]
  showExcerpt?: boolean
  showCategory?: boolean
  showImage?: boolean
  /** Off where the slug is derived from the title and must not be hand-edited. */
  showSlug?: boolean
  /** Off where SEO fields are generated rather than authored. */
  showSeo?: boolean
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
  locationOptions: () => [],
  showExcerpt: false,
  showCategory: false,
  showImage: false,
  showSlug: true,
  showSeo: true,
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
const canPublish = computed(() => Boolean(body.value.trim()))
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

function addGalleryItem() {
  galleryMedia.value = [
    ...galleryMedia.value,
    { asset_id: '', slot: 'gallery', alt_text: '', public_url: null, thumbnail_url: null, kind: 'image' },
  ]
}

function removeGalleryItem(index: number) {
  galleryMedia.value = galleryMedia.value.filter((_, itemIndex) => itemIndex !== index)
}

function moveGalleryItem(index: number, direction: -1 | 1) {
  reorderGalleryItem(index, index + direction)
}

function reorderGalleryItem(sourceIndex: number, targetIndex: number) {
  const items = [...galleryMedia.value]
  if (targetIndex < 0 || targetIndex >= items.length) return
  const [item] = items.splice(sourceIndex, 1)
  if (!item) return
  items.splice(targetIndex, 0, item)
  galleryMedia.value = items
}

function setGalleryAsset(
  index: number,
  asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null,
) {
  const items = [...galleryMedia.value]
  const existing = items[index]
  if (!existing) return
  items[index] = {
    ...existing,
    asset_id: asset?.asset_id ?? '',
    public_url: asset?.public_url ?? null,
    thumbnail_url: asset?.thumbnail_url ?? null,
    kind: asset?.kind ?? 'image',
  }
  galleryMedia.value = items
}
</script>
