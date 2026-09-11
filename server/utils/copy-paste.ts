import { executeBatch, queryAll, queryFirst, rawClient, type BatchQuery, type DbClient } from '~/server/db'
import { createLocation, deleteLocation, updateLocation, type CreateLocationInput } from '~/server/utils/location-management'
import type { CloudflareEnv } from '~/server/utils/auth'
import { buildMediaPlacementInsertQuery } from '~/server/utils/media-asset-manager'
import { refreshSocialCard, type SocialCardOwner } from '~/server/utils/social-card'

type SetupEnv = CloudflareEnv

export type CopyEntityType = 
  | 'products'
  | 'media_assets' 
  | 'reviews' 
  | 'location_qa' 

export interface CopyEntityConfig {
  type: CopyEntityType
  
}

export interface CopyBatchInput {
  source_location_id: string
  target_location_id?: string
  new_location?: CreateLocationInput
  entities: CopyEntityConfig[]
  field_overrides?: Partial<CreateLocationInput>
}

export interface CopyManifest {
  target_location_id: string
  target_location_slug: string
  entities: Record<CopyEntityType, { copied: number; new_ids: string[] }>
  id_mappings: Record<string, string> // old_id -> new_id
}

export interface CopyBatchResult {
  success: boolean
  manifest?: CopyManifest
  error?: string
}

/**
 * Core copy/paste utility for location-to-location data duplication.
 * Handles foreign key remapping and optional translation copying.
 */
