import { createError } from 'h3'
import { execute, executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { assertResourceAccess, type MemberAccessPrincipal } from '~/server/utils/member-access'
import {
  buildReplaceExperienceMediaQueries,
  buildReplaceMenuItemMediaQueries,
  hydrateMediaAssetRefs,
  MAX_ORDERED_MEDIA_ASSETS,
  type MediaAssetRefInput,
  type ResolvedMediaAsset,
} from '~/server/utils/media-asset-manager'
import { getTenantPageForEditorByPath, updateTenantPageDraft } from '~/server/utils/tenant-pages'
import { materializeTenantFavicon } from '~/server/utils/favicon-derivative'
import { deleteFromR2 } from '~/server/utils/cloudflare-r2'
import { syncPostCoverMedia } from '~/server/utils/post-management'

export type MediaPlacementTarget =
  | { type: 'site_logo' }
  | { type: 'home_hero'; location_id?: string | null }
  | { type: 'home_story_image' }
  | { type: 'about_story_image' }
  | { type: 'location_hero'; location_id: string }
  | { type: 'menu_item_media'; menu_item_id: string }
  | { type: 'post_image'; post_id: string }
  | { type: 'blog_post_image'; post_id: string }
  | { type: 'experience_media'; experience_id: string }

export interface SetMediaPlacementInput {
  organizationId: string
  siteId: string
  memberId?: string
  role?: MemberAccessPrincipal['role']
  userId: string
  env?: ApiRecord
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

export function replaceStoryImageBlock(
  blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }>,
  assetId: string | null,
) {
  let replaced = false
  const next = blocks.flatMap((block) => {
    if (block.type !== 'image' || block.data.field !== 'story.image') return [block]
    if (!assetId || replaced) return []
    const { url: _url, ...data } = block.data
    replaced = true
    return [{ ...block, data: { ...data, asset_id: assetId } }]
  })
  if (assetId && !replaced) {
    next.push({
      id: crypto.randomUUID(),
      type: 'image',
      position: next.length,
      data: { field: 'story.image', asset_id: assetId, alt: 'Story image' },
    })
  }
  return next
}

export function mediaPlacementDefinition(target: MediaPlacementTarget): PlacementDefinition {
  switch (target.type) {
    case 'site_logo':
    case 'home_story_image':
    case 'about_story_image':
    case 'post_image':
    case 'blog_post_image':
      return { entity: target.type, cardinality: 'single', allowedKinds: ['image'], requireCoverPoster: true }
    case 'menu_item_media':
      return { entity: 'menu_item', cardinality: 'ordered', allowedKinds: ['image', 'video'], requireCoverPoster: true }
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
  const targetLocationId = await resolvePlacementLocationId(db, input)
  if (input.memberId && input.role) {
    await assertResourceAccess(db, {
      memberId: input.memberId,
      role: input.role,
      organizationId: input.organizationId,
      siteId: input.siteId,
      resourceLocationId: targetLocationId,
    })
  }
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
      await assignSiteLogoWithFavicon(db, {
        env: input.env,
        organizationId: input.organizationId,
        siteId: input.siteId,
        asset: media[0] ?? null,
        now,
      })
      return placementResult(input.target, media, 'site', input.siteId, now)
    }
    case 'home_hero': {
      if (input.target.location_id) throw createError({ statusCode: 400, statusMessage: 'Home hero media is site-scoped.' })
      const home = await getTenantPageForEditorByPath(db, input.siteId, '/')
      await updateTenantPageDraft(db, home.id, {
        userId: null,
        scope: { siteId: input.siteId, organizationId: input.organizationId },
        data: {
          path: home.path,
          title: home.title,
          summary: home.summary,
          seoTitle: home.seo_title,
          seoDescription: home.seo_description,
          canonicalUrl: home.canonical_url,
          robots: home.robots,
          pageType: home.page_type,
          recipe: home.recipe,
          sortOrder: home.sort_order,
          blocks: home.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, asset_id: assetId } } : block),
          expectedDocumentUpdatedAt: home.document.updated_at,
        },
      })
      return placementResult(input.target, media, 'page_content', 'home', now, targetLocationId)
    }
    case 'home_story_image':
    case 'about_story_image': {
      const page = input.target.type === 'home_story_image' ? 'home' : 'about'
      const canonicalPage = await getTenantPageForEditorByPath(db, input.siteId, page === 'home' ? '/' : '/about')
      await updateTenantPageDraft(db, canonicalPage.id, {
        userId: null,
        scope: { siteId: input.siteId, organizationId: input.organizationId },
        data: {
          path: canonicalPage.path,
          title: canonicalPage.title,
          summary: canonicalPage.summary,
          seoTitle: canonicalPage.seo_title,
          seoDescription: canonicalPage.seo_description,
          canonicalUrl: canonicalPage.canonical_url,
          robots: canonicalPage.robots,
          pageType: canonicalPage.page_type,
          recipe: canonicalPage.recipe,
          sortOrder: canonicalPage.sort_order,
          blocks: replaceStoryImageBlock(canonicalPage.blocks, assetId),
          expectedDocumentUpdatedAt: canonicalPage.document.updated_at,
        },
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
      return placementResult(input.target, media, 'location', input.target.location_id, now, targetLocationId)
    }
    case 'menu_item_media': {
      const [updateResult] = await executeBatch(db, [
        {
          query: `
            UPDATE menu_items
               SET updated_at = ?
             WHERE id = ?
               AND menu_id IN (
                 SELECT id
                   FROM menus
                  WHERE organization_id = ? AND site_id = ?
               )
          `,
          params: [now, input.target.menu_item_id, input.organizationId, input.siteId],
        },
        ...buildReplaceMenuItemMediaQueries({
          organizationId: input.organizationId,
          siteId: input.siteId,
          menuItemId: input.target.menu_item_id,
          media,
          now,
        }),
      ])
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
      return placementResult(input.target, media, 'menu_item', input.target.menu_item_id, menu?.updated_at ?? now, targetLocationId)
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
      await syncPostCoverMedia(db, input.organizationId, input.siteId, input.target.post_id, assetId)
      const post = await queryFirst<{ location_id: string | null; updated_at: string | null }>(db, `
        SELECT location_id, updated_at
          FROM posts
         WHERE organization_id = ? AND site_id = ? AND id = ?
         LIMIT 1
      `, [input.organizationId, input.siteId, input.target.post_id])
      return placementResult(input.target, media, 'post', input.target.post_id, post?.updated_at ?? now, targetLocationId)
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
      return placementResult(input.target, media, 'experience', experience.id, now, targetLocationId)
    }
  }
}

