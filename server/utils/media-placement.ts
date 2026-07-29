import { createError } from 'h3'
import { execute, executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  buildReplaceExperienceMediaQueries,
  hydrateMediaAssetRefs,
  MAX_ORDERED_MEDIA_ASSETS,
  type MediaAssetRefInput,
  type ResolvedMediaAsset,
} from '~/server/utils/media-asset-manager'
import { updatePageContent } from '~/server/utils/mcp-workflows'

export type MediaPlacementTarget =
  | { type: 'site_logo' }
  | { type: 'home_hero'; location_id?: string | null }
  | { type: 'home_story_image' }
  | { type: 'about_story_image' }
  | { type: 'location_hero'; location_id: string }
  | { type: 'menu_item_image'; menu_item_id: string }
  | { type: 'post_image'; post_id: string }
  | { type: 'blog_post_image'; post_id: string }
  | { type: 'experience_media'; experience_id: string }

export interface SetMediaPlacementInput {
  organizationId: string
  siteId: string
  userId: string
  env?: unknown
  target: MediaPlacementTarget
  assetIds: string[]
}

export interface SetMediaPlacementResult {
  target: MediaPlacementTarget
  asset_ids: string[]
  media: ResolvedMediaAsset[]
  cleared: boolean
  entity: string
  id: string
  updated_at: string | null
  location_id: string | null
}

type PlacementDefinition = {
  entity: string
  cardinality: 'single' | 'ordered'
  allowedKinds: Array<ResolvedMediaAsset['kind']>
  requireCoverPoster: boolean
}

export function mediaPlacementDefinition(target: MediaPlacementTarget): PlacementDefinition {
  switch (target.type) {
    case 'site_logo':
    case 'home_story_image':
    case 'about_story_image':
    case 'menu_item_image':
    case 'post_image':
    case 'blog_post_image':
      return { entity: target.type, cardinality: 'single', allowedKinds: ['image'], requireCoverPoster: true }
    case 'home_hero':
    case 'location_hero':
      return { entity: target.type, cardinality: 'single', allowedKinds: ['image', 'video'], requireCoverPoster: true }
    case 'experience_media':
      return { entity: 'experience', cardinality: 'ordered', allowedKinds: ['image', 'video'], requireCoverPoster: true }
  }
}

export async function validateAndHydrateMediaPlacement(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    target: MediaPlacementTarget
    assetIds: string[]
  },
): Promise<ResolvedMediaAsset[]> {
  const definition = mediaPlacementDefinition(input.target)
  const assetIds = input.assetIds.map(id => id.trim()).filter(Boolean)
  if (assetIds.length !== input.assetIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'asset_ids must contain non-empty strings' })
  }
  if (definition.cardinality === 'single' && assetIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: `${input.target.type} accepts zero or one asset_id` })
  }
  if (definition.cardinality === 'ordered' && assetIds.length > MAX_ORDERED_MEDIA_ASSETS) {
    throw createError({ statusCode: 400, statusMessage: `${input.target.type} accepts at most ${MAX_ORDERED_MEDIA_ASSETS} asset_ids` })
  }
  const refs: MediaAssetRefInput[] = assetIds.map(asset_id => ({ asset_id }))
  return hydrateMediaAssetRefs(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    refs,
    allowedKinds: definition.allowedKinds,
    requireCoverPoster: definition.requireCoverPoster,
    fieldName: 'asset_ids',
  })
}

