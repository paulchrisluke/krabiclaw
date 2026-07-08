<template>
  <UPage>

    <UPageBody>
      <div class="grid gap-6 lg:grid-cols-[1fr_400px]">
        <!-- Left: AI compose + post list -->
        <div class="space-y-4">
          <!-- AI compose input -->
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="flex items-center gap-2 border-b border-default bg-elevated px-4 py-2.5">
              <UIcon name="i-lucide-sparkles" class="size-4 text-muted" />
              <span class="text-xs font-semibold uppercase tracking-wider text-muted">AI Composer</span>
            </div>
            <div class="p-4 space-y-3">
              <UTextarea
                v-model="aiPrompt"
                :rows="2"
                placeholder="Describe a post... e.g. 'New Year's Eve dinner special, formal, include a call to action'"
                :disabled="aiLoading"
                @keydown.meta.enter="generatePost"
                @keydown.ctrl.enter="generatePost"
              />
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs text-muted">
                  <span v-if="credits !== null">{{ credits.toLocaleString() }} credits remaining · </span>Attach a photo for image-aware posts
                </p>
                <div class="flex items-center gap-2">
                  <label class="cursor-pointer">
                    <input ref="aiImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onAiImageSelect" />
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-image" :class="aiImageFile ? 'text-green-600' : ''" @click="aiImageInput?.click()">
                      {{ aiImageFile ? aiImageFile.name.slice(0, 12) + '…' : 'Photo' }}
                    </UButton>
                  </label>
                  <UButton size="sm" :loading="aiLoading" :disabled="!aiPrompt.trim()" icon="i-lucide-sparkles" @click="generatePost">
                    Generate
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Post list -->
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="flex items-center justify-between gap-4 border-b border-default bg-elevated px-4 py-2.5">
              <div class="flex items-center gap-3">
                <button
                  v-for="tab in ['all','published','archived']"
                  :key="tab"
                  class="text-xs font-semibold capitalize transition-colors"
                  :class="activeTab === tab ? 'text-highlighted' : 'text-muted hover:text-default'"
                  @click="activeTab = tab; loadPosts()"
                >{{ tab }}</button>
              </div>
              <div class="flex items-center gap-2">
                <UButton v-if="loading" size="xs" color="neutral" variant="ghost" loading />
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="!loading && posts.length === 0" class="px-4 py-10 text-center">
              <UIcon name="i-lucide-newspaper" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No posts yet. Use the AI composer or write one manually.</p>
            </div>

            <!-- Post rows -->
            <div
              v-for="post in posts"
              :key="post.id"
              class="flex cursor-pointer items-start gap-3 border-b border-default px-4 py-3.5 last:border-0 hover:bg-elevated"
              :class="selectedPost?.id === post.id ? 'bg-elevated' : ''"
              @click="selectPost(post)"
            >
            <div class="size-10 shrink-0 overflow-hidden rounded bg-muted">
              <video
                v-if="post.public_url && post.kind === 'video'"
                :src="post.public_url"
                class="h-full w-full object-cover"
                muted
                playsinline
                preload="metadata"
              />
              <img
                v-else-if="post.public_url"
                :src="post.public_url"
                :alt="post.title || 'Post image'"
                class="h-full w-full object-cover"
              >
              <div v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-lucide-file-text" class="size-4 text-muted" />
              </div>
            </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ post.title || post.body?.slice(0, 60) }}</p>
                <div class="flex items-center gap-2">
                  <p class="truncate text-xs text-muted">{{ formatDate(post.updated_at) }}</p>
                  <UBadge v-if="locations.length > 1" color="neutral" variant="subtle" size="xs">{{ locationTitle(post.location_id) }}</UBadge>
                </div>
              </div>
              <UBadge :color="post.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs" class="shrink-0">{{ post.status }}</UBadge>
            </div>
          </div>
        </div>

        <!-- Right: Editor + preview -->
        <div v-if="selectedPost || composing" class="space-y-4">
          <PostEditor
            v-model:title="editForm.title"
            v-model:body="editForm.body"
            v-model:slug="editForm.slug"
            v-model:seo-title="editForm.seo_title"
            v-model:seo-description="editForm.seo_description"
            v-model:image-asset-id="editForm.image_asset_id"
            v-model:image-preview-url="editForm.imagePreviewUrl"
            v-model:image-kind="editForm.imageKind"
            v-model:gallery-media="editForm.gallery_media"
            v-model:selected-channels="selectedChannels"
            v-model:location-id="editForm.location_id"
            :eyebrow="composing ? 'New post' : 'Site post'"
            :status-text="String(selectedPost?.status ?? '')"
            :site-id="siteId"
            :channel-options="channelOptions"
            :location-options="locationItemsWithoutAll"
            :show-image="true"
            :show-channels="true"
            :show-preview="true"
            :can-delete="Boolean(selectedPost)"
            :can-close="true"
            :saving="saving"
            :publishing="publishing"
            body-placeholder="What's the post about?"
            :body-rows="6"
            :publish-label="selectedChannels.length > 1 ? `Publish to ${selectedChannels.length} channels` : 'Publish'"
            @save="handleSave"
            @publish="handlePublish"
            @delete="handleDelete"
            @close="closeEditor"
          />
          <div v-if="selectedPost?.public_path || selectedPost?.canonical_url" class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="selectedPost?.public_path"
              :to="String(selectedPost.public_path)"
              target="_blank"
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-external-link"
            >
              View public post
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-copy"
              @click="copyPublicLink"
            >
              Copy public link
            </UButton>
          </div>
        </div>

        <!-- Right: empty state -->
        <div v-else class="hidden lg:flex items-center justify-center rounded-lg border border-dashed border-default text-sm text-muted">
          Select a post or generate one with AI
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const siteId = await useDashboardSiteId()
const toast = useToast()
const { trackPostCreated, trackPostPublished } = useAnalytics()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const sitePublicUrl = ref<string | null>(null)
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const _headerLinks = computed(() => buildHeaderLinks([
  { label: 'New post', icon: 'i-lucide-plus', color: 'primary' as const, onClick: openCompose }
]))

