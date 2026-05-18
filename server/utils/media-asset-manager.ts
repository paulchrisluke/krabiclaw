import { deleteImage } from './cloudflare-images'
import { deleteFromR2 } from './cloudflare-r2'

type SqlBindValue = string | number | boolean | null
type MediaProviderEnv = Parameters<typeof deleteImage>[0]

export interface MediaAsset {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  kind: 'image' | 'video' | 'file'
  provider: 'cloudflare_images' | 'cloudflare_r2' | 'google_business' | 'external_url' | 'chowbot' | 'cloudflare_stream'
  source: 'uploaded' | 'google_sync' | 'generated' | 'external'
  cloudflare_image_id: string | null
  r2_key: string | null
  google_media_name: string | null
  stream_uid: string | null
  public_url: string | null
  thumbnail_url: string | null
  mime_type: string | null
  file_name: string | null
  file_size: number | null
  width: number | null
  height: number | null
  duration: number | null
  alt_text: string | null
  category: 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | null
  status: 'pending' | 'active' | 'deleted' | 'failed'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

type CreateInput = Pick<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source'> &
  Partial<Omit<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source' | 'created_at' | 'updated_at'>>

export async function createMediaAsset(db: D1Database, data: CreateInput): Promise<void> {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO media_assets (
      id, organization_id, site_id, location_id, kind, provider, source,
      cloudflare_image_id, r2_key, google_media_name, stream_uid,
      public_url, thumbnail_url, mime_type, file_name, file_size,
      width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.id, data.organization_id, data.site_id, data.location_id ?? null,
    data.kind, data.provider, data.source,
    data.cloudflare_image_id ?? null, data.r2_key ?? null, data.google_media_name ?? null,
    (data as MediaAsset & { stream_uid?: string | null }).stream_uid ?? null,
    data.public_url ?? null, data.thumbnail_url ?? null,
    data.mime_type ?? null, data.file_name ?? null, data.file_size ?? null,
    data.width ?? null, data.height ?? null, data.duration ?? null,
    data.alt_text ?? null, data.category ?? null, data.status ?? 'active',
    data.created_by_user_id ?? null, now, now
  ).run()
}

export async function getMediaAsset(db: D1Database, id: string, siteId: string): Promise<MediaAsset | null> {
  const row = await db.prepare(
    `SELECT * FROM media_assets WHERE id = ? AND site_id = ? LIMIT 1`
  ).bind(id, siteId).first() as MediaAsset | null
  return row
}

export async function listMediaAssets(
  db: D1Database,
  siteId: string,
  opts: { kind?: string; locationId?: string; limit?: number; offset?: number } = {}
): Promise<MediaAsset[]> {
  const conditions = [`site_id = ?`, `status = 'active'`]
  const params: SqlBindValue[] = [siteId]
  if (opts.kind) { conditions.push(`kind = ?`); params.push(opts.kind) }
  if (opts.locationId) { conditions.push(`location_id = ?`); params.push(opts.locationId) }
  params.push(opts.limit ?? 50, opts.offset ?? 0)
  const { results } = await db.prepare(
    `SELECT id, organization_id, site_id, location_id, kind, provider, source,
            cloudflare_image_id, r2_key, google_media_name,
            public_url, thumbnail_url, mime_type, file_name, file_size,
            width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
     FROM media_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params).all()
  return (results ?? []) as unknown as MediaAsset[]
}

export async function activateMediaAsset(
  db: D1Database,
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
  const result = await db.prepare(`UPDATE media_assets SET ${sets.join(', ')} WHERE id = ? AND site_id = ? AND status = 'pending'`).bind(...params).run()
  return Number(result?.meta?.changes ?? 0) > 0
}

export async function updateMediaAssetAlt(db: D1Database, id: string, siteId: string, altText: string): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE media_assets SET alt_text = ?, updated_at = ? WHERE id = ? AND site_id = ?`
  ).bind(altText, new Date().toISOString(), id, siteId).run()
  return Number(result?.meta?.changes ?? 0) > 0
}

export async function updateMediaAssetMetadata(
  db: D1Database,
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
  const result = await db.prepare(
    `UPDATE media_assets SET ${sets.join(', ')} WHERE id = ? AND site_id = ?`
  ).bind(...params).run()
  return Number(result?.meta?.changes ?? 0) > 0
}

/** Soft-delete in DB and hard-delete from Cloudflare storage. */
export async function deleteMediaAsset(db: D1Database, env: MediaProviderEnv, id: string, siteId: string): Promise<void> {
  const now = new Date().toISOString()
  const deletedAsset = await db.prepare(`
    UPDATE media_assets
    SET status = 'deleted', updated_at = ?
    WHERE id = ? AND site_id = ? AND status != 'deleted'
    RETURNING id, provider, cloudflare_image_id, r2_key
  `).bind(now, id, siteId).first() as {
    id: string
    provider: MediaAsset['provider']
    cloudflare_image_id: string | null
    r2_key: string | null
  } | null

  if (!deletedAsset) return

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

  if (deletedAsset.provider === 'cloudflare_images' && deletedAsset.cloudflare_image_id) {
    const cloudflareImageId = deletedAsset.cloudflare_image_id
    await withRetry(() => deleteImage(env, cloudflareImageId), {
      assetId: deletedAsset.id,
      provider: deletedAsset.provider,
      cloudflareImageId,
    })
  } else if (deletedAsset.provider === 'cloudflare_r2' && deletedAsset.r2_key) {
    const r2Key = deletedAsset.r2_key
    await withRetry(() => deleteFromR2(env, r2Key), {
      assetId: deletedAsset.id,
      provider: deletedAsset.provider,
      r2Key,
    })
  }
}
