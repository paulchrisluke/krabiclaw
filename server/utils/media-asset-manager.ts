import { HTTPError } from 'nitro';
import { deleteImage } from './cloudflare-images'
import { deleteFromR2 } from './cloudflare-r2'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { fireSiteEventSafe } from '~/server/utils/site-events'
import {
  isSupportedMediaPlacement,
  MAX_ORDERED_MEDIA_ASSETS,
} from '~/shared/media-placement-contract'

export { isSingleMediaPlacement, isSupportedMediaPlacement, MAX_ORDERED_MEDIA_ASSETS } from '~/shared/media-placement-contract'

type SqlBindValue = string | number | boolean | null
type MediaProviderEnv = Parameters<typeof deleteImage>[0]

interface MediaStorageReferenceState {
  r2ReferencedElsewhere: boolean
  cloudflareImageReferencedElsewhere: boolean
}

export interface MediaAsset {
  id: string
  organization_id: string
  site_id: string
  kind: 'image' | 'video' | 'file'
  provider: 'cloudflare_images' | 'cloudflare_r2'
  source: 'uploaded' | 'generated' | 'external'
  cloudflare_image_id: string | null
  r2_key: string | null
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
  placement_updated_at?: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ResolvedMediaAssetBase {
  asset_id: string
  public_url: string
  mime_type: string | null
  width: number | null
  height: number | null
  duration: number | null
  alt_text: string | null
  provider: string
  status: 'active'
}

export type ResolvedMediaAsset = ResolvedMediaAssetBase & (
  | { kind: 'image'; thumbnail_url: string | null }
  | { kind: 'video'; thumbnail_url: string }
  | { kind: 'file'; thumbnail_url: null }
)

export interface MediaAssetRefInput {
  asset_id: string
}

export function parseMediaAssetRefs(value: unknown): MediaAssetRefInput[] {
  if (!Array.isArray(value)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'media must be an array of { asset_id } items' })
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'media must be an array of { asset_id } items' })
    }
    const assetId = (item as Record<string, unknown>).asset_id
    if (typeof assetId !== 'string' || !assetId.trim()) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'media must be an array of { asset_id } items' })
    }
    return { asset_id: assetId.trim() }
  })
}

export type CreateInput = Pick<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source'> &
  Partial<Omit<MediaAsset, 'id' | 'organization_id' | 'site_id' | 'kind' | 'provider' | 'source' | 'created_at' | 'updated_at'>>

export interface MediaPlacementInsertInput {
  id?: string
  organizationId: string
  siteId: string
  ownerType: string
  ownerId: string
  slot: string
  assetId: string
  sortOrder: number
  status?: 'pending' | 'active' | 'rejected'
  createdAt?: string
  updatedAt?: string
}

export function buildMediaPlacementInsertQuery(input: MediaPlacementInsertInput): BatchQuery {
  if (!isSupportedMediaPlacement({ owner_type: input.ownerType, slot: input.slot })) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Media placement owner and slot are not supported' })
  }
  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    query: 'INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [input.id ?? crypto.randomUUID(), input.organizationId, input.siteId, input.ownerType, input.ownerId, input.slot, input.assetId, input.sortOrder, input.status ?? 'active', createdAt, input.updatedAt ?? createdAt],
  }
}

export function buildReplaceMediaPlacementQueries(input: {
  organizationId: string
  siteId: string
  placement: { owner_type: string; owner_id: string; slot: string }
  media: Array<{ asset_id: string }>
  now?: string
}): BatchQuery[] {
  if (!isSupportedMediaPlacement(input.placement)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Media placement owner and slot are not supported' })
  }
  const now = input.now ?? new Date().toISOString()
  return [
    {
      query: 'DELETE FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?',
      params: [input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot],
    },
    ...input.media.map((asset, sortOrder) => buildMediaPlacementInsertQuery({
      organizationId: input.organizationId,
      siteId: input.siteId,
      ownerType: input.placement.owner_type,
      ownerId: input.placement.owner_id,
      slot: input.placement.slot,
      assetId: asset.asset_id,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })),
  ]
}