// Posts list
const posts = ref<ApiRecord[]>([])
const locations = computed(() => dashboard.locations.value)
const loading = ref(false)
const activeTab = ref('all')
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const locationItemsWithoutAll = computed(() => locations.value.map(location => ({ value: location.id, label: location.title })))

function locationTitle(locationId: string | null) {
  if (!locationId) return 'All locations'
  return locations.value.find(l => l.id === locationId)?.title ?? 'Unknown location'
}

const loadPosts = async () => {
  loading.value = true
  try {
    const query: Record<string, string> = {}
    if (activeTab.value !== 'all') query.status = activeTab.value
    if (currentLocationId.value) query.location_id = currentLocationId.value
    const res = await $fetch<{ posts: ApiRecord[] }>(`/api/editor/sites/${siteId}/posts`, { query })
    posts.value = res.posts ?? []
  } catch { toast.add({ description: 'Failed to load posts', color: 'error' }) } finally { loading.value = false }
}

async function loadSitePublicUrl() {
  try {
    const response = await $fetch<{ success: boolean; settings: { public_url?: string | null } }>(`/api/dashboard/settings`)
    sitePublicUrl.value = response.settings?.public_url || null
  } catch {
    sitePublicUrl.value = null
  }
}

async function loadFacebookConnection() {
  try {
    const res = await $fetch<{ connected: boolean }>('/api/integrations/facebook-pages/connection')
    facebookConnected.value = res.connected
  } catch {
    facebookConnected.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadPosts(), loadSitePublicUrl(), loadFacebookConnection()])
})

// Selection / compose
const selectedPost = ref<ApiRecord | null>(null)
const composing = ref(false)
interface GalleryFormItem {
  media_asset_id: string
  caption: string
  alt_text: string
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  role?: string | null
}

const editForm = reactive({
  title: '',
  body: '',
  slug: '',
  seo_title: '',
  seo_description: '',
  image_asset_id: '' as string | null,
  imagePreviewUrl: '' as string | null,
  imageKind: 'image' as string | null,
  gallery_media: [] as GalleryFormItem[],
  location_id: ''
})
const selectedChannels = ref<string[]>(['site'])

const facebookConnected = ref(false)

const channelOptions = computed(() => [
  { value: 'site', label: 'This website', disabled: false },
  { value: 'gmb', label: 'Google Business Profile', disabled: true },
  { value: 'facebook', label: 'Facebook Page', disabled: !facebookConnected.value, hint: facebookConnected.value ? undefined : 'Connect in Integrations' },
  { value: 'instagram', label: 'Instagram', disabled: !facebookConnected.value, hint: facebookConnected.value ? 'Requires image' : 'Connect in Integrations' },
])

