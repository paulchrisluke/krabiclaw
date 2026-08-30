import { HTTPError } from 'nitro'
import { executeBatch, execute, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { assertResourceAccess, type MemberAccessPrincipal } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  hydrateMediaAssetRefs,
  MAX_ORDERED_MEDIA_ASSETS,
  buildSingleMediaPlacementQueries,
  isSingleMediaPlacement,
  readMediaPlacements,
  type MediaAssetRefInput,
  type StoredMediaPlacementItem,
} from '~/server/utils/media-asset-manager'
import { isEditableMediaPlacement, isEditableMediaPlacementOwnerType, type EditableMediaPlacementOwnerType, type MediaPlacementOwnerType } from '~/shared/media-placement-contract'
import { regenerateSiteSocialCards, refreshSocialCard, socialCardRefreshOwnerForPlacement } from '~/server/utils/social-card'

export { EDITABLE_MEDIA_PLACEMENT_OWNERS } from '~/shared/media-placement-contract'
export type MediaPlacementItem = StoredMediaPlacementItem

export interface MediaPlacementKey {
  owner_type: EditableMediaPlacementOwnerType
  owner_id: string
  slot: string
}

interface PlacementAuthInput {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
}

const OWNER_TABLES: Partial<Record<MediaPlacementOwnerType, string>> = {
  business_location: 'business_locations',
  product: 'products',
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
  if (!isEditableMediaPlacementOwnerType(ownerType)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'placement.owner_type is invalid' })
  }
  if (!ownerId) throw new HTTPError({ statusCode: 400, statusMessage: 'placement.owner_id is required' })
  if (!slot) throw new HTTPError({ statusCode: 400, statusMessage: 'placement.slot is required' })
  if (!isEditableMediaPlacement({ owner_type: ownerType, slot })) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'placement owner_type and slot are not supported' })
  }
  return { owner_type: ownerType, owner_id: ownerId, slot }
}

export function parseMediaPlacementMoves(value: unknown): MediaPlacementMove[] {
  if (!Array.isArray(value)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'moves must be an array' })
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'each move must be an object' })
    }
    const record = item as Record<string, unknown>
    if (typeof record.asset_id !== 'string' || !record.asset_id.trim()) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'each move requires asset_id' })
    }
    const move: MediaPlacementMove = { asset_id: record.asset_id }
    if (record.before_asset_id !== undefined) {
      if (typeof record.before_asset_id !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: 'before_asset_id must be a string' })
      move.before_asset_id = record.before_asset_id
    }
    if (record.after_asset_id !== undefined) {
      if (typeof record.after_asset_id !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: 'after_asset_id must be a string' })
      move.after_asset_id = record.after_asset_id
    }
    return move
  })
}

function isUniqueConstraintError(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
}

function allowedKindsFor(placement: MediaPlacementKey): Array<'image' | 'video' | 'file'> {
  return placement.owner_type === 'tenant_compliance' ? ['file'] : ['image', 'video']
}

async function authorizePlacementWrite(db: DbClient, input: PlacementAuthInput): Promise<void> {
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
}

// The canonical, server-authoritative state of one owner+slot's media after
// a mutation. Every attach/remove/reorder response returns this so callers
// replace their local list wholesale rather than trying to reconcile it
// against whatever they sent — the response, not the request, is the truth.
async function canonicalPlacementState(db: DbClient, input: {
  siteId: string
  placement: MediaPlacementKey
}) {
  const items = (await getMediaPlacements(db, {
    siteId: input.siteId,
    ownerType: input.placement.owner_type,
    ownerIds: [input.placement.owner_id],
    slot: input.placement.slot,
  })).get(input.placement.owner_id) ?? []
  return {
    entity: input.placement.owner_type,
    id: input.placement.owner_id,
    placement: input.placement,
    asset_ids: items.map(item => item.asset_id),
    media: items,
    cleared: items.length === 0,
  }
}

// Single-value slots (logo, cover, hero, featured, thumbnail, ...): cardinality
// is always <= 1, so a plain replace is the correct, safe semantic — there is
// no ordering and nothing to resurrect. Throws for an ordered collection; use
// attachMediaPlacement/removeMediaPlacement/reorderMediaPlacements for those.
export async function setSingleMediaPlacement(db: DbClient, input: {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
  assetId: string | null
}) {
  await authorizePlacementWrite(db, input)
  const refs: MediaAssetRefInput[] = input.assetId ? [{ asset_id: input.assetId }] : []
  const media = await hydrateMediaAssetRefs(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    refs,
    allowedKinds: allowedKindsFor(input.placement),
    fieldName: 'asset_id',
  })
  await executeBatch(db, buildSingleMediaPlacementQueries({ ...input, media }))
  await refreshSocialCardForPlacement(db, input)
  return canonicalPlacementState(db, input)
}

export async function getMediaPlacements(db: DbClient, input: {
  siteId: string
  ownerType: MediaPlacementOwnerType
  ownerIds: string[]
  slot?: string
}): Promise<Map<string, MediaPlacementItem[]>> {
  return await readMediaPlacements(db, input)
}