export async function copyLocationBatch(
  env: SetupEnv,
  db: DbClient,
  organizationId: string,
  siteId: string,
  userId: string,
  input: CopyBatchInput,
): Promise<CopyBatchResult> {
  const { source_location_id, target_location_id, new_location, entities, field_overrides } = input

  // Validate source location exists
  const sourceLocation = await queryFirst<{ id: string; slug: string }>(
    db,
    'SELECT id, slug FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?',
    [source_location_id, organizationId, siteId],
  )

  if (!sourceLocation) {
    return { success: false, error: 'Source location not found' }
  }

  if (target_location_id && new_location) {
    return { success: false, error: 'Provide only one of target_location_id or new_location, not both' }
  }

  // field_overrides apply to the target location outside the entity-copy batch below,
  // so they're not atomic with it — for a new_location, cleanupOnFailure deletes the
  // whole location on failure, but an existing target_location_id has no rollback path
  // and would be left partially mutated. Block the combination rather than risk that.
  if (target_location_id && field_overrides && Object.keys(field_overrides).length > 0) {
    return { success: false, error: 'field_overrides can only be used with new_location, not an existing target_location_id' }
  }

  // Validated before any location is created so a bad entities list can't strand
  // an orphaned location.
  const requestedTypes = new Set(entities.map((config) => config.type))
  if (requestedTypes.has('reviews') && !requestedTypes.has('products')) {
    const productReview = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM reviews
       WHERE location_id = ? AND organization_id = ? AND site_id = ? AND product_id IS NOT NULL
       LIMIT 1`,
      [source_location_id, organizationId, siteId],
    )
    if (productReview) {
      return { success: false, error: 'Copying Product reviews requires also copying products so every review keeps its Product owner' }
    }
  }
  let targetLocationId: string
  let targetLocationSlug: string
  let createdNewLocation = false

  // Determine target location (create new or use existing)
  if (target_location_id) {
    const targetLocation = await queryFirst<{ id: string; slug: string }>(
      db,
      'SELECT id, slug FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?',
      [target_location_id, organizationId, siteId],
    )

    if (!targetLocation) {
      return { success: false, error: 'Target location not found' }
    }

    targetLocationId = targetLocation.id
    targetLocationSlug = targetLocation.slug
  } else if (new_location) {
    const createResult = await createLocation(
      env,
      rawClient(db),
      organizationId,
      siteId,
      new_location,
      userId,
      { refreshSocialCardAfterCreate: false },
    )
    
    if (createResult.status !== 201) {
      return { 
        success: false, 
        error: (createResult.data as { error?: string }).error ?? 'Failed to create new location' 
      }
    }

    const createdLocation = (createResult.data as { location?: { id: string; slug: string } }).location
    if (!createdLocation) {
      return { success: false, error: 'Failed to create new location' }
    }

    targetLocationId = createdLocation.id
    targetLocationSlug = createdLocation.slug
    createdNewLocation = true
  } else {
    return { success: false, error: 'Either target_location_id or new_location must be provided' }
  }

  // D1 batches are atomic per-call, but createLocation above already committed in its
  // own batch — there's no single transaction spanning it and the entity-copy batch
  // below. If anything past this point fails, delete the location we just created
  // rather than leaving an empty, half-configured location behind.
  const cleanupOnFailure = async <T extends { success: false; error: string }>(result: T): Promise<T> => {
    if (createdNewLocation) {
      try {
        const cleanupResult = await deleteLocation(env, rawClient(db), organizationId, siteId, targetLocationId)
        if (cleanupResult.status !== 200) {
          throw new Error((cleanupResult.data as { error?: string }).error ?? 'Failed to remove the new location')
        }
      } catch (cleanupError) {
        throw new AggregateError(
          [new Error(result.error), cleanupError],
          'Location copy failed and the new location could not be removed', { cause: cleanupError },
        )
      }
    }
    return result
  }

  // Build ID mapping table for foreign key remapping
  const idMappings: Record<string, string> = {}
  const manifest: CopyManifest = {
    target_location_id: targetLocationId,
    target_location_slug: targetLocationSlug,
    entities: {
      products: { copied: 0, new_ids: [] },
      media_assets: { copied: 0, new_ids: [] },
      reviews: { copied: 0, new_ids: [] },
      location_qa: { copied: 0, new_ids: [] },
    },
    id_mappings: idMappings,
  }

  const now = new Date().toISOString()
  const statements: BatchQuery[] = []

  // Apply field overrides to target location via the standard update path, which
  // handles slug uniqueness, media asset validation, and field normalization.
  if (field_overrides && Object.keys(field_overrides).length > 0) {
    const updateResult = await updateLocation(rawClient(db), organizationId, siteId, targetLocationId, field_overrides, userId)
    if (updateResult.status >= 400) {
      return await cleanupOnFailure({ success: false, error: (updateResult.data as { error?: string }).error ?? 'Failed to apply field overrides' })
    }
  }

  // Process entities in dependency order so copied owners exist before their placements.
  const entityOrder: CopyEntityType[] = ['media_assets', 'products', 'reviews', 'location_qa']
  const requestedConfigs = new Map(entities.map((config) => [config.type, config]))

  try {
    await copyLocationPolicies(db, source_location_id, targetLocationId, organizationId, siteId, userId, now, statements)
    for (const type of entityOrder) {
      const entityConfig = requestedConfigs.get(type)
      if (!entityConfig) continue

      switch (entityConfig.type) {
        case 'products':
          await offerProductsAtTarget(db, source_location_id, targetLocationId, organizationId, siteId, userId, now, statements, manifest)
          break
        case 'media_assets':
          await copyMediaAssets(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest)
          break
        case 'reviews':
          await copyReviews(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, idMappings)
          break
        case 'location_qa':
          await copyLocationQa(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest)
          break
      }
    }
  } catch (error) {
    return await cleanupOnFailure({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build copy batch',
    })
  }

  // Execute all copy operations as a single batch
  if (statements.length > 0) {
    try {
      await executeBatch(db, statements)
    } catch (error) {
      return await cleanupOnFailure({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute copy batch',
      })
    }
  }

  try {
    const refreshOwners: SocialCardOwner[] = [{ owner_type: 'business_location', owner_id: targetLocationId }]
    const offeredProductIds = manifest.entities.products.new_ids
    if (offeredProductIds.length) {
      const publicProducts = await queryAll<{ id: string }>(db, `
        SELECT p.id FROM products p
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
        WHERE pub.site_id = ? AND pub.published = 1 AND p.active = 1
          AND p.id IN (SELECT value FROM json_each(?))
      `, [siteId, JSON.stringify(offeredProductIds)])
      refreshOwners.push(...publicProducts.map(row => ({ owner_type: 'product' as const, owner_id: row.id })))
    }
    const copiedReviewIds = manifest.entities.reviews.new_ids
    if (copiedReviewIds.length) {
      const publicReviews = await queryAll<{ id: string }>(db, `
        SELECT id FROM reviews
         WHERE site_id = ? AND status = 'approved' AND id IN (SELECT value FROM json_each(?))
      `, [siteId, JSON.stringify(copiedReviewIds)])
      refreshOwners.push(...publicReviews.map(row => ({ owner_type: 'review' as const, owner_id: row.id })))
    }
    for (const owner of refreshOwners) {
      await refreshSocialCard({ db, env, owner, actorId: userId })
    }
  } catch (error) {
    console.error('[social-card]', {
      stage: 'copy_refresh',
      siteId,
      targetLocationId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { success: true, manifest }
}

/**
 * Offer the source location's products at the target location too.
 *
 * This inserts product_locations rows. It does NOT duplicate products, which
 * is what it used to do: the catalog is organization-owned, so "also sell this
 * at the new branch" is an association, and copying it produced a second
 * product identity whose name, price and photo then drifted from the first.
 *
 * Duplicating a product as a genuinely new one is a different operation with
 * a different meaning, and lives in product-management as createProduct.
 */
async function offerProductsAtTarget(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  userId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
) {
  const offered = await queryAll<{ product_id: string; active: number; published: number }>(db, `
    SELECT pl.product_id, pl.active, pl.published
      FROM product_locations pl
     WHERE pl.organization_id = ? AND pl.location_id = ?
     ORDER BY pl.product_id
  `, [organizationId, sourceLocationId])

  for (const row of offered) {
    statements.push({
      query: `INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (product_id, location_id) DO UPDATE SET active = excluded.active, published = excluded.published,
                updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      params: [organizationId, row.product_id, targetLocationId, row.active, row.published, now, now, userId, userId],
    })
    // The same product, now sold in two places. Its id is unchanged, which is
    // the whole point: there is one thing to edit.
    manifest.id_mappings[row.product_id] = row.product_id
    manifest.entities.products.new_ids.push(row.product_id)
    manifest.entities.products.copied++
  }

  // Location-scoped prices follow, because a price scoped to the source
  // location says nothing about the target. A location-neutral price already
  // applies everywhere and is deliberately left alone.
  const scopedPrices = await queryAll<{ id: string }>(db, `
    SELECT pr.id FROM prices pr
     WHERE pr.organization_id = ? AND pr.location_id = ? AND pr.active = 1
     ORDER BY pr.id
  `, [organizationId, sourceLocationId])
  for (const price of scopedPrices) {
    statements.push({
      query: `INSERT INTO prices (id, organization_id, product_variant_id, location_id, active, currency, unit_amount, type,
                recurring_interval, recurring_interval_count, tax_behavior, compare_at_unit_amount, valid_from_at, valid_until_at,
                source, created_at, updated_at, created_by, updated_by)
              SELECT ?, organization_id, product_variant_id, ?, active, currency, unit_amount, type,
                recurring_interval, recurring_interval_count, tax_behavior, compare_at_unit_amount, valid_from_at, valid_until_at,
                'copy', ?, ?, ?, ? FROM prices WHERE id = ?`,
      params: [crypto.randomUUID(), targetLocationId, now, now, userId, userId, price.id],
    })
  }
}