function resetEditForm(locationId = '') {
  editForm.title = ''
  editForm.body = ''
  editForm.slug = ''
  editForm.seo_title = ''
  editForm.seo_description = ''
  editForm.image_asset_id = null
  editForm.imagePreviewUrl = null
  editForm.imageKind = 'image'
  editForm.gallery_media = []
  editForm.location_id = locationId
}

const openCompose = () => {
  selectedPost.value = null
  composing.value = true
  resetEditForm(currentLocationId.value ?? '')
  selectedChannels.value = ['site']
}

const closeEditor = () => {
  selectedPost.value = null
  composing.value = false
  resetEditForm()
  selectedChannels.value = []
}

const selectPost = (post: ApiRecord) => {
  composing.value = false
  selectedPost.value = post
  editForm.title = post.title ?? ''
  editForm.body = post.body ?? ''
  editForm.slug = post.slug ?? ''
  editForm.seo_title = post.seo_title ?? ''
  editForm.seo_description = post.seo_description ?? ''
  editForm.image_asset_id = post.image_asset_id ?? null
  editForm.imagePreviewUrl = post.public_url ?? null
  editForm.imageKind = post.kind ?? 'image'
  editForm.gallery_media = normalizeGalleryForForm(post.gallery_media ?? post.gallery ?? [])
  editForm.location_id = post.location_id ?? ''
  selectedChannels.value = ['site']
}

// Save / publish / delete
const saving = ref(false)
const publishing = ref(false)

function normalizeGalleryForForm(items: unknown): GalleryFormItem[] {
  if (!Array.isArray(items)) return []
  const gallery: GalleryFormItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.role === 'cover') continue
    const mediaAssetId = typeof record.mediaAssetId === 'string'
      ? record.mediaAssetId
      : typeof record.media_asset_id === 'string'
        ? record.media_asset_id
        : ''
    if (!mediaAssetId) continue
    gallery.push({
      media_asset_id: mediaAssetId,
      caption: typeof record.caption === 'string' ? record.caption : '',
      alt_text: typeof record.altText === 'string' ? record.altText : typeof record.alt_text === 'string' ? record.alt_text : '',
      public_url: typeof record.url === 'string' ? record.url : typeof record.public_url === 'string' ? record.public_url : null,
      thumbnail_url: typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : typeof record.thumbnail_url === 'string' ? record.thumbnail_url : null,
      kind: typeof record.kind === 'string' ? record.kind : null,
    })
  }
  return gallery
}

function buildPostPayload(postId?: string) {
  return {
    title: editForm.title,
    body: editForm.body,
    slug: editForm.slug || undefined,
    seo_title: editForm.seo_title || null,
    seo_description: editForm.seo_description || null,
    image_asset_id: editForm.image_asset_id,
    location_id: editForm.location_id || (postId ? null : undefined),
    gallery_media: editForm.gallery_media.map((item, index) => ({
      media_asset_id: item.media_asset_id,
      role: 'gallery',
      sort_order: index,
      caption: item.caption || null,
      alt_text: item.alt_text || null,
    })),
  }
}

const handleSave = async () => {
  if (!editForm.body.trim()) return
  saving.value = true
  try {
    if (selectedPost.value) {
      const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/posts/${selectedPost.value.id}`, {
        method: 'PATCH', body: buildPostPayload(String(selectedPost.value.id)),
      })
      selectedPost.value = res.post
    } else {
      const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/posts`, {
        method: 'POST', body: buildPostPayload(),
      })
      selectedPost.value = res.post
      composing.value = false
      if (res.post?.id) {
        trackPostCreated(String(res.post.id), siteId)
      }
    }
    toast.add({ description: 'Saved', color: 'success' })
    await loadPosts()
  } catch { toast.add({ description: 'Failed to save', color: 'error' }) }
  finally { saving.value = false }
}

function hasUnsavedEdits(): boolean {
  const post = selectedPost.value
  if (!post) return true
  if (editForm.title !== (post.title ?? '')) return true
  if (editForm.body !== (post.body ?? '')) return true
  if (editForm.slug !== (post.slug ?? '')) return true
  if (editForm.seo_title !== (post.seo_title ?? '')) return true
  if (editForm.seo_description !== (post.seo_description ?? '')) return true
  if (editForm.image_asset_id !== (post.image_asset_id ?? null)) return true
  if (editForm.location_id !== (post.location_id ?? '')) return true
  const currentGallery = normalizeGalleryForForm(post.gallery_media ?? post.gallery ?? [])
  if (JSON.stringify(editForm.gallery_media) !== JSON.stringify(currentGallery)) return true
  return false
}

