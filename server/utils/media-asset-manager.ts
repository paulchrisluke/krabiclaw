import { deleteImage } from './cloudflare-images'
import { deleteFromR2 } from './cloudflare-r2'
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { fireSiteEventSafe } from '~/server/utils/site-events'

type SqlBindValue = string | number | boolean | null
type MediaProviderEnv = Parameters<typeof deleteImage>[0]

export interface MediaAsset {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  kind: 'image' | 'video' | 'file'
  provider: 'cloudflare_images' | 'cloudflare_r2' | 'google_business' | 'external_url' | 'chowbot'
  source: 'uploaded' | 'google_sync' | 'generated' | 'external' | 'template_stock'
  cloudflare_image_id: string | null
  r2_key: string | null
  google_media_name: string | null
  public_url: string | null
  thumbnail_url: string | null
  mime_type: string | null
  file_name: string | null
  file_size: number | null
  width: number | null
  height: number | null
  duration: number | null
  alt_text: string | null
  category: 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo' | 'blog' | null
  status: 'pending' | 'active' | 'deleted' | 'failed'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
  delete_pending_at: string | null
}

export type CreateInput = Pick<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source'> &
  Partial<Omit<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source' | 'created_at' | 'updated_at'>>

export async function createMediaAsset(db: DbClient, data: CreateInput): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO media_assets (
      id, organization_id, site_id, location_id, kind, provider, source,
      cloudflare_image_id, r2_key, google_media_name,
      public_url, thumbnail_url, mime_type, file_name, file_size,
      width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.id, data.organization_id, data.site_id, data.location_id ?? null,
    data.kind, data.provider, data.source,
    data.cloudflare_image_id ?? null, data.r2_key ?? null, data.google_media_name ?? null,
    data.public_url ?? null, data.thumbnail_url ?? null,
    data.mime_type ?? null, data.file_name ?? null, data.file_size ?? null,
    data.width ?? null, data.height ?? null, data.duration ?? null,
    data.alt_text ?? null, data.category ?? null, data.status ?? 'active',
    data.created_by_user_id ?? null, now, now,
  ])

  await fireSiteEventSafe({
    db,
    organizationId: data.organization_id,
    siteId: data.site_id,
    locationId: data.location_id ?? null,
    actorId: data.created_by_user_id ?? null,
    eventType: 'media.uploaded',
    entityType: 'media_asset',
    entityId: data.id,
    metadata: {
      kind: data.kind,
      provider: data.provider,
      source: data.source,
      status: data.status ?? 'active',
    },
  })
}

export async function getMediaAsset(db: DbClient, id: string, siteId: string): Promise<MediaAsset | null> {
  return await queryFirst<MediaAsset>(
    db,
    `SELECT * FROM media_assets WHERE id = ? AND site_id = ? LIMIT 1`,
    [id, siteId],
  ) ?? null
}