async function refreshSocialCardForPlacement(db: DbClient, input: {
  env?: CloudflareEnv
  siteId: string
  placement: MediaPlacementKey
}) {
  const owner = socialCardRefreshOwnerForPlacement(input.placement)
  if (!input.env || !owner) return
  if (owner.owner_type === 'site') {
    await regenerateSiteSocialCards({ db, env: input.env, siteId: input.siteId })
    return
  }
  await refreshSocialCard({ db, env: input.env, owner })
}

// Attaches one asset to an ordered collection. Appends at the end (its
// position within the current live count, computed atomically inside the
// INSERT itself — not from any earlier read) unless the collection is
// already at MAX_ORDERED_MEDIA_ASSETS, in which case the INSERT's WHERE
// clause makes it a no-op and this throws. A duplicate attach attempt hits
// the DB's own unique(owner_type, owner_id, slot, asset_id) constraint and
// is reported as a 409, not silently ignored — callers that want idempotent
// "make sure this is attached" behavior should treat 409 as success.
export async function attachMediaPlacement(db: DbClient, input: {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
  assetId: string
}) {
  if (isSingleMediaPlacement(input.placement)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'This placement is single-valued; use setSingleMediaPlacement instead' })
  }
  await authorizePlacementWrite(db, input)
  const [asset] = await hydrateMediaAssetRefs(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    refs: [{ asset_id: input.assetId }],
    allowedKinds: allowedKindsFor(input.placement),
    fieldName: 'asset_id',
  })
  if (!asset) throw new HTTPError({ statusCode: 400, statusMessage: 'asset_id is required' })
  const now = new Date().toISOString()
  const scopeParams = [input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot]
  let results
  try {
    results = await executeBatch(db, [{
      query: `INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT MAX(sort_order) + 1 FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?), 0),
          'active', ?, ?
        WHERE (SELECT COUNT(*) FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?) < ?`,
      params: [
        crypto.randomUUID(), ...scopeParams, asset.asset_id,
        ...scopeParams,
        now, now,
        ...scopeParams,
        MAX_ORDERED_MEDIA_ASSETS,
      ],
    }])
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Media asset is already attached to this placement' })
    }
    throw error
  }
  if (Number(results[0]?.meta?.changes ?? 0) === 0) {
    throw new HTTPError({ statusCode: 422, statusMessage: `Media placements accept at most ${MAX_ORDERED_MEDIA_ASSETS} assets` })
  }
  await refreshSocialCardForPlacement(db, input)
  return canonicalPlacementState(db, input)
}

// Detaches one asset from an ordered collection. Idempotent: removing an
// asset that's already gone (or was never attached) affects zero rows and
// is not an error — it never mutates anything else in the collection, so
// unmentioned assets keep their exact position.
export async function removeMediaPlacement(db: DbClient, input: {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
  assetId: string
}) {
  await authorizePlacementWrite(db, input)
  await execute(db, `
    DELETE FROM media_placements
     WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ? AND asset_id = ?
  `, [input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot, input.assetId])
  await refreshSocialCardForPlacement(db, input)
  return canonicalPlacementState(db, input)
}

export interface MediaPlacementMove {
  asset_id: string
  before_asset_id?: string
  after_asset_id?: string
}