// media_placements.owner_id is polymorphic with no owner foreign key, so every
// path that deletes an owning row (a post, a menu item, a review, ...) must
// explicitly clear its placements first or they orphan permanently. Route
// every such deletion through this builder instead of hand-writing the DELETE
// each time.
export function buildDeleteOwnerPlacementsQuery(input: {
  ownerType: string
  ownerId: string
  organizationId?: string
  siteId?: string
}): BatchQuery {
  const conditions = ['owner_type = ?']
  const params: string[] = [input.ownerType]
  if (input.organizationId) {
    conditions.push('organization_id = ?')
    params.push(input.organizationId)
  }
  if (input.siteId) {
    conditions.push('site_id = ?')
    params.push(input.siteId)
  }
  conditions.push('owner_id = ?')
  params.push(input.ownerId)
  return {
    query: `DELETE FROM media_placements WHERE ${conditions.join(' AND ')}`,
    params,
  }
}

export function toResolvedMediaAsset(row: MediaAsset): ResolvedMediaAsset {
  if (!row.public_url) {
    throw new HTTPError({ statusCode: 400, statusMessage: `Media asset ${row.id} does not have a public URL` })
  }
  if (row.status !== 'active') {
    throw new HTTPError({ statusCode: 400, statusMessage: `Media asset ${row.id} is not active` })
  }
  if (row.kind === 'video' && !row.thumbnail_url?.trim()) {
    throw new HTTPError({ statusCode: 500, statusMessage: `Active video asset ${row.id} does not have a thumbnail` })
  }

  const base = {
    asset_id: row.id,
    public_url: row.public_url,
    mime_type: row.mime_type,
    width: row.width,
    height: row.height,
    duration: row.duration,
    alt_text: row.alt_text,
    provider: row.provider,
    status: 'active' as const,
  }
  if (row.kind === 'video') {
    return { ...base, kind: 'video', thumbnail_url: row.thumbnail_url! }
  }
  if (row.kind === 'image') return { ...base, kind: 'image', thumbnail_url: row.thumbnail_url }
  return { ...base, kind: 'file', thumbnail_url: null }
}

export async function hydrateMediaAssetRefs(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    refs: MediaAssetRefInput[]
    allowedKinds?: Array<ResolvedMediaAsset['kind']>
    fieldName?: string
  },
): Promise<ResolvedMediaAsset[]> {
  const fieldName = input.fieldName ?? 'media'
  const ids = input.refs.map(ref => ref.asset_id?.trim()).filter(Boolean)
  if (input.refs.length > MAX_ORDERED_MEDIA_ASSETS) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} accepts at most ${MAX_ORDERED_MEDIA_ASSETS} assets` })
  }
  if (ids.length !== input.refs.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} items must contain asset_id` })
  }
  if (new Set(ids).size !== ids.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} cannot contain duplicate asset IDs` })
  }
  if (ids.length === 0) return []

  const rows = await queryAll<MediaAsset>(
    db,
    `SELECT * FROM media_assets
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
        AND id IN (${ids.map(() => '?').join(',')})`,
    [input.organizationId, input.siteId, ...ids],
  )
  const byId = new Map((rows ?? []).map(row => [row.id, row]))
  const missing = ids.find(id => !byId.has(id))
  if (missing) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} references an inactive or out-of-scope media asset: ${missing}` })
  }

  const allowedKinds = input.allowedKinds ? new Set(input.allowedKinds) : null
  const resolved = ids.map((id) => {
    const row = byId.get(id)
    if (!row) throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} references an inactive or out-of-scope media asset: ${id}` })
    const asset = toResolvedMediaAsset(row)
    if (allowedKinds && !allowedKinds.has(asset.kind)) {
      throw new HTTPError({ statusCode: 400, statusMessage: `${fieldName} asset ${id} must be ${Array.from(allowedKinds).join(' or ')}` })
    }
    return asset
  })

  return resolved
}

export function buildMediaAssetInsertQuery(data: CreateInput, now = new Date().toISOString()): BatchQuery {
  if (data.kind === 'video' && !data.thumbnail_url?.trim()) {
    throw new Error(`Video asset ${data.id} requires a thumbnail URL`)
  }
  return {
    query: `INSERT INTO media_assets (
      id, organization_id, site_id, kind, provider, source,
      cloudflare_image_id, r2_key,
      public_url, thumbnail_url, mime_type, file_name, file_size,
      width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      data.id, data.organization_id, data.site_id, data.kind, data.provider, data.source,
      data.cloudflare_image_id ?? null, data.r2_key ?? null,
      data.public_url ?? null, data.thumbnail_url ?? null,
      data.mime_type ?? null, data.file_name ?? null, data.file_size ?? null,
      data.width ?? null, data.height ?? null, data.duration ?? null,
      data.alt_text ?? null, data.category ?? null, data.status ?? 'active',
      data.created_by_user_id ?? null, now, now,
    ],
  }
}

