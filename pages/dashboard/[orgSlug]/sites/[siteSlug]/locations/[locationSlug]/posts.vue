<template>
  <UDashboardPanel id="location-posts">
    <template #header>
      <UDashboardNavbar title="Posts">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
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
                  <div>
                    <UInput ref="aiImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onAiImageSelect" />
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-image" @click.stop="aiImageInput?.inputRef?.click()">
                      {{ aiImageFile ? aiImageFile.name.slice(0, 12) + '…' : 'Photo' }}
                    </UButton>
                  </div>
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
                <UButton
                  v-for="tab in postTabs"
                  :key="tab.value"
                  size="xs"
                  :variant="activeTab === tab.value ? 'soft' : 'ghost'"
                  color="neutral"
                  :aria-pressed="activeTab === tab.value"
                  @click="activeTab = tab.value; loadPosts()"
                >{{ tab.label }}</UButton>
              </div>
              <div class="flex items-center gap-2">
                <UButton v-if="loading" size="xs" color="neutral" variant="ghost" loading />
              </div>
            </div>

            <UAlert
              v-if="postsLoadError"
              color="error"
              variant="soft"
              title="Posts could not be loaded"
              :description="postsLoadError"
              class="m-4"
            />
            <UAlert
              v-if="facebookLoadError"
              color="warning"
              variant="soft"
              title="Publishing connection could not be loaded"
              :description="facebookLoadError"
              class="m-4"
            />

            <!-- Empty state -->
            <div v-if="!loading && !postsLoadError && posts.length === 0" class="px-4 py-10 text-center">
              <UIcon name="i-lucide-newspaper" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No posts yet. Use the AI composer or write one manually.</p>
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-pencil" @click="openCompose">
                New post
              </UButton>
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
                <p class="truncate text-xs text-muted">{{ formatDate(post.updated_at) }}</p>
              </div>
              <UBadge :color="post.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs" class="shrink-0">{{ post.status === 'published' ? 'Live' : 'Scheduled' }}</UBadge>
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
            v-model:media="editForm.media"
            v-model:selected-channels="selectedChannels"
            :eyebrow="composing ? 'New location post' : 'Location post'"
            :status-text="String(selectedPost?.status ?? '')"
            :site-id="siteId"
            :channel-options="channelOptions"
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
            :save-label="selectedPost ? 'Save live changes' : 'Publish to website'"
            @save="handleSave"
            @publish="handlePublish"
            @delete="handleDelete"
            @close="closeEditor"
          />
          <div v-if="selectedPost && translationLocales.length" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-sm font-semibold">Translations</h3>
              <select v-model="translationLocale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
                <option value="en">en</option>
                <option v-for="option in translationLocales" :key="option" :value="option">{{ option }}</option>
              </select>
            </div>
            <template v-if="translationLocale !== 'en'">
              <p class="text-xs text-muted">Source (English): {{ editForm.title }}</p>
              <UFormField :label="`Title (${translationLocale})`"><UInput v-model="translationFields.title" class="w-full" /></UFormField>
              <UFormField :label="`Body (${translationLocale})`"><UTextarea v-model="translationFields.body" :rows="5" class="w-full" /></UFormField>
              <UFormField :label="`SEO title (${translationLocale})`"><UInput v-model="translationFields.seo_title" class="w-full" /></UFormField>
              <UFormField :label="`SEO description (${translationLocale})`"><UTextarea v-model="translationFields.seo_description" :rows="2" class="w-full" /></UFormField>
              <UFormField :label="`Event title (${translationLocale})`"><UInput v-model="translationFields.event_title" class="w-full" /></UFormField>
              <UFormField :label="`Offer terms (${translationLocale})`"><UTextarea v-model="translationFields.offer_terms" :rows="2" class="w-full" /></UFormField>
              <p v-if="translationError" class="text-sm text-error">{{ translationError }}</p>
              <UButton :loading="translationSaving" label="Save translation" @click="saveTranslation" />
            </template>
          </div>
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
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.posts' })

const siteId = await useDashboardSiteId()
const toast = useToast()
const { trackPostCreated, trackPostPublished } = useAnalytics()
const dashboardLocation = useDashboardLocation()

// Posts list
const posts = ref<ApiRecord[]>([])
const loading = ref(false)
const postsLoadError = ref<string | null>(null)
const facebookLoadError = ref<string | null>(null)
const facebookConnected = ref(false)
const postTabs = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
] as const
const activeTab = ref<(typeof postTabs)[number]['value']>('all')
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
let postsLoadGeneration = 0
const isPostsResponse = (value: unknown): value is { posts: ApiRecord[] } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post =>
    isRecord(post)
    && typeof post.id === 'string'
    && typeof post.status === 'string',
  )