export async function listMediaAssets(
  db: DbClient,
  siteId: string,
  opts: { kind?: string; locationId?: string; limit?: number; offset?: number } = {}
): Promise<MediaAsset[]> {
  const conditions = [`site_id = ?`, `status = 'active'`]
  const params: SqlBindValue[] = [siteId]
  if (opts.kind) { conditions.push(`kind = ?`); params.push(opts.kind) }
  if (opts.locationId) { conditions.push(`location_id = ?`); params.push(opts.locationId) }
  params.push(opts.limit ?? 50, opts.offset ?? 0)
  const results = await queryAll<MediaAsset>(
    db,
    `SELECT id, organization_id, site_id, location_id, kind, provider, source,
            cloudflare_image_id, r2_key, google_media_name,
            public_url, thumbnail_url, mime_type, file_name, file_size,
            width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
     FROM media_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    , params,
  )
  return results
}

export async function activateMediaAsset(
  db: DbClient,
  id: string,
  siteId: string,
  updates: { public_url?: string | null; thumbnail_url?: string | null; cloudflare_image_id?: string | null }
): Promise<boolean> {
  const now = new Date().toISOString()
  const sets: string[] = [`status = 'active'`, `updated_at = ?`]
  const params: SqlBindValue[] = [now]
  if (updates.public_url !== undefined) { sets.push('public_url = ?'); params.push(updates.public_url) }
  if (updates.thumbnail_url !== undefined) { sets.push('thumbnail_url = ?'); params.push(updates.thumbnail_url) }
  if (updates.cloudflare_image_id !== undefined) { sets.push('cloudflare_image_id = ?'); params.push(updates.cloudflare_image_id) }
  params.push(id, siteId)
  const result = await execute(db, `UPDATE media_assets SET ${sets.join(', ')} WHERE id = ? AND site_id = ? AND status = 'pending'`, params)
  return Number(result?.meta?.changes ?? 0) > 0
}

export async function updateMediaAssetAlt(db: DbClient, id: string, siteId: string, altText: string): Promise<boolean> {
  const result = await execute(
    db,
    `UPDATE media_assets SET alt_text = ?, updated_at = ? WHERE id = ? AND site_id = ?`,
    [altText, new Date().toISOString(), id, siteId],
  )
  return Number(result?.meta?.changes ?? 0) > 0
}

export async function updateMediaAssetMetadata(
  db: DbClient,
  id: string,
  siteId: string,
  updates: { alt_text?: string | null; location_id?: string | null; category?: MediaAsset['category'] }
): Promise<boolean> {
  const sets: string[] = ['updated_at = ?']
  const params: SqlBindValue[] = [new Date().toISOString()]
  if (updates.alt_text !== undefined) {
    sets.push('alt_text = ?')
    params.push(updates.alt_text)
  }
  if (updates.location_id !== undefined) {
    sets.push('location_id = ?')
    params.push(updates.location_id)
  }
  if (updates.category !== undefined) {
    sets.push('category = ?')
    params.push(updates.category)
  }
  if (sets.length === 1) return false

  params.push(id, siteId)
  const result = await execute(db, `UPDATE media_assets SET ${sets.join(', ')} WHERE id = ? AND site_id = ?`, params)
  return Number(result?.meta?.changes ?? 0) > 0
}

/**
 * Soft-delete in DB and hard-delete from Cloudflare storage.
 *
 * `delete_pending_at` is stamped before attempting the Cloudflare Images/R2
 * delete and only cleared once that delete actually succeeds, so a failed
 * external delete leaves the asset in a retryable state (status untouched)
 * instead of being marked 'deleted' while the underlying file is still live.
 */
export async function deleteMediaAsset(db: DbClient, env: MediaProviderEnv, id: string, siteId: string, deletedByUserId: string | null): Promise<void> {
  const now = new Date().toISOString()
  const pendingAsset = await queryFirst<{
    id: string
    provider: MediaAsset['provider']
    cloudflare_image_id: string | null
    r2_key: string | null
    organization_id: string
    location_id: string | null
    created_by_user_id: string | null
  }>(db, `
    UPDATE media_assets
    SET delete_pending_at = ?, updated_at = ?
    WHERE id = ? AND site_id = ? AND status != 'deleted'
    RETURNING id, provider, cloudflare_image_id, r2_key, organization_id, location_id, created_by_user_id
  `, [now, now, id, siteId]) ?? null

  if (!pendingAsset) return

  const withRetry = async (
    operation: () => Promise<void>,
    context: Record<string, string | null>
  ): Promise<void> => {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await operation()
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
        }
      }
    }

    console.error('media_asset_external_delete_failed', {
      ...context,
      error: (lastError ?? new Error('Unknown error')).message
    })

    throw lastError ?? new Error('media_asset_external_delete_failed')
  }

  // If either delete throws, delete_pending_at stays set for a retry job to pick back up.
  if (pendingAsset.provider === 'cloudflare_images' && pendingAsset.cloudflare_image_id) {
    const cloudflareImageId = pendingAsset.cloudflare_image_id
    await withRetry(() => deleteImage(env, cloudflareImageId), {
      assetId: pendingAsset.id,
      provider: pendingAsset.provider,
      cloudflareImageId,
    })
  } else if (pendingAsset.provider === 'cloudflare_r2' && pendingAsset.r2_key) {
    const r2Key = pendingAsset.r2_key
    await withRetry(() => deleteFromR2(env, r2Key), {
      assetId: pendingAsset.id,
      provider: pendingAsset.provider,
      r2Key,
    })
  }

  await execute(db, `
    UPDATE media_assets
    SET status = 'deleted', delete_pending_at = NULL, updated_at = ?
    WHERE id = ? AND site_id = ?
  `, [new Date().toISOString(), pendingAsset.id, siteId])

  await fireSiteEventSafe({
    db,
    organizationId: pendingAsset.organization_id,
    siteId,
    locationId: pendingAsset.location_id,
    actorId: deletedByUserId,
    eventType: 'media.deleted',
    entityType: 'media_asset',
    entityId: pendingAsset.id,
    metadata: {
      provider: pendingAsset.provider,
    },
  })
}
