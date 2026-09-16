import { parsePostTopic, type PostMutation } from '~/shared/posts'
import { getErrorMessage } from '~/utils/errors'

export interface PostMediaFormItem {
  asset_id: string
  slot: 'cover' | 'gallery'
  alt_text: string
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
}

export function normalizePostMediaForForm(items: unknown): PostMediaFormItem[] {
  if (!Array.isArray(items)) return []
  const media: PostMediaFormItem[] = []
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

export const isPostResponse = (value: unknown): value is ApiRecord =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && (value.socialErrors === undefined || isRecord(value.socialErrors))

export function useLocationPostEditor(siteId: string, locationId: Ref<string | null>) {
  const dashboardApi = useDashboardApi()
  const error = ref<string | null>(null)
  const { trackPostCreated, trackPostPublished } = useAnalytics()

  const form = reactive({
    topic: { post_type: 'standard' } as PostMutation,
    title: '',
    body: '',
    slug: '',
    seo_title: '',
    seo_description: '',
    media: [] as PostMediaFormItem[],
  })

  // Snapshot of media as loaded from the server, used only to compute which
  // specific attach/remove calls this editing session's own changes require —
  // never sent to the server as a full array. See syncPostMedia.
  let originalMedia: PostMediaFormItem[] = []
  const selectedChannels = ref<string[]>(['site'])
  const saving = ref(false)
  const publishing = ref(false)

  function reset() {
    form.topic = { post_type: 'standard' }
    form.title = ''
    form.body = ''
    form.slug = ''
    form.seo_title = ''
    form.seo_description = ''
    form.media = []
    originalMedia = []
    selectedChannels.value = ['site']
    savedSnapshot.value = snapshot()
  }

  /** What the form looked like when it was last in sync with the server. */
  const savedSnapshot = ref('')

  function snapshot() {
    return JSON.stringify({
      ...form.topic,
      title: form.title,
      body: form.body,
      slug: form.slug,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      // A freshly added gallery row has no asset yet; sending it would write a
      // placement with an empty asset_id.
      media: form.media
        .filter(item => item.asset_id)
        .map(item => ({ asset_id: item.asset_id, slot: item.slot, alt_text: item.alt_text })),
    })
  }

  /** Nothing to write means nothing to write — a save with no edits would still
   *  run server-side validation over the whole row, so an already-invalid record
   *  would block actions that never touched it. */
  const isDirty = computed(() => snapshot() !== savedSnapshot.value)

  function loadFrom(post: ApiRecord) {
    form.topic = { ...parsePostTopic({ post_type: post.post_type, event: post.event, offer: post.offer, call_to_action: post.call_to_action, alert_type: post.alert_type }), scheduled_for: typeof post.scheduled_for === 'string' ? post.scheduled_for : null }
    form.title = String(post.title ?? '')
    form.body = String(post.body ?? '')
    form.slug = String(post.slug ?? '')
    form.seo_title = String(post.seo_title ?? '')
    form.seo_description = String(post.seo_description ?? '')
    form.media = normalizePostMediaForForm(post.media)
    originalMedia = form.media.map(item => ({ ...item }))
    selectedChannels.value = ['site']
    savedSnapshot.value = snapshot()
  }

  function buildPayload(ownerLocationId: string, postId?: string) {
    const base = {
      ...form.topic,
      title: form.title,
      body: form.body,
      slug: form.slug || undefined,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      location_id: ownerLocationId,
    }
    // Creation only: post:gallery membership on an update never travels as a
    // full array (see syncMedia) — only a brand-new post's initial media is
    // safe to seed this way, since nothing exists yet to resurrect.
    if (postId) return base
    return {
      ...base,
      media: form.media
        .filter(item => item.asset_id)
        .map(item => ({ asset_id: item.asset_id, slot: item.slot })),
    }
  }

  const isPlacementResponse = (value: unknown): value is { asset_ids: string[] } =>
    isRecord(value) && Array.isArray(value.asset_ids)

  async function syncMedia(postId: string) {
    const originalCover = originalMedia.find(item => item.slot === 'cover')?.asset_id ?? null
    const currentCover = form.media.find(item => item.slot === 'cover')?.asset_id ?? null
    if (currentCover !== originalCover) {
      await dashboardApi(`/api/editor/sites/${siteId}/media/placements`, {
        method: 'PUT',
        body: { placement: { owner_type: 'post', owner_id: postId, slot: 'cover' }, asset_id: currentCover },
        validate: isPlacementResponse,
      })
    }

    const originalGallery = originalMedia.filter(item => item.slot === 'gallery').map(item => item.asset_id).filter(Boolean)
    const currentGallery = form.media.filter(item => item.slot === 'gallery').map(item => item.asset_id).filter(Boolean)
    const originalGalleryIds = new Set(originalGallery)
    const currentGalleryIds = new Set(currentGallery)
    const placement = { owner_type: 'post', owner_id: postId, slot: 'gallery' }
    for (const assetId of originalGalleryIds) {
      if (currentGalleryIds.has(assetId)) continue
      await dashboardApi(`/api/editor/sites/${siteId}/media/placements/remove`, {
        method: 'POST', body: { placement, asset_id: assetId }, validate: isPlacementResponse,
      })
    }
    for (const assetId of currentGalleryIds) {
      if (originalGalleryIds.has(assetId)) continue
      await dashboardApi(`/api/editor/sites/${siteId}/media/placements/attach`, {
        method: 'POST', body: { placement, asset_id: assetId }, validate: isPlacementResponse,
      })
    }

    // Attach and remove do not carry order, and the post PATCH excludes media,
    // so without this a reorder looks saved and comes back in its old order.
    const orderChanged = currentGallery.length > 1
      && currentGallery.some((assetId, index) => originalGallery[index] !== assetId)
    if (orderChanged) {
      const moves = currentGallery.map((assetId, index) => index === currentGallery.length - 1
        ? { asset_id: assetId }
        : { asset_id: assetId, before_asset_id: currentGallery[index + 1]! })
      await dashboardApi(`/api/editor/sites/${siteId}/media/placements/reorder`, {
        method: 'POST', body: { placement, moves: moves.reverse() }, validate: isPlacementResponse,
      })
    }
  }

  /** Returns the saved post, or null when the save could not run or failed. */
  async function save(postId: string | null): Promise<ApiRecord | null> {
    const ownerLocationId = locationId.value
    if (!form.body.trim() || !ownerLocationId) return null
    error.value = null
    saving.value = true
    try {
      if (postId) {
        if (form.topic.post_type === 'alert') await syncMedia(postId)
        const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts/${postId}`, {
          method: 'PATCH', body: buildPayload(ownerLocationId, postId), validate: isPostResponse,
        })
        if (form.topic.post_type !== 'alert') await syncMedia(postId)
        originalMedia = form.media.map(item => ({ ...item }))
        savedSnapshot.value = snapshot()
        return res.post as ApiRecord
      }
      const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts`, {
        method: 'POST', body: buildPayload(ownerLocationId), validate: isPostResponse,
      })
      const created = res.post as ApiRecord
      originalMedia = form.media.map(item => ({ ...item }))
      savedSnapshot.value = snapshot()
      if (created.id) trackPostCreated(String(created.id), siteId)
      return created
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to save')
      return null
    } finally {
      saving.value = false
    }
  }

  async function publish(postId: string | null): Promise<ApiRecord | null> {
    const ownerLocationId = locationId.value
    if (!form.body.trim() || !ownerLocationId) return null
    error.value = null
    publishing.value = true
    try {
      let id = postId
      if (!id) {
        const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts`, {
          method: 'POST', body: buildPayload(ownerLocationId), validate: isPostResponse,
        })
        id = String((res.post as ApiRecord).id)
      } else if (isDirty.value) {
        if (form.topic.post_type === 'alert') await syncMedia(id)
        await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts/${id}`, {
          method: 'PATCH', body: buildPayload(ownerLocationId, id), validate: isPostResponse,
        })
        if (form.topic.post_type !== 'alert') await syncMedia(id)
      }
      const res = await dashboardApi<ApiRecord>(`/api/editor/sites/${siteId}/posts/${id}/publish`, {
        method: 'POST', body: { channels: selectedChannels.value }, validate: isPostResponse,
      })
      originalMedia = form.media.map(item => ({ ...item }))
      savedSnapshot.value = snapshot()
      trackPostPublished(String(id), siteId)
      if (isRecord(res.socialErrors) && Object.keys(res.socialErrors).length > 0) {
        const errorMessages = Object.entries(res.socialErrors).map(([ch, err]) => `${ch}: ${err}`).join(', ')
        error.value = `Published, but social channel delivery failed: ${errorMessages}`
      }
      return res.post as ApiRecord
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to publish')
      return null
    } finally {
      publishing.value = false
    }
  }

  async function remove(postId: string): Promise<boolean> {
    error.value = null
    try {
      await dashboardApi(`/api/editor/sites/${siteId}/posts/${postId}`, {
        method: 'DELETE',
        validate: (value): value is { success: true } => isRecord(value) && value.success === true,
      })
      return true
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to delete')
      return false
    }
  }

  return { form, selectedChannels, saving, publishing, isDirty, error, reset, loadFrom, save, publish, remove }
}