// Rewrites positions within an ordered collection without ever changing
// membership. Moves are anchored (before/after another asset already in the
// collection) rather than numeric, since a numeric index is only meaningful
// against a snapshot the caller may no longer hold; moves apply sequentially
// in the order given, each against the result of the previous one.
//
// Membership can never change here: every referenced asset (moved or anchor)
// must already be in the collection or the whole call is rejected before any
// write happens. The write itself is guarded atomically against the exact
// live membership read moments earlier — if anything attached or detached in
// between, the guard row's deliberately invalid lifecycle status fails the retained
// media_placements_status_check,
// the whole batch (including every position update) rolls back, and the
// caller gets a 409 to re-read and retry. This is stricter than checking just
// the moved assets: it also catches an unrelated concurrent attach/remove
// that this reorder's plan never accounted for.
//
// Positions are dense integers with a unique(owner, sort_order) constraint,
// so a straight per-row UPDATE to final positions can collide mid-batch
// (e.g. swapping two rows). Every affected row is first moved to a negative,
// collision-free temporary position, then to its final dense position — two
// full passes, not a partial per-row update.
export async function reorderMediaPlacements(db: DbClient, input: {
  organizationId: string
  siteId: string
  env?: CloudflareEnv
  memberId?: string
  role?: MemberAccessPrincipal['role']
  placement: MediaPlacementKey
  moves: MediaPlacementMove[]
}) {
  if (isSingleMediaPlacement(input.placement)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'This placement is single-valued and has no order' })
  }
  await authorizePlacementWrite(db, input)
  if (input.moves.length === 0) return canonicalPlacementState(db, input)

  const scopeParams = [input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot]
  const currentRows = await queryAll<{ asset_id: string }>(db, `
    SELECT asset_id FROM media_placements
     WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?
     ORDER BY sort_order ASC
  `, scopeParams)
  const currentOrder = currentRows.map(row => row.asset_id)
  const currentSet = new Set(currentOrder)

  for (const move of input.moves) {
    if (!currentSet.has(move.asset_id)) {
      throw new HTTPError({ statusCode: 409, statusMessage: `Media asset is no longer attached to this placement: ${move.asset_id}` })
    }
    if (move.before_asset_id && move.after_asset_id) {
      throw new HTTPError({ statusCode: 400, statusMessage: 'A move may specify before_asset_id or after_asset_id, not both' })
    }
    const anchor = move.before_asset_id ?? move.after_asset_id
    if (anchor && !currentSet.has(anchor)) {
      throw new HTTPError({ statusCode: 409, statusMessage: `Media asset is no longer attached to this placement: ${anchor}` })
    }
  }

  let order = [...currentOrder]
  for (const move of input.moves) {
    order = order.filter(assetId => assetId !== move.asset_id)
    if (move.before_asset_id) {
      const anchorIndex = order.indexOf(move.before_asset_id)
      order.splice(anchorIndex, 0, move.asset_id)
    } else if (move.after_asset_id) {
      const anchorIndex = order.indexOf(move.after_asset_id)
      order.splice(anchorIndex + 1, 0, move.asset_id)
    } else {
      order.push(move.asset_id)
    }
  }

  const queries: BatchQuery[] = [buildMembershipGuardQuery({
    organizationId: input.organizationId,
    siteId: input.siteId,
    placement: input.placement,
    expectedAssetIds: currentOrder,
  })]
  order.forEach((assetId, index) => {
    queries.push({
      query: `UPDATE media_placements SET sort_order = ? WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ? AND asset_id = ?`,
      params: [-(index + 1), ...scopeParams, assetId],
    })
  })
  order.forEach((assetId, index) => {
    queries.push({
      query: `UPDATE media_placements SET sort_order = ?, updated_at = ? WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ? AND asset_id = ?`,
      params: [index, new Date().toISOString(), ...scopeParams, assetId],
    })
  })

  try {
    await executeBatch(db, queries)
  } catch (error) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'This collection changed while reordering. Reload and try again.', cause: error })
  }
  await refreshSocialCardForPlacement(db, input)
  return canonicalPlacementState(db, input)
}

function buildMembershipGuardQuery(input: {
  organizationId: string
  siteId: string
  placement: MediaPlacementKey
  expectedAssetIds: string[]
}): BatchQuery {
  const scopeParams = [input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot]
  const expectedAssetIds = d1JsonStringSet(input.expectedAssetIds)
  const values = `SELECT value AS asset_id FROM json_each(?)`
  const now = new Date().toISOString()
  return {
    query: `INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, '__reorder_guard__', 0, '__reorder_guard__', ?, ?
       WHERE EXISTS (
         SELECT asset_id FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?
         EXCEPT
         ${values}
       )
       OR EXISTS (
         ${values}
         EXCEPT
         SELECT asset_id FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = ? AND owner_id = ? AND slot = ?
       )`,
    params: [
      crypto.randomUUID(), input.organizationId, input.siteId, input.placement.owner_type, input.placement.owner_id, input.placement.slot, now, now,
      ...scopeParams, expectedAssetIds,
      expectedAssetIds, ...scopeParams,
    ],
  }
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
  } else if (placement.owner_type === 'product') {
    const row = await queryFirst<{ location_id: string }>(db, 'SELECT location_id FROM products WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1', [placement.owner_id, input.organizationId, input.siteId])
    if (row) return row.location_id
  } else if (placement.owner_type === 'content_block') {
    const row = await queryFirst(db, `SELECT cb.id FROM content_blocks cb JOIN content_documents d ON d.id = cb.document_id LEFT JOIN tenant_page_variants v ON d.owner_type = 'tenant_page' AND v.id = d.owner_id LEFT JOIN blog_posts bp ON d.owner_type = 'tenant_blog' AND bp.id = d.owner_id WHERE cb.id = ? AND COALESCE(v.site_id, bp.site_id) = ? LIMIT 1`, [placement.owner_id, input.siteId])
    if (row) return null
  } else {
    const table = OWNER_TABLES[placement.owner_type]
    if (table) {
      const hasLocation = ['post', 'experience', 'offering', 'review', 'review_request'].includes(placement.owner_type)
      const row = await queryFirst<{ location_id?: string | null }>(db, `SELECT id${hasLocation ? ', location_id' : ''} FROM ${table} WHERE id = ? AND site_id = ? LIMIT 1`, [placement.owner_id, input.siteId])
      if (row) return placement.owner_type === 'business_location' ? placement.owner_id : row.location_id ?? null
    }
  }
  throw new HTTPError({ statusCode: 404, statusMessage: 'Media placement owner not found' })
}