const isFacebookResponse = (value: unknown): value is { connected: boolean } =>
  isRecord(value) && typeof value.connected === 'boolean'
const isPostResponse = (value: unknown): value is ApiRecord =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && (value.socialErrors === undefined || isRecord(value.socialErrors))
const isGeneratedPostResponse = (value: unknown): value is ApiRecord =>
  isRecord(value)
  && isRecord(value.generated)
  && typeof value.generated.title === 'string'
  && typeof value.generated.body === 'string'
  && isRecord(value.credits)
  && typeof value.credits.remaining === 'number'

const loadPosts = async () => {
  const requestedLocationId = currentLocationId.value
  const generation = ++postsLoadGeneration
  if (!requestedLocationId) {
    posts.value = []
    loading.value = false
    return
  }
  loading.value = true
  postsLoadError.value = null
  try {
    const query: Record<string, string> = {}
    if (activeTab.value !== 'all') query.status = activeTab.value
    query.location_id = requestedLocationId
    const res = await dashboardApi<{ posts: ApiRecord[] }>(`/api/editor/sites/${siteId}/posts`, {
      query,
      validate: isPostsResponse,
    })
    if (generation !== postsLoadGeneration || currentLocationId.value !== requestedLocationId) return
    posts.value = res.posts ?? []
  } catch (error) {
    if (generation === postsLoadGeneration) {
      postsLoadError.value = error instanceof Error ? error.message : 'Failed to load posts'
      toast.add({ description: postsLoadError.value, color: 'error' })
    }
  } finally {
    if (generation === postsLoadGeneration) loading.value = false
  }
}

const requestEvent = useRequestEvent()
const postsKey = computed(() =>
  `dashboard-location-posts:${siteId}:${currentLocationId.value ?? 'missing'}`,
)
const { data: postsResource, pending: postsPending, error: postsResourceError } = await useAsyncData(
  postsKey,
  async () => {
    if (!currentLocationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardLocationPosts } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardLocationPosts(requestEvent, siteId, currentLocationId.value)
    }
    const [postsResponse, facebookResponse] = await Promise.all([
      dashboardApi<{ posts: ApiRecord[] }>(`/api/editor/sites/${siteId}/posts`, {
        query: { location_id: currentLocationId.value },
        validate: isPostsResponse,
      }),
      dashboardApi<{ connected: boolean }>('/api/integrations/facebook-pages/connection', {
        query: { locationId: currentLocationId.value },
        validate: isFacebookResponse,
      }),
    ])
    return { posts: postsResponse, facebook: facebookResponse }
  },
  { lazy: import.meta.client },
)

watch([postsResource, postsPending, postsResourceError], ([resource, pending, error]) => {
  loading.value = pending
  if (error) {
    const message = error instanceof Error ? error.message : 'Failed to load posts'
    postsLoadError.value = message
    facebookLoadError.value = message
    return
  }
  if (!resource) return
  posts.value = resource.posts.posts as ApiRecord[]
  facebookConnected.value = resource.facebook.connected
  postsLoadError.value = null
  facebookLoadError.value = null
}, { immediate: true })

// Selection / compose
const selectedPost = ref<ApiRecord | null>(null)
const composing = ref(false)
interface MediaFormItem {
  asset_id: string
  slot: 'cover' | 'gallery'
  alt_text: string
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
}

const editForm = reactive({
  title: '',
  body: '',
  slug: '',
  seo_title: '',
  seo_description: '',
  media: [] as MediaFormItem[],
})
// Snapshot of media as loaded from the server, used only to compute which
// specific attach/remove calls this editing session's own changes require —
// never sent to the server as a full array. See syncPostMedia.
let originalMedia: MediaFormItem[] = []
const selectedChannels = ref<string[]>(['site'])

const channelOptions = computed(() => [
  { value: 'site', label: 'This website', disabled: false },
  { value: 'facebook', label: 'Facebook Page', disabled: !facebookConnected.value, hint: facebookConnected.value ? undefined : 'Connect in Integrations' },
  { value: 'instagram', label: 'Instagram', disabled: !facebookConnected.value, hint: facebookConnected.value ? 'Requires image' : 'Connect in Integrations' },
])

function resetEditForm() {
  editForm.title = ''
  editForm.body = ''
  editForm.slug = ''
  editForm.seo_title = ''
  editForm.seo_description = ''
  editForm.media = []
  originalMedia = []
}

const openCompose = () => {
  selectedPost.value = null
  composing.value = true
  resetEditForm()
  selectedChannels.value = ['site']
}

const closeEditor = () => {
  selectedPost.value = null
  composing.value = false
  resetEditForm()
  selectedChannels.value = []
}