async function copyMediaAssets(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
) {
  const assets = await queryAll<{ asset_id: string; sort_order: number }>(
    db,
    `SELECT mp.asset_id, mp.sort_order
       FROM media_placements mp
       JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
      WHERE mp.owner_type = 'business_location' AND mp.owner_id = ? AND mp.slot = 'gallery'
        AND mp.organization_id = ? AND mp.site_id = ? AND mp.status = 'active'
      ORDER BY mp.sort_order`,
    [sourceLocationId, organizationId, siteId],
  )

  for (const asset of assets) {
    statements.push(buildMediaPlacementInsertQuery({
      organizationId, siteId, ownerType: 'business_location', ownerId: targetLocationId, slot: 'gallery',
      assetId: asset.asset_id, sortOrder: asset.sort_order, createdAt: now, updatedAt: now,
    }))

    manifest.entities.media_assets.copied++
  }
}

/**
 * Give the target location the source location's reservation policy, if it
 * has none of its own.
 *
 * A typed row, copied once. There is no experience policy to copy: a product's
 * booking terms are its own metafields and belong to the product, not to a
 * location, so they are already correct wherever it is offered.
 */
async function copyLocationPolicies(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  userId: string,
  now: string,
  statements: BatchQuery[],
) {
  const source = await queryFirst<{ location_id: string }>(db, `
    SELECT location_id FROM location_reservation_configs WHERE organization_id = ? AND location_id = ?
  `, [organizationId, sourceLocationId])
  if (!source) return
  statements.push({
    query: `INSERT INTO location_reservation_configs (
              location_id, organization_id, slot_capacity, advance_notice_minutes, minimum_guest_age,
              deposit_required, deposit_trigger_party_size, free_cancellation_until_minutes,
              reschedule_allowed, reschedule_cutoff_minutes, accessibility_contact_required,
              additional_notes_html, created_at, updated_at, created_by, updated_by
            )
            SELECT ?, organization_id, slot_capacity, advance_notice_minutes, minimum_guest_age,
              deposit_required, deposit_trigger_party_size, free_cancellation_until_minutes,
              reschedule_allowed, reschedule_cutoff_minutes, accessibility_contact_required,
              additional_notes_html, ?, ?, ?, ?
              FROM location_reservation_configs WHERE organization_id = ? AND location_id = ?
            ON CONFLICT (location_id) DO NOTHING`,
    params: [targetLocationId, now, now, userId, userId, organizationId, sourceLocationId],
  })
}

