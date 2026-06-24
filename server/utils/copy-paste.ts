import { executeBatch, queryAll, queryFirst, rawClient, type BatchQuery, type DbClient } from '~/server/db'
import { createLocation, deleteLocation, updateLocation, type CreateLocationInput } from '~/server/utils/location-management'
import { uniqueSlug } from '~/server/utils/experiences'

type SetupEnv = Record<string, string | undefined>

export type CopyEntityType = 
  | 'menus' 
  | 'menu_items' 
  | 'media_assets' 
  | 'site_content' 
  | 'reviews' 
  | 'location_qa' 
  | 'experiences'

export interface CopyEntityConfig {
  type: CopyEntityType
  include_translations?: boolean
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

  // Validated before any location is created so a bad entities list can't strand
  // an orphaned location.
  const requestedTypes = new Set(entities.map((config) => config.type))
  if (requestedTypes.has('menu_items') && !requestedTypes.has('menus')) {
    return { success: false, error: 'Copying menu_items requires also copying menus, since each copied item must attach to a newly copied menu' }
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
    const createResult = await createLocation(env, rawClient(db), organizationId, siteId, new_location, userId)
    
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
  const cleanupOnFailure = async <T>(result: T): Promise<T> => {
    if (createdNewLocation) {
      await deleteLocation(env, rawClient(db), organizationId, siteId, targetLocationId, userId).catch(() => {})
    }
    return result
  }

  // Build ID mapping table for foreign key remapping
  const idMappings: Record<string, string> = {}
  const manifest: CopyManifest = {
    target_location_id: targetLocationId,
    target_location_slug: targetLocationSlug,
    entities: {
      menus: { copied: 0, new_ids: [] },
      menu_items: { copied: 0, new_ids: [] },
      media_assets: { copied: 0, new_ids: [] },
      site_content: { copied: 0, new_ids: [] },
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

  // Process entities in dependency order (media_assets before anything that
  // references image_asset_id/hero_image_asset_id; menus before menu_items)
  // regardless of the order the caller listed them in.
  const entityOrder: CopyEntityType[] = ['media_assets', 'menus', 'menu_items', 'site_content', 'experiences', 'reviews', 'location_qa']
  const requestedConfigs = new Map(entities.map((config) => [config.type, config]))

  for (const type of entityOrder) {
    const entityConfig = requestedConfigs.get(type)
    if (!entityConfig) continue

    switch (entityConfig.type) {
      case 'menus':
        await copyMenus(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, entityConfig.include_translations)
        break
      case 'menu_items':
        await copyMenuItems(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, idMappings, entityConfig.include_translations)
        break
      case 'media_assets':
        await copyMediaAssets(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest)
        break
      case 'site_content':
        await copySiteContent(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, idMappings, entityConfig.include_translations)
        break
      case 'reviews':
        await copyReviews(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest)
        break
      case 'location_qa':
        await copyLocationQa(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest)
        break
      case 'experiences':
        await copyExperiences(db, source_location_id, targetLocationId, organizationId, siteId, now, statements, manifest, idMappings)
        break
    }
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

  return { success: true, manifest }
}

async function copyMenus(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  includeTranslations = true,
) {
  const menus = await queryAll<{ id: string }>(
    db,
    'SELECT id FROM menus WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const menu of menus) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[menu.id] = newId
    manifest.entities.menus.new_ids.push(newId)

    statements.push({
      query: `
        INSERT INTO menus (id, organization_id, site_id, location_id, name, description, status, section_order, created_at, updated_at, created_by, updated_by)
        SELECT ?, organization_id, ?, ?, name, description, status, section_order, ?, updated_at, created_by, updated_by
        FROM menus WHERE id = ?
      `,
      params: [newId, siteId, targetLocationId, now, menu.id],
    })

    if (includeTranslations) {
      statements.push({
        query: `
          INSERT INTO menu_translations (id, organization_id, site_id, menu_id, locale, name, description, section_order, status, source_hash, translated_at, reviewed_at, updated_at, updated_by)
          SELECT ?, organization_id, site_id, ?, locale, name, description, section_order, status, source_hash, translated_at, reviewed_at, ?, updated_by
          FROM menu_translations WHERE menu_id = ?
        `,
        params: [crypto.randomUUID(), newId, now, menu.id],
      })
    }

    manifest.entities.menus.copied++
  }
}

async function copyMenuItems(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  idMappings: Record<string, string>,
  includeTranslations = true,
) {
  const menuItems = await queryAll<{ id: string; menu_id: string; image_asset_id: string | null }>(
    db,
    `
    SELECT id, menu_id, image_asset_id 
    FROM menu_items 
    WHERE menu_id IN (SELECT id FROM menus WHERE location_id = ? AND organization_id = ? AND site_id = ?)
    `,
    [sourceLocationId, organizationId, siteId],
  )

  for (const item of menuItems) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[item.id] = newId
    manifest.entities.menu_items.new_ids.push(newId)

    const newMenuId = idMappings[item.menu_id]
    const newImageAssetId = item.image_asset_id ? idMappings[item.image_asset_id] : null

    statements.push({
      query: `
        INSERT INTO menu_items (id, menu_id, section, name, slug, description, price_amount, image_asset_id, available, featured, featured_sort_order, sort_order, allergens, ingredients, dietary_notes, preparation, serving_note, created_at, updated_at, created_by, updated_by)
        SELECT ?, ?, section, name, slug, description, price_amount, ?, available, featured, featured_sort_order, sort_order, allergens, ingredients, dietary_notes, preparation, serving_note, ?, updated_at, created_by, updated_by
        FROM menu_items WHERE id = ?
      `,
      params: [newId, newMenuId, newImageAssetId, now, item.id],
    })

    if (includeTranslations) {
      statements.push({
        query: `
          INSERT INTO menu_item_translations (id, organization_id, site_id, menu_item_id, locale, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note, status, source_hash, translated_at, reviewed_at, updated_at, updated_by)
          SELECT ?, organization_id, site_id, ?, locale, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note, status, source_hash, translated_at, reviewed_at, ?, updated_by
          FROM menu_item_translations WHERE menu_item_id = ?
        `,
        params: [crypto.randomUUID(), newId, now, item.id],
      })
    }

    manifest.entities.menu_items.copied++
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
  const assets = await queryAll<{ id: string }>(
    db,
    `SELECT id FROM media_assets WHERE location_id = ? AND organization_id = ? AND site_id = ? AND status = 'active'`,
    [sourceLocationId, organizationId, siteId],
  )

  for (const asset of assets) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[asset.id] = newId
    manifest.entities.media_assets.new_ids.push(newId)

    statements.push({
      query: `
        INSERT INTO media_assets (id, organization_id, site_id, location_id, kind, provider, source, cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url, mime_type, file_name, file_size, width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at, delete_pending_at)
        SELECT ?, organization_id, site_id, ?, kind, provider, source, cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url, mime_type, file_name, file_size, width, height, duration, alt_text, category, status, created_by_user_id, ?, ?, NULL
        FROM media_assets WHERE id = ?
      `,
      params: [newId, targetLocationId, now, now, asset.id],
    })

    manifest.entities.media_assets.copied++
  }
}

async function copySiteContent(
  db: DbClient,
  sourceLocationId: string,
  targetLocationId: string,
  organizationId: string,
  siteId: string,
  now: string,
  statements: BatchQuery[],
  manifest: CopyManifest,
  idMappings: Record<string, string>,
  includeTranslations = true,
) {
  const content = await queryAll<{ id: string; page: string; field: string; hero_image_asset_id: string | null; hero_video_asset_id: string | null }>(
    db,
    'SELECT id, page, field, hero_image_asset_id, hero_video_asset_id FROM site_content WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const item of content) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[item.id] = newId
    manifest.entities.site_content.new_ids.push(newId)

    const newHeroImageId = item.hero_image_asset_id ? idMappings[item.hero_image_asset_id] : null
    const newHeroVideoId = item.hero_video_asset_id ? idMappings[item.hero_video_asset_id] : null

    statements.push({
      query: `
        INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, value, type, source, updated_at, updated_by, component)
        SELECT ?, organization_id, site_id, ?, page, field, content, hero_title, hero_subtitle, ?, ?, value, type, source, ?, updated_by, component
        FROM site_content WHERE id = ?
      `,
      params: [newId, targetLocationId, newHeroImageId, newHeroVideoId, now, item.id],
    })

    if (includeTranslations) {
      // site_content_translations has no FK to site_content.id — it's keyed by
      // (organization_id, site_id, location_id, page, field, locale), so match on that.
      statements.push({
        query: `
          INSERT INTO site_content_translations (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, reviewed_at, updated_at, updated_by, component)
          SELECT lower(hex(randomblob(16))), organization_id, site_id, ?, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, reviewed_at, ?, updated_by, component
          FROM site_content_translations
          WHERE organization_id = ? AND site_id = ? AND location_id = ? AND page = ? AND field = ?
        `,
        params: [targetLocationId, now, organizationId, siteId, sourceLocationId, item.page, item.field],
      })
    }

    manifest.entities.site_content.copied++
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
) {
  const reviews = await queryAll<{ id: string }>(
    db,
    'SELECT id FROM reviews WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const review of reviews) {
    const newId = crypto.randomUUID()
    manifest.entities.reviews.new_ids.push(newId)

    // google_review_id is uniquely indexed (idx_reviews_google_id) and ip_hash/user_agent
    // are visitor PII tied to the original submission — none should carry over to a copy.
    statements.push({
      query: `
        INSERT INTO reviews (id, organization_id, site_id, location_id, menu_item_slug, author_name, reviewer_photo_url, rating, title, content, google_review_id, owner_reply, owner_reply_at, photo_urls, helpful_count, status, source, ip_hash, user_agent, created_at, updated_at)
        SELECT ?, organization_id, site_id, ?, menu_item_slug, author_name, reviewer_photo_url, rating, title, content, NULL, owner_reply, owner_reply_at, photo_urls, helpful_count, status, source, NULL, NULL, ?, ?
        FROM reviews WHERE id = ?
      `,
      params: [newId, targetLocationId, now, now, review.id],
    })

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

    // google_question_id is uniquely indexed (idx_location_qa_google_id); the copy is not
    // the literal Google Q&A entry, so it must not carry the source's external id.
    statements.push({
      query: `
        INSERT INTO location_qa (id, organization_id, site_id, location_id, google_question_id, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at)
        SELECT ?, organization_id, site_id, ?, NULL, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, ?, ?
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
) {
  const experiences = await queryAll<{ id: string; slug: string; image_asset_id: string | null; video_asset_id: string | null }>(
    db,
    'SELECT id, slug, image_asset_id, video_asset_id FROM experiences WHERE location_id = ? AND organization_id = ? AND site_id = ?',
    [sourceLocationId, organizationId, siteId],
  )

  for (const exp of experiences) {
    const newId = crypto.randomUUID()
    manifest.id_mappings[exp.id] = newId
    manifest.entities.experiences.new_ids.push(newId)

    const newImageId = exp.image_asset_id ? idMappings[exp.image_asset_id] : null
    const newVideoId = exp.video_asset_id ? idMappings[exp.video_asset_id] : null
    // experiences.slug is unique per site_id, so a same-site copy must not reuse the source slug.
    const newSlug = await uniqueSlug(db, siteId, exp.slug)

    statements.push({
      query: `
        INSERT INTO experiences (id, organization_id, site_id, location_id, title, slug, tagline, body, image_asset_id, video_asset_id, images, price, price_amount, duration_minutes, max_capacity, time_slots, recurring_slots, available_note, status, sort_order, featured, featured_sort_order, seo_title, seo_description, created_at, updated_at, created_by, highlights, included_items, what_to_bring, meeting_point, cancellation_policy)
        SELECT ?, organization_id, site_id, ?, title, ?, tagline, body, ?, ?, images, price, price_amount, duration_minutes, max_capacity, time_slots, recurring_slots, available_note, status, sort_order, featured, featured_sort_order, seo_title, seo_description, ?, updated_at, created_by, highlights, included_items, what_to_bring, meeting_point, cancellation_policy
        FROM experiences WHERE id = ?
      `,
      params: [newId, targetLocationId, newSlug, newImageId, newVideoId, now, exp.id],
    })

    manifest.entities.experiences.copied++
  }
}