export async function createMediaAsset(db: DbClient, data: CreateInput): Promise<void> {
  const query = buildMediaAssetInsertQuery(data)
  await execute(db, query.query, query.params)

  await fireSiteEventSafe({
    db,
    organizationId: data.organization_id,
    siteId: data.site_id,
    locationId: null,
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
  opts: { kind?: string; search?: string; ownerType?: string; ownerId?: string; slot?: string; limit?: number; offset?: number } = {}
): Promise<MediaAsset[]> {
  const conditions = [`ma.site_id = ?`, `ma.status = 'active'`]
  const params: SqlBindValue[] = [siteId]
  if (opts.kind) { conditions.push(`ma.kind = ?`); params.push(opts.kind) }
  if (opts.search) { conditions.push(`ma.file_name LIKE ? ESCAPE '\\'`); params.push(`%${opts.search.replace(/[\\%_]/g, '\\$&')}%`) }
  if (opts.ownerType && opts.ownerId) {
    conditions.push('mp.owner_type = ?', 'mp.owner_id = ?', `mp.status = 'active'`)
    params.push(opts.ownerType, opts.ownerId)
    if (opts.slot) { conditions.push('mp.slot = ?'); params.push(opts.slot) }
  }
  params.push(opts.limit ?? 50, opts.offset ?? 0)
  const results = await queryAll<MediaAsset>(
    db,
    `SELECT ma.id, ma.organization_id, ma.site_id, ma.kind, ma.provider, ma.source,
            ma.cloudflare_image_id, ma.r2_key,
            ma.public_url, ma.thumbnail_url, ma.mime_type, ma.file_name, ma.file_size,
            ma.width, ma.height, ma.duration, ma.alt_text, ma.category, ma.status, ma.created_by_user_id, ma.created_at, ma.updated_at
            ${opts.ownerType && opts.ownerId ? ', mp.updated_at AS placement_updated_at' : ''}
     FROM media_assets ma
     ${opts.ownerType && opts.ownerId ? 'JOIN media_placements mp ON mp.asset_id = ma.id AND mp.site_id = ma.site_id' : ''}
     WHERE ${conditions.join(' AND ')} ORDER BY ${opts.ownerType && opts.ownerId ? 'mp.sort_order' : 'ma.created_at DESC'} LIMIT ? OFFSET ?`
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
  updates: { alt_text?: string | null; category?: MediaAsset['category'] }
): Promise<boolean> {
  const sets: string[] = ['updated_at = ?']
  const params: SqlBindValue[] = [new Date().toISOString()]
  if (updates.alt_text !== undefined) {
    sets.push('alt_text = ?')
    params.push(updates.alt_text)
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

function parseReferenceFlag(value: unknown, label: string): boolean {
  if (value === 0 || value === false) return false
  if (value === 1 || value === true) return true
  throw new Error(`Invalid ${label} reference-check result`)
}

async function getMediaStorageReferenceState(
  db: DbClient,
  input: {
    assetId: string
    r2Key: string | null
    cloudflareImageId: string | null
  },
): Promise<MediaStorageReferenceState> {
  const row = await queryFirst<{
    r2_referenced_elsewhere: number | boolean
    cloudflare_image_referenced_elsewhere: number | boolean
  }>(db, `
    SELECT
      (? IS NOT NULL AND EXISTS (
        SELECT 1
          FROM media_assets AS other_r2
         WHERE other_r2.id != ?
           AND other_r2.status != 'deleted'
           AND other_r2.r2_key = ?
      )) AS r2_referenced_elsewhere,
      (? IS NOT NULL AND EXISTS (
        SELECT 1
          FROM media_assets AS other_image
         WHERE other_image.id != ?
           AND other_image.status != 'deleted'
           AND other_image.cloudflare_image_id = ?
      )) AS cloudflare_image_referenced_elsewhere
  `, [
    input.r2Key,
    input.assetId,
    input.r2Key,
    input.cloudflareImageId,
    input.assetId,
    input.cloudflareImageId,
  ])

  if (!row) throw new Error(`Media storage reference check returned no result for asset ${input.assetId}`)

  return {
    r2ReferencedElsewhere: parseReferenceFlag(row.r2_referenced_elsewhere, 'R2'),
    cloudflareImageReferencedElsewhere: parseReferenceFlag(row.cloudflare_image_referenced_elsewhere, 'Cloudflare Images'),
  }
}

/** Soft-delete in DB and delete each owned Cloudflare object once. */
export async function deleteMediaAsset(db: DbClient, env: MediaProviderEnv, id: string, siteId: string, deletedByUserId: string | null): Promise<void> {
  const pendingAsset = await queryFirst<{
    id: string
    provider: MediaAsset['provider']
    cloudflare_image_id: string | null
    r2_key: string | null
    organization_id: string
    created_by_user_id: string | null
  }>(db, `
    SELECT id, provider, cloudflare_image_id, r2_key, organization_id, created_by_user_id
    FROM media_assets
    WHERE id = ? AND site_id = ? AND status != 'deleted'
  `, [id, siteId]) ?? null

  if (!pendingAsset) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Media asset not found' })
  }

  const references = await getMediaStorageReferenceState(db, {
    assetId: pendingAsset.id,
    r2Key: pendingAsset.r2_key,
    cloudflareImageId: pendingAsset.cloudflare_image_id,
  })

  const deletions: Array<{ label: string; run: () => Promise<void> }> = []
  if (pendingAsset.provider === 'cloudflare_r2' && pendingAsset.r2_key && !references.r2ReferencedElsewhere) {
    const r2Key = pendingAsset.r2_key
    deletions.push({ label: `R2 object ${r2Key}`, run: () => deleteFromR2(env, r2Key) })
  }
  if (pendingAsset.cloudflare_image_id && !references.cloudflareImageReferencedElsewhere) {
    const imageId = pendingAsset.cloudflare_image_id
    deletions.push({ label: `Cloudflare image ${imageId}`, run: () => deleteImage(env, imageId) })
  }
  const deletionResults = await Promise.allSettled(deletions.map(deletion => deletion.run()))
  const failures = deletionResults.flatMap((result, index) => result.status === 'rejected'
    ? [`${deletions[index]!.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
    : [])
  if (failures.length > 0) {
    throw new Error(`Media deletion failed: ${failures.join('; ')}`)
  }

  const [result] = await executeBatch(db, [{
    query: `UPDATE media_assets SET status = 'deleted', updated_at = ? WHERE id = ? AND site_id = ? AND status != 'deleted'`,
    params: [new Date().toISOString(), pendingAsset.id, siteId],
  }, {
    query: 'DELETE FROM media_placements WHERE site_id = ? AND asset_id = ?',
    params: [siteId, pendingAsset.id],
  }])
  if (Number(result?.meta?.changes ?? 0) !== 1) {
    throw new Error(`Media asset ${pendingAsset.id} changed during deletion`)
  }

  await fireSiteEventSafe({
    db,
    organizationId: pendingAsset.organization_id,
    siteId,
    locationId: null,
    actorId: deletedByUserId,
    eventType: 'media.deleted',
    entityType: 'media_asset',
    entityId: pendingAsset.id,
    metadata: {
      provider: pendingAsset.provider,
    },
  })
}