export async function setMediaPlacement(db: DbClient, input: SetMediaPlacementInput): Promise<SetMediaPlacementResult> {
  const media = await validateAndHydrateMediaPlacement(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    target: input.target,
    assetIds: input.assetIds,
  })
  const assetId = media[0]?.id ?? null
  const now = new Date().toISOString()

  switch (input.target.type) {
    case 'site_logo': {
      const result = await execute(db, `UPDATE sites SET logo_asset_id = ?, updated_at = ? WHERE organization_id = ? AND id = ?`, [
        assetId,
        now,
        input.organizationId,
        input.siteId,
      ])
      if (!result?.success || Number(result.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Site not found' })
      }
      return placementResult(input.target, media, 'site', input.siteId, now)
    }
    case 'home_hero': {
      await updatePageContent(db, input.organizationId, input.siteId, {
        page: 'home',
        location_id: input.target.location_id ?? null,
        changes: {
          hero: {
            hero_media_asset_id: assetId,
          },
        },
      })
      return placementResult(input.target, media, 'page_content', 'home', now, input.target.location_id ?? null)
    }
    case 'home_story_image':
    case 'about_story_image': {
      const page = input.target.type === 'home_story_image' ? 'home' : 'about'
      await updatePageContent(db, input.organizationId, input.siteId, {
        page,
        location_id: null,
        changes: { 'story.image': assetId },
      })
      return placementResult(input.target, media, 'page_content', page, now)
    }
    case 'location_hero': {
      const updateQueries: BatchQuery[] = [{
        query: `UPDATE business_locations
           SET hero_media_asset_id = ?, updated_at = ?
         WHERE organization_id = ? AND site_id = ? AND id = ?`,
        params: [
          assetId,
          now,
          input.organizationId,
          input.siteId,
          input.target.location_id,
        ],
      }]
      const [result] = await executeBatch(db, updateQueries)
      if (!result?.success || Number(result.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Location not found' })
      }
      return placementResult(input.target, media, 'location', input.target.location_id, now, input.target.location_id)
    }
    case 'menu_item_image': {
      const updateResult = await execute(db, `
        UPDATE menu_items
           SET image_asset_id = ?, updated_at = ?
         WHERE id = ?
           AND menu_id IN (
             SELECT id
               FROM menus
              WHERE organization_id = ? AND site_id = ?
           )
      `, [assetId, now, input.target.menu_item_id, input.organizationId, input.siteId])
      if (!updateResult?.success || Number(updateResult.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Menu item not found' })
      }
      const menu = await queryFirst<{ location_id: string | null; updated_at: string | null }>(db, `
        SELECT m.location_id, mi.updated_at
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE m.organization_id = ? AND m.site_id = ? AND mi.id = ?
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.menu_item_id])
      return placementResult(input.target, media, 'menu_item', input.target.menu_item_id, menu?.updated_at ?? now, menu?.location_id ?? null)
    }
    case 'post_image': {
      const updateResult = await execute(db, `
        UPDATE posts
           SET image_asset_id = ?, updated_at = ?, source = 'manual'
         WHERE organization_id = ? AND site_id = ? AND id = ?
      `, [assetId, now, input.organizationId, input.siteId, input.target.post_id])
      if (!updateResult?.success || Number(updateResult.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Post not found' })
      }
      const post = await queryFirst<{ location_id: string | null; updated_at: string | null }>(db, `
        SELECT location_id, updated_at
          FROM posts
         WHERE organization_id = ? AND site_id = ? AND id = ?
         LIMIT 1
      `, [input.organizationId, input.siteId, input.target.post_id])
      return placementResult(input.target, media, 'post', input.target.post_id, post?.updated_at ?? now, post?.location_id ?? null)
    }
    case 'blog_post_image': {
      const updateResult = await execute(db, `
        UPDATE blog_posts
           SET featured_image_asset_id = ?, updated_at = ?
         WHERE organization_id = ? AND site_id = ? AND id = ?
      `, [assetId, now, input.organizationId, input.siteId, input.target.post_id])
      if (!updateResult?.success || Number(updateResult.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Blog post not found' })
      }
      return placementResult(input.target, media, 'blog_post', input.target.post_id, now)
    }
    case 'experience_media': {
      const experience = await queryFirst<{ id: string; location_id: string | null; updated_at: string | null }>(db, `
        SELECT id, location_id, updated_at
        FROM experiences
        WHERE organization_id = ? AND site_id = ? AND (id = ? OR slug = ?)
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.experience_id, input.target.experience_id])
      if (!experience) throw createError({ statusCode: 404, statusMessage: 'Experience not found' })
      const [updateResult] = await executeBatch(db, [
        {
          query: `UPDATE experiences SET updated_at = ? WHERE organization_id = ? AND site_id = ? AND id = ?`,
          params: [now, input.organizationId, input.siteId, experience.id],
        },
        ...buildReplaceExperienceMediaQueries({
          organizationId: input.organizationId,
          siteId: input.siteId,
          experienceId: experience.id,
          media,
          now,
        }),
      ])
      if (!updateResult?.success || Number(updateResult.meta?.changes ?? 0) === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Experience not found' })
      }
      return placementResult(input.target, media, 'experience', experience.id, now, experience.location_id)
    }
  }
}

function placementResult(
  target: MediaPlacementTarget,
  media: ResolvedMediaAsset[],
  entity: string,
  id: string,
  updatedAt: string | null,
  locationId: string | null = null,
): SetMediaPlacementResult {
  return {
    target,
    asset_ids: media.map(asset => asset.id),
    media,
    cleared: media.length === 0,
    entity,
    id,
    updated_at: updatedAt,
    location_id: locationId,
  }
}
