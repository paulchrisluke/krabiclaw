import { executeBatch, queryAll, queryFirst, rawClient, type BatchQuery, type DbClient } from '~/server/db'
import { createLocation, deleteLocation, updateLocation, type CreateLocationInput } from '~/server/utils/location-management'
import { uniqueSlug } from '~/server/utils/experiences'
import type { CloudflareEnv } from '~/server/utils/auth'
import { buildMediaPlacementInsertQuery } from '~/server/utils/media-asset-manager'
import { ensureExperienceCategory } from '~/server/utils/product-management'
import { refreshSocialCard, type SocialCardOwner } from '~/server/utils/social-card'

type SetupEnv = CloudflareEnv

export type CopyEntityType = 
  | 'products'
  | 'media_assets' 
  | 'reviews' 
  | 'location_qa' 
  | 'experiences'

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
        const cleanupResult = await deleteLocation(env, rawClient(db), organizationId, siteId, targetLocationId, userId)
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
      experiences: { copied: 0, new_ids: [] },
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
  const entityOrder: CopyEntityType[] = ['media_assets', 'products', 'experiences', 'reviews', 'location_qa']
  const requestedConfigs = new Map(entities.map((config) => [config.type, config]))

  try {
    await copyLocationPolicies(db, source_location_id, targetLocationId, organizationId, siteId, now, statements)
    for (const type of entityOrder) {
      const entityConfig = requestedConfigs.get(type)
      if (!entityConfig) continue

      switch (entityConfig.type) {
        case 'products':
          await copyProducts(db, source_location_id, targetLocationId, organizationId, siteId, userId, now, statements, manifest, idMappings)
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
        case 'experiences':
          await copyExperiences(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, idMappings, userId)
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
    const copiedProductIds = manifest.entities.products.new_ids
    if (copiedProductIds.length) {
      const publicProducts = await queryAll<{ id: string }>(db, `
        SELECT id FROM products
         WHERE site_id = ? AND product_type = 'standard' AND is_visible = 1
           AND id IN (SELECT value FROM json_each(?))
      `, [siteId, JSON.stringify(copiedProductIds)])
      refreshOwners.push(...publicProducts.map(row => ({ owner_type: 'product' as const, owner_id: row.id })))
    }
    refreshOwners.push(...manifest.entities.experiences.new_ids.map(owner_id => ({ owner_type: 'experience' as const, owner_id })))
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

async function copyProducts(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  userId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  idMappings: Record<string, string>,
) {
  const products = await queryAll<{ id: string; slug: string; category_id: string; category_name: string; category_slug: string }>(
    db, `SELECT p.id, p.slug, p.category_id, pc.name AS category_name, pc.slug AS category_slug
           FROM products p JOIN product_categories pc ON pc.id = p.category_id
          WHERE p.location_id = ? AND p.organization_id = ? AND p.site_id = ? AND p.product_type = 'standard'
          ORDER BY pc.sort_order, p.sort_order, p.id`,
    [sourceLocationId, organizationId, siteId],
  )
  const targetSlugs = new Set((await queryAll<{ slug: string }>(db, `SELECT slug FROM products WHERE site_id = ? AND location_id = ?`, [siteId, targetLocationId])).map(row => row.slug))
  // Categories are per location, so a copied Product cannot reuse the source
  // category row. Match the target's category by name and create the missing
  // ones in the same batch, so a failed copy leaves no orphan categories.
  const targetCategories = await queryAll<{ id: string; name: string; slug: string }>(
    db, `SELECT id, name, slug FROM product_categories WHERE site_id = ? AND location_id = ? AND product_type = 'standard'`,
    [siteId, targetLocationId],
  )
  const categoryIdByName = new Map(targetCategories.map(row => [row.name, row.id]))
  const targetCategorySlugs = new Set(targetCategories.map(row => row.slug))
  let nextCategorySortOrder = targetCategories.length
  const productCountByCategory = new Map<string, number>()
  for (const row of await queryAll<{ category_id: string; count: number }>(
    db, `SELECT category_id, COUNT(*) AS count FROM products WHERE site_id = ? AND location_id = ? AND product_type = 'standard' GROUP BY category_id`,
    [siteId, targetLocationId],
  )) productCountByCategory.set(row.category_id, Number(row.count))
  for (const product of products) {
    if (categoryIdByName.has(product.category_name)) continue
    const categoryId = crypto.randomUUID()
    let categorySlug = product.category_slug
    for (let suffix = 1; targetCategorySlugs.has(categorySlug); suffix += 1) {
      const suffixText = `-${suffix + 1}`
      categorySlug = `${product.category_slug.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
      if (suffix > 100) throw new Error(`Unable to create a target-location-safe Product category slug for ${product.category_id}`)
    }
    targetCategorySlugs.add(categorySlug)
    categoryIdByName.set(product.category_name, categoryId)
    statements.push({
      query: `INSERT INTO product_categories (id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?)`,
      params: [categoryId, organizationId, siteId, targetLocationId, product.category_name, categorySlug, nextCategorySortOrder, now, now, userId, userId],
    })
    nextCategorySortOrder += 1
  }
  for (const product of products) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[product.id] = newId
    manifest.entities.products.new_ids.push(newId)
    let newSlug = product.slug
    for (let suffix = 1; targetSlugs.has(newSlug); suffix += 1) {
      const suffixText = `-${suffix + 1}`
      newSlug = `${product.slug.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
      if (suffix > 100) throw new Error(`Unable to create a target-location-safe Product slug for ${product.id}`)
    }
    targetSlugs.add(newSlug)
    const targetCategoryId = categoryIdByName.get(product.category_name)!
    const categoryOffset = productCountByCategory.get(targetCategoryId) ?? 0
    productCountByCategory.set(targetCategoryId, categoryOffset + 1)
    statements.push({
      query: `INSERT INTO products (id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url, is_visible, available, featured, featured_sort_order, sort_order, tags_json, details_json, seo_title, seo_description, canonical_url, robots, source, created_at, updated_at, created_by, updated_by)
        SELECT ?, organization_id, site_id, ?, product_type, ?, name, ?, description, order_url, is_visible, available, featured, featured_sort_order, ?, tags_json, details_json, seo_title, seo_description, canonical_url, robots, 'copy', ?, ?, ?, ? FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`,
      params: [newId, targetLocationId, targetCategoryId, newSlug, categoryOffset, now, now, userId, userId, product.id, organizationId, siteId, sourceLocationId],
    })
    const priceRows = await queryAll<{ id: string }>(db, `SELECT id FROM prices WHERE product_id = ? ORDER BY valid_from, id`, [product.id])
    for (const price of priceRows) statements.push({
      query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
        SELECT ?, organization_id, site_id, ?, ?, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, 'copy', ?, ? FROM prices WHERE id = ?`,
      params: [crypto.randomUUID(), targetLocationId, newId, userId, now, price.id],
    })
    const mediaRows = await queryAll<{ slot: string; asset_id: string; sort_order: number }>(
      db,
      `SELECT slot, asset_id, sort_order FROM media_placements WHERE organization_id = ? AND site_id = ? AND owner_type = 'product' AND owner_id = ? AND slot IN ('image','gallery') AND status = 'active' ORDER BY slot, sort_order`,
      [organizationId, siteId, product.id],
    )
    for (const media of mediaRows) {
      const newAssetId = idMappings[media.asset_id] ?? media.asset_id
      statements.push(buildMediaPlacementInsertQuery({
        organizationId, siteId, ownerType: 'product', ownerId: newId, slot: media.slot,
        assetId: newAssetId, sortOrder: media.sort_order, createdAt: now, updatedAt: now,
      }))
    }
    manifest.entities.products.copied++
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

async function copyLocationPolicies(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
) {
  const locationPolicies = await queryAll<{ policy_type: 'reservation' | 'experience' }>(
    db,
    `
    SELECT policy_type
    FROM booking_policies
    WHERE organization_id = ? AND site_id = ? AND scope_type = 'location' AND location_id = ?
    `,
    [organizationId, siteId, sourceLocationId],
  )

  for (const policy of locationPolicies) {
    statements.push({
      query: `
        INSERT INTO booking_policies (
          id, organization_id, site_id, policy_type, scope_type, location_id, experience_id,
          advance_notice_minutes, free_cancellation_until_minutes, reschedule_allowed,
          reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
          minimum_guest_age, accessibility_contact_required, created_at, updated_at
        )
        SELECT lower(hex(randomblob(16))), organization_id, site_id, policy_type, scope_type, ?, NULL,
               advance_notice_minutes, free_cancellation_until_minutes, reschedule_allowed,
               reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
               minimum_guest_age, accessibility_contact_required, ?, ?
        FROM booking_policies
        WHERE organization_id = ? AND site_id = ? AND scope_type = 'location' AND location_id = ? AND policy_type = ?
          AND NOT EXISTS (
            SELECT 1
            FROM booking_policies existing
            WHERE existing.site_id = booking_policies.site_id
              AND existing.scope_type = 'location'
              AND existing.location_id = ?
              AND existing.policy_type = booking_policies.policy_type
          )
      `,
      params: [targetLocationId, now, now, organizationId, siteId, sourceLocationId, policy.policy_type, targetLocationId],
    })
  }
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
    'SELECT id FROM location_qa WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const item of qa) {
    const newId = crypto.randomUUID()
    manifest.entities.location_qa.new_ids.push(newId)

    statements.push({
      query: `
        INSERT INTO location_qa (id, organization_id, site_id, location_id, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at)
        SELECT ?, organization_id, site_id, ?, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, ?, ?
        FROM location_qa WHERE id = ?
      `,
      params: [newId, targetLocationId, now, now, item.id],
    })

    manifest.entities.location_qa.copied++
  }
}

async function copyExperiences(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  idMappings: Record<string, string>,
  userId: string,
) {
  const experiences = await queryAll<{ id: string; slug: string }>(
    db,
    'SELECT e.id, p.slug FROM experiences e JOIN products p ON p.id = e.id WHERE e.location_id = ? AND e.organization_id = ? AND e.site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )
  const targetExperienceCount = Number((await queryFirst<{ count: number }>(db, `SELECT COUNT(*) AS count FROM products WHERE site_id = ? AND location_id = ? AND product_type = 'experience'`, [siteId, targetLocationId]))?.count ?? 0)
  const targetExperienceCategoryId = experiences.length
    ? await ensureExperienceCategory(db, organizationId, siteId, targetLocationId, userId)
    : null

  for (const [experienceIndex, exp] of experiences.entries()) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[exp.id] = newId
    manifest.entities.experiences.new_ids.push(newId)

    // experiences.slug is unique per site_id, so a same-site copy must not reuse the source slug.
    const newSlug = await uniqueSlug(db, siteId, exp.slug)

    statements.push({
      query: `INSERT INTO products (id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url, is_visible, available, featured, featured_sort_order, sort_order, tags_json, details_json, seo_title, seo_description, canonical_url, robots, source, created_at, updated_at, created_by, updated_by)
        SELECT ?, organization_id, site_id, ?, 'experience', ?, name, ?, description, order_url, is_visible, available, featured, featured_sort_order, ?, tags_json, details_json, seo_title, seo_description, canonical_url, robots, 'copy', ?, ?, created_by, updated_by FROM products WHERE id = ?`,
      params: [newId, targetLocationId, targetExperienceCategoryId, newSlug, targetExperienceCount + experienceIndex, now, now, exp.id],
    })
    statements.push({
      query: `
        INSERT INTO experiences (id, organization_id, site_id, location_id, tagline, pricing_note, duration_minutes, max_capacity, time_slots, recurring_slots, created_at, updated_at, included_items, what_to_bring, meeting_point, cancellation_policy)
        SELECT ?, organization_id, site_id, ?, tagline, pricing_note, duration_minutes, max_capacity, time_slots, recurring_slots, ?, updated_at, included_items, what_to_bring, meeting_point, cancellation_policy
        FROM experiences WHERE id = ?
      `,
      params: [newId, targetLocationId, now, exp.id],
    })
    const priceRows = await queryAll<{ id: string }>(db, `SELECT id FROM prices WHERE product_id = ? ORDER BY valid_from, id`, [exp.id])
    for (const price of priceRows) statements.push({
      query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
        SELECT ?, organization_id, site_id, ?, ?, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, 'copy', created_by, ? FROM prices WHERE id = ?`,
      params: [crypto.randomUUID(), targetLocationId, newId, now, price.id],
    })

    const experienceMedia = await queryAll<{ asset_id: string; sort_order: number }>(
      db,
      `SELECT asset_id, sort_order
         FROM media_placements
        WHERE organization_id = ? AND site_id = ? AND owner_type = 'experience' AND owner_id = ? AND slot = 'gallery' AND status = 'active'
        ORDER BY sort_order ASC`,
      [organizationId, siteId, exp.id],
    )
    for (const item of experienceMedia) {
      const newAssetId = idMappings[item.asset_id] ?? item.asset_id
      statements.push(buildMediaPlacementInsertQuery({
        organizationId, siteId, ownerType: 'experience', ownerId: newId, slot: 'gallery',
        assetId: newAssetId, sortOrder: item.sort_order, createdAt: now, updatedAt: now,
      }))
    }

    statements.push({
      query: `
        INSERT INTO booking_policies (
          id, organization_id, site_id, policy_type, scope_type, location_id, experience_id,
          advance_notice_minutes, free_cancellation_until_minutes, reschedule_allowed,
          reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
          minimum_guest_age, accessibility_contact_required, created_at, updated_at
        )
        SELECT lower(hex(randomblob(16))), organization_id, site_id, policy_type, scope_type, ?, ?,
               advance_notice_minutes, free_cancellation_until_minutes, reschedule_allowed,
               reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
               minimum_guest_age, accessibility_contact_required, ?, ?
        FROM booking_policies
        WHERE organization_id = ? AND site_id = ? AND scope_type = 'experience' AND experience_id = ?
      `,
      params: [targetLocationId, newId, now, now, organizationId, siteId, exp.id],
    })

    manifest.entities.experiences.copied++
  }
}