async function copyReviews(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  idMappings: Record<string, string>,
) {
  const reviews = await queryAll<{ id: string; product_id: string | null }>(
    db,
    'SELECT id, product_id FROM reviews WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const review of reviews) {
    const newId = crypto.randomUUID()
    const newProductId = review.product_id ? idMappings[review.product_id] : null
    if (review.product_id && !newProductId) {
      throw new Error(`Review ${review.id} cannot be copied without its Product owner`)
    }
    manifest.entities.reviews.new_ids.push(newId)

    // google_review_id is uniquely indexed (idx_reviews_google_id) and ip_hash/user_agent
    // are visitor PII tied to the original submission — none should carry over to a copy.
    statements.push({
      query: `
        INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, author_name, rating, title, content, google_review_id, owner_reply, owner_reply_at, helpful_count, status, source, ip_hash, user_agent, created_at, updated_at)
        SELECT ?, organization_id, site_id, ?, CASE WHEN product_id IS NULL THEN NULL ELSE ? END, author_name, rating, title, content, NULL, owner_reply, owner_reply_at, helpful_count, status, source, NULL, NULL, ?, ?
        FROM reviews WHERE id = ?
      `,
      params: [newId, targetLocationId, newProductId, now, now, review.id],
    })

    const media = await queryAll<{ slot: string; asset_id: string; sort_order: number }>(db, `
      SELECT slot, asset_id, sort_order FROM media_placements
       WHERE organization_id = ? AND site_id = ? AND owner_type = 'review' AND owner_id = ? AND slot <> 'social_card' AND status = 'active'
       ORDER BY slot, sort_order
    `, [organizationId, siteId, review.id])
    for (const placement of media) {
      statements.push(buildMediaPlacementInsertQuery({
        organizationId, siteId, ownerType: 'review', ownerId: newId, slot: placement.slot,
        assetId: placement.asset_id, sortOrder: placement.sort_order, createdAt: now, updatedAt: now,
      }))
    }

    manifest.entities.reviews.copied++
  }
}

async function copyLocationQa(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
) {
  const qa = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM content_documents WHERE kind = 'qa' AND row_role = 'root' AND location_id = ? AND organization_id = ? AND site_id = ?",
    [sourceLocationId, organizationId, siteId],
  )

  for (const item of qa) {
    const newId = crypto.randomUUID()
    manifest.entities.location_qa.new_ids.push(newId)

    statements.push({
      query: `
        INSERT INTO content_documents (id, organization_id, site_id, location_id, kind, row_role, locale, title, summary, metadata_json, source, status, visibility, sort_order, created_by, updated_by, created_at, updated_at)
        SELECT ?, organization_id, site_id, ?, 'qa', 'root', 'en', title, summary, metadata_json, source, status, visibility, sort_order, created_by, updated_by, ?, ?
        FROM content_documents WHERE id = ? AND kind = 'qa' AND row_role = 'root' AND organization_id = ? AND site_id = ?
      `,
      params: [newId, targetLocationId, now, now, item.id, organizationId, siteId],
    })

    manifest.entities.location_qa.copied++
  }
}