const handlePublish = async () => {
  if (!editForm.body.trim()) return
  publishing.value = true
  try {
    // Save any edits first
    let postId = selectedPost.value?.id
    if (!postId || hasUnsavedEdits()) {
      const method = postId ? 'PATCH' : 'POST'
      const url = postId ? `/api/editor/sites/${siteId}/posts/${postId}` : `/api/editor/sites/${siteId}/posts`
      const res = await $fetch<ApiRecord>(url, { method, body: buildPostPayload(postId ? String(postId) : undefined) })
      postId = res.post.id
      selectedPost.value = res.post
    }
    const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/posts/${postId}/publish`, {
      method: 'POST', body: { channels: selectedChannels.value },
    })
    selectedPost.value = res.post
    composing.value = false
    trackPostPublished(String(postId), siteId)
    if (res.socialErrors && Object.keys(res.socialErrors).length > 0) {
      const errLines = Object.entries(res.socialErrors as Record<string, string>)
        .map(([ch, msg]) => `${ch}: ${msg}`).join(' · ')
      toast.add({ title: 'Published to site', description: `Social channels had issues — ${errLines}`, color: 'warning' })
    } else {
      toast.add({ description: 'Published!', color: 'success' })
    }
    await loadPosts()
  } catch { toast.add({ description: 'Failed to publish', color: 'error' }) }
  finally { publishing.value = false }
}

const handleDelete = async () => {
  if (!selectedPost.value) return
  try {
    await $fetch(`/api/editor/sites/${siteId}/posts/${selectedPost.value.id}`, { method: 'DELETE' })
    selectedPost.value = null
    toast.add({ description: 'Post deleted', color: 'neutral' })
    await loadPosts()
  } catch { toast.add({ description: 'Failed to delete', color: 'error' }) }
}

async function copyPublicLink() {
  const path = selectedPost.value?.canonical_url || selectedPost.value?.public_path
  if (!path || !import.meta.client) return
  const url = String(path).startsWith('http') ? String(path) : new URL(String(path), window.location.origin).toString()
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(url)
    toast.add({ description: 'Public link copied', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to copy public link', color: 'error' })
  }
}

// AI composer
const aiPrompt = ref('')
const aiLoading = ref(false)
const aiImageFile = ref<File | null>(null)
const aiImageInput = ref<HTMLInputElement | null>(null)
const credits = ref<number | null>(null)

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const errorMessage = (data as Record<string, unknown>).error
      if (typeof errorMessage === 'string' && errorMessage) return errorMessage
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

const onAiImageSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > 5 * 1024 * 1024) {
    toast.add({ description: 'Image must be under 5 MB', color: 'error' })
    if (aiImageInput.value) aiImageInput.value.value = ''
    aiImageFile.value = null
    return
  }
  aiImageFile.value = file
}

const generatePost = async () => {
  if (!aiPrompt.value.trim() || aiLoading.value) return
  aiLoading.value = true
  try {
    let image_base64: string | undefined
    let image_mime: string | undefined

    if (aiImageFile.value) {
      const file = aiImageFile.value
      image_mime = file.type
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      const commaIndex = dataUrl.indexOf(',')
      if (commaIndex === -1 || commaIndex === dataUrl.length - 1) {
        throw new Error('Failed to read image data.')
      }
      image_base64 = dataUrl.slice(commaIndex + 1)
    }

    const res = await $fetch<ApiRecord>(`/api/dashboard/ai/posts/generate`, {
      method: 'POST',
      body: { prompt: aiPrompt.value.trim(), image_base64, image_mime },
    })

    credits.value = res.credits?.remaining ?? null
    openCompose()
    editForm.title = res.generated.title ?? ''
    editForm.body = res.generated.body ?? ''
    aiPrompt.value = ''
    aiImageFile.value = null
    toast.add({ description: 'Post generated — review before saving', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Generation failed. Try again.'), color: 'error' })
  } finally { aiLoading.value = false }
}

const formatDate = (iso: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: 'Posts | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

watch(currentLocationId, () => {
  void loadPosts()
})
</script>