// ── Translations (resource_localizations, same API as the editor CRUD) ──
const translationLocale = ref('en')
const translationLocales = ref<string[]>([])
const translationFields = reactive({ title: '', body: '', seo_title: '', seo_description: '', event_title: '', offer_terms: '' })
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
function isPostLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadTranslationLocales() {
  try {
    const response = await dashboardApi<{ languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> }>(
      `/api/editor/sites/${siteId}/locales`,
      { validate: isPostLocalesResponse },
    )
    translationLocales.value = response.languages.filter(item => item.locale_status === 'published' && !item.is_source).map(item => item.locale)
  } catch (cause) {
    translationLocales.value = []
    translationError.value = cause instanceof Error ? cause.message : 'Failed to load site languages'
  }
}
function isPostTranslationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}
async function loadTranslationFields(postId: string) {
  translationError.value = null
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/site_post/${postId}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isPostTranslationResponse },
    )
    const values = response.localization.values
    translationFields.title = typeof values.title === 'string' ? values.title : ''
    translationFields.body = typeof values.body === 'string' ? values.body : ''
    translationFields.seo_title = typeof values.seo_title === 'string' ? values.seo_title : ''
    translationFields.seo_description = typeof values.seo_description === 'string' ? values.seo_description : ''
    translationFields.event_title = typeof values.event_title === 'string' ? values.event_title : ''
    translationFields.offer_terms = typeof values.offer_terms === 'string' ? values.offer_terms : ''
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) translationError.value = cause instanceof Error ? cause.message : 'Failed to load translation'
    translationFields.title = ''; translationFields.body = ''
    translationFields.seo_title = ''; translationFields.seo_description = ''
    translationFields.event_title = ''; translationFields.offer_terms = ''
  }
}
watch(translationLocale, () => {
  if (selectedPost.value?.id && translationLocale.value !== 'en') void loadTranslationFields(String(selectedPost.value.id))
})
async function saveTranslation() {
  if (!selectedPost.value?.id || translationLocale.value === 'en') return
  translationSaving.value = true; translationError.value = null
  try {
    const values: Record<string, string> = {}
    if (translationFields.title.trim()) values.title = translationFields.title.trim()
    if (translationFields.body.trim()) values.body = translationFields.body.trim()
    if (translationFields.seo_title.trim()) values.seo_title = translationFields.seo_title.trim()
    if (translationFields.seo_description.trim()) values.seo_description = translationFields.seo_description.trim()
    if (translationFields.event_title.trim()) values.event_title = translationFields.event_title.trim()
    if (translationFields.offer_terms.trim()) values.offer_terms = translationFields.offer_terms.trim()
    const slug = String(selectedPost.value.slug ?? '')
    await dashboardApi(`/api/editor/sites/${siteId}/localization/site_post/${selectedPost.value.id}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values, route_path: `/${translationLocale.value}/posts/${slug}` },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    translationError.value = cause instanceof Error ? cause.message : 'Failed to save translation'
  } finally {
    translationSaving.value = false
  }
}
void loadTranslationLocales()

const selectPost = (post: ApiRecord) => {
  translationLocale.value = 'en'
  composing.value = false
  selectedPost.value = post
  editForm.title = post.title ?? ''
  editForm.body = post.body ?? ''
  editForm.slug = post.slug ?? ''
  editForm.seo_title = post.seo_title ?? ''
  editForm.seo_description = post.seo_description ?? ''
  const media = Array.isArray(post.media) ? post.media : []
  editForm.media = normalizeMediaForForm(media)
  originalMedia = editForm.media.map(item => ({ ...item }))
  selectedChannels.value = ['site']
}

// Save / publish / delete
const saving = ref(false)
const publishing = ref(false)

function normalizeMediaForForm(items: unknown): MediaFormItem[] {
  if (!Array.isArray(items)) return []
  const media: MediaFormItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if ((record.slot !== 'cover' && record.slot !== 'gallery') || typeof record.asset_id !== 'string') continue
    media.push({
      asset_id: record.asset_id,
      slot: record.slot,
      alt_text: typeof record.alt_text === 'string' ? record.alt_text : '',
      public_url: typeof record.public_url === 'string' ? record.public_url : null,
      thumbnail_url: typeof record.thumbnail_url === 'string' ? record.thumbnail_url : null,
      kind: typeof record.kind === 'string' ? record.kind : null,
    })
  }
  return media
}

function buildPostPayload(locationId: string, postId?: string) {
  const base = {
    title: editForm.title,
    body: editForm.body,
    slug: editForm.slug || undefined,
    seo_title: editForm.seo_title || null,
    seo_description: editForm.seo_description || null,
    location_id: locationId ?? (postId ? null : undefined),
  }
  // Creation only: post:gallery membership on an update never travels as a
  // full array (see syncPostMedia) — only a brand-new post's initial media
  // is safe to seed this way, since nothing exists yet to resurrect.
  if (postId) return base
  return {
    ...base,
    media: editForm.media.map(item => ({
      asset_id: item.asset_id,
      slot: item.slot,
      alt_text: item.alt_text,
    })),
  }
}

async function syncPostMedia(postId: string) {
  const originalCover = originalMedia.find(item => item.slot === 'cover')?.asset_id ?? null
  const currentCover = editForm.media.find(item => item.slot === 'cover')?.asset_id ?? null
  if (currentCover !== originalCover) {
    await dashboardApi(`/api/editor/sites/${siteId}/media/placements`, {
      method: 'PUT',
      body: { placement: { owner_type: 'post', owner_id: postId, slot: 'cover' }, asset_id: currentCover },
      validate: (value): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids),
    })
  }

  const originalGalleryIds = new Set(originalMedia.filter(item => item.slot === 'gallery').map(item => item.asset_id))
  const currentGalleryIds = new Set(editForm.media.filter(item => item.slot === 'gallery').map(item => item.asset_id))
  const placement = { owner_type: 'post', owner_id: postId, slot: 'gallery' }
  for (const assetId of originalGalleryIds) {
    if (currentGalleryIds.has(assetId)) continue
    await dashboardApi(`/api/editor/sites/${siteId}/media/placements/remove`, {
      method: 'POST',
      body: { placement, asset_id: assetId },
      validate: (value): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids),
    })
  }
  for (const assetId of currentGalleryIds) {
    if (originalGalleryIds.has(assetId)) continue
    await dashboardApi(`/api/editor/sites/${siteId}/media/placements/attach`, {
      method: 'POST',
      body: { placement, asset_id: assetId },
      validate: (value): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids),
    })
  }
}

const handleSave = async () => {
  const locationId = currentLocationId.value
  if (!editForm.body.trim() || !locationId) return
  saving.value = true
  try {
    if (selectedPost.value) {
      const postId = String(selectedPost.value.id)
      const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts/${postId}`, {
        method: 'PATCH', body: buildPostPayload(locationId, postId),
        validate: isPostResponse,
      })
      await syncPostMedia(postId)
      originalMedia = editForm.media.map(item => ({ ...item }))
      if (currentLocationId.value !== locationId) return
      selectedPost.value = res.post
    } else {
      const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts`, {
        method: 'POST', body: buildPostPayload(locationId),
        validate: isPostResponse,
      })
      if (currentLocationId.value !== locationId) return
      selectedPost.value = res.post
      composing.value = false
      originalMedia = editForm.media.map(item => ({ ...item }))
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
  const postMedia = Array.isArray(post.media) ? post.media : []
  if (currentLocationId.value !== (post.location_id ?? null)) return true
  const currentMedia = normalizeMediaForForm(postMedia)
  if (JSON.stringify(editForm.media) !== JSON.stringify(currentMedia)) return true
  return false
}

const handlePublish = async () => {
  const locationId = currentLocationId.value
  if (!editForm.body.trim() || !locationId) return
  publishing.value = true
  try {
    // Save any edits first
    let postId = selectedPost.value?.id
    if (!postId || hasUnsavedEdits()) {
      const method = postId ? 'PATCH' : 'POST'
      const url = postId ? `/api/editor/sites/${siteId}/posts/${postId}` : `/api/editor/sites/${siteId}/posts`
      const res = await dashboardApi<ApiRecord>(url, {
        method,
        body: buildPostPayload(locationId, postId ? String(postId) : undefined),
        validate: isPostResponse,
      })
      if (currentLocationId.value !== locationId) return
      postId = res.post.id
      selectedPost.value = res.post
    }
    const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts/${postId}/publish`, {
      method: 'POST', body: { channels: selectedChannels.value },
      validate: isPostResponse,
    })
    if (currentLocationId.value !== locationId) return
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
    await dashboardApi(`/api/editor/sites/${siteId}/posts/${selectedPost.value.id}`, {
      method: 'DELETE',
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
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
const aiImageInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const credits = ref<number | null>(null)

const onAiImageSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > 5 * 1024 * 1024) {
    toast.add({ description: 'Image must be under 5 MB', color: 'error' })
    if (aiImageInput.value?.inputRef) aiImageInput.value.inputRef.value = ''
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

    const res = await dashboardApi<ApiRecord>(`/api/ai/${siteId}/posts/generate`, {
      method: 'POST',
      body: { prompt: aiPrompt.value.trim(), image_base64, image_mime },
      validate: isGeneratedPostResponse,
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
  selectedPost.value = null
  composing.value = false
  resetEditForm()
  selectedChannels.value = []
})
</script>
