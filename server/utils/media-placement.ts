import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertResourceAccess, type MemberAccessPrincipal } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  hydrateMediaAssetRefs,
  MAX_ORDERED_MEDIA_ASSETS,
  buildReplaceMediaPlacementQueries,
  isSingleMediaPlacement,
  isSupportedMediaPlacement,
  toResolvedMediaAsset,
  type MediaAssetRefInput,
  type ResolvedMediaAsset,
  type MediaAsset,
} from '~/server/utils/media-asset-manager'
import { EDITABLE_MEDIA_PLACEMENT_OWNERS, type EditableMediaPlacementOwnerType, type MediaPlacementOwnerType } from '~/shared/media-placement-contract'

export { EDITABLE_MEDIA_PLACEMENT_OWNERS } from '~/shared/media-placement-contract'

export interface MediaPlacementKey {
  owner_type: EditableMediaPlacementOwnerType
  owner_id: string
  slot: string
}

export type MediaPlacementItem = ResolvedMediaAsset & {
  placement_id: string
  slot: string
  sort_order: number
}

const OWNER_TABLES: Partial<Record<MediaPlacementOwnerType, string>> = {
  business_location: 'business_locations',
  post: 'posts',
  blog_post: 'blog_posts',
  experience: 'experiences',
  offering: 'offerings',
  review: 'reviews',
  review_request: 'review_requests',
  tenant_compliance: 'tenant_compliance',
}

export function parseMediaPlacementKey(value: unknown): MediaPlacementKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'placement must be an object' })
  }
  const record = value as Record<string, unknown>
  const ownerType = typeof record.owner_type === 'string' ? record.owner_type.trim() : ''
  const ownerId = typeof record.owner_id === 'string' ? record.owner_id.trim() : ''
  const slot = typeof record.slot === 'string' ? record.slot.trim() : ''
  if (!EDITABLE_MEDIA_PLACEMENT_OWNERS.includes(ownerType as typeof EDITABLE_MEDIA_PLACEMENT_OWNERS[number])) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'placement.owner_type is invalid' })
  }
  if (!ownerId) throw new HTTPError({ statusCode: 400, statusMessage: 'placement.owner_id is required' })
  if (!slot) throw new HTTPError({ statusCode: 400, statusMessage: 'placement.slot is required' })
  if (!isSupportedMediaPlacement({ owner_type: ownerType, slot })) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'placement owner_type and slot are not supported' })
  }
  return { owner_type: ownerType as EditableMediaPlacementOwnerType, owner_id: ownerId, slot }
}

export async function setMediaPlacement(db: DbClient, input: {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
  assetIds: string[]
}) {
  const locationId = await requirePlacementOwner(db, input)
  if (input.memberId && input.role) {
    if (!input.env) throw new Error('Authenticated media placement requires the Better Auth environment')
    await assertResourceAccess(db, {
      env: input.env,
      memberId: input.memberId,
      role: input.role,
      organizationId: input.organizationId,
      siteId: input.siteId,
      resourceLocationId: locationId,
    })
  }
  if (isSingleMediaPlacement(input.placement) && input.assetIds.length > 1) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'This media placement accepts at most one asset' })
  }
  if (input.assetIds.length > MAX_ORDERED_MEDIA_ASSETS) {
    throw new HTTPError({ statusCode: 400, statusMessage: `Media placements accept at most ${MAX_ORDERED_MEDIA_ASSETS} assets` })
  }
  const refs: MediaAssetRefInput[] = input.assetIds.map(asset_id => ({ asset_id }))
  const media = await hydrateMediaAssetRefs(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    refs,
    allowedKinds: input.placement.owner_type === 'tenant_compliance' ? ['file'] : ['image', 'video'],
    fieldName: 'asset_ids',
  })
  await executeBatch(db, buildReplaceMediaPlacementQueries({ ...input, media }))
  return {
    entity: input.placement.owner_type,
    id: input.placement.owner_id,
    placement: input.placement,
    asset_ids: media.map(asset => asset.asset_id),
    media,
    cleared: media.length === 0,
  }
}

export async function getMediaPlacements(db: DbClient, input: {
  siteId: string
  ownerType: MediaPlacementOwnerType
  ownerIds: string[]
  slot?: string
}): Promise<Map<string, MediaPlacementItem[]>> {
  const ownerIds = [...new Set(input.ownerIds)].filter(Boolean)
  const result = new Map(ownerIds.map(id => [id, [] as MediaPlacementItem[]]))
  if (!ownerIds.length) return result
  const rows = await queryAll<Record<string, unknown>>(db, `
    SELECT mp.id AS placement_id, mp.owner_id, mp.slot, mp.sort_order,
           mp.asset_id AS asset_id, ma.*
      FROM media_placements mp
      JOIN media_assets ma ON ma.id = mp.asset_id AND ma.organization_id = mp.organization_id AND ma.site_id = mp.site_id
     WHERE mp.site_id = ? AND mp.owner_type = ?
       AND mp.owner_id IN (${ownerIds.map(() => '?').join(',')})
       ${input.slot ? 'AND mp.slot = ?' : ''}
       AND mp.status = 'active' AND ma.status = 'active'
     ORDER BY mp.owner_id, mp.slot, mp.sort_order
  `, [input.siteId, input.ownerType, ...ownerIds, ...(input.slot ? [input.slot] : [])])
  for (const row of rows) {
    const resolved = toResolvedMediaAsset(row as unknown as MediaAsset)
    result.get(String(row.owner_id))?.push({
      ...resolved,
      asset_id: String(row.asset_id),
      placement_id: String(row.placement_id),
      slot: String(row.slot),
      sort_order: Number(row.sort_order),
    })
  }
  return result
}

async function requirePlacementOwner(db: DbClient, input: {
  organizationId: string
  siteId: string
  placement: MediaPlacementKey
}): Promise<string | null> {
  const { placement } = input
  if (placement.owner_type === 'site') {
    const row = await queryFirst(db, 'SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1', [placement.owner_id, input.organizationId])
    if (row && placement.owner_id === input.siteId) return null
  } else if (placement.owner_type === 'menu_item') {
    const row = await queryFirst<{ location_id: string | null }>(db, 'SELECT m.location_id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE mi.id = ? AND m.organization_id = ? AND m.site_id = ? LIMIT 1', [placement.owner_id, input.organizationId, input.siteId])
    if (row) return row.location_id
  } else if (placement.owner_type === 'content_block') {
    const row = await queryFirst(db, `SELECT cb.id FROM content_blocks cb JOIN content_documents d ON d.id = cb.document_id LEFT JOIN tenant_page_variants v ON d.owner_type = 'tenant_page' AND v.id = d.owner_id LEFT JOIN blog_posts bp ON d.owner_type = 'tenant_blog' AND bp.id = d.owner_id WHERE cb.id = ? AND COALESCE(v.site_id, bp.site_id) = ? LIMIT 1`, [placement.owner_id, input.siteId])
    if (row) return null
  } else {
    const table = OWNER_TABLES[placement.owner_type]
    if (table) {
      const hasLocation = ['business_location', 'post', 'experience', 'offering', 'review', 'review_request'].includes(placement.owner_type)
      const row = await queryFirst<{ location_id?: string | null }>(db, `SELECT id${hasLocation ? ', location_id' : ''} FROM ${table} WHERE id = ? AND site_id = ? LIMIT 1`, [placement.owner_id, input.siteId])
      if (row) return placement.owner_type === 'business_location' ? placement.owner_id : row.location_id ?? null
    }
  }
  throw new HTTPError({ statusCode: 404, statusMessage: 'Media placement owner not found' })
}