export async function assignSiteLogoWithFavicon(
  db: DbClient,
  input: {
    env?: ApiRecord
    organizationId: string
    siteId: string
    asset: ResolvedMediaAsset | null
    now?: string
    onlyIfEmpty?: boolean
  },
): Promise<void> {
  const now = input.now ?? new Date().toISOString()
  let derivative: { key: string; publicUrl: string } | null = null
  if (input.asset) {
    if (!input.env) throw createError({ statusCode: 500, statusMessage: 'Media storage unavailable' })
    derivative = await materializeTenantFavicon(input.env, {
      siteId: input.siteId,
      assetId: input.asset.id,
      sourceUrl: input.asset.public_url,
    })
  }

  try {
    const result = await execute(db, `
      UPDATE sites
         SET logo_asset_id = ?,
             settings = CASE
               WHEN ? IS NULL THEN json_remove(COALESCE(settings, '{}'), '$.favicon_url')
               ELSE json_set(COALESCE(settings, '{}'), '$.favicon_url', ?)
             END,
             updated_at = ?
       WHERE organization_id = ? AND id = ?
         AND (? = 0 OR logo_asset_id IS NULL)
    `, [
      input.asset?.id ?? null,
      derivative?.publicUrl ?? null,
      derivative?.publicUrl ?? null,
      now,
      input.organizationId,
      input.siteId,
      input.onlyIfEmpty ? 1 : 0,
    ])
    if (!result?.success || Number(result.meta?.changes ?? 0) === 0) {
      throw createError({ statusCode: input.onlyIfEmpty ? 409 : 404, statusMessage: input.onlyIfEmpty ? 'Site logo already assigned' : 'Site not found' })
    }
  } catch (error) {
    if (derivative && input.env) {
      try {
        await deleteFromR2(input.env, derivative.key)
      } catch (cleanupError) {
        console.error('favicon_derivative_cleanup_failed', {
          siteId: input.siteId,
          key: derivative.key,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }
    }
    throw error
  }
}

async function resolvePlacementLocationId(db: DbClient, input: SetMediaPlacementInput): Promise<string | null> {
  switch (input.target.type) {
    case 'site_logo':
    case 'home_story_image':
    case 'about_story_image':
    case 'blog_post_image':
      return null
    case 'home_hero':
      return input.target.location_id ?? null
    case 'location_hero': {
      const location = await queryFirst<{ id: string }>(db, `
        SELECT id FROM business_locations
        WHERE organization_id = ? AND site_id = ? AND id = ?
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.location_id])
      if (!location) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
      return location.id
    }
    case 'menu_item_media': {
      const menu = await queryFirst<{ location_id: string | null }>(db, `
        SELECT m.location_id
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE m.organization_id = ? AND m.site_id = ? AND mi.id = ?
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.menu_item_id])
      if (!menu) throw createError({ statusCode: 404, statusMessage: 'Menu item not found' })
      return menu.location_id ?? null
    }
    case 'post_image': {
      const post = await queryFirst<{ location_id: string | null }>(db, `
        SELECT location_id FROM posts
        WHERE organization_id = ? AND site_id = ? AND id = ?
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.post_id])
      if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
      return post.location_id ?? null
    }
    case 'experience_media': {
      const experience = await queryFirst<{ location_id: string | null }>(db, `
        SELECT location_id FROM experiences
        WHERE organization_id = ? AND site_id = ? AND (id = ? OR slug = ?)
        LIMIT 1
      `, [input.organizationId, input.siteId, input.target.experience_id, input.target.experience_id])
      if (!experience) throw createError({ statusCode: 404, statusMessage: 'Experience not found' })
      return experience.location_id ?? null
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
