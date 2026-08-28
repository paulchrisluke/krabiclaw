// Resolves the real, persisted background photo a page's OG card composites onto (issue #685).
// Never returns null and never falls back to a gradient/color block — the caller either gets a
// real photo or a typed SocialImageResolutionError. See docs/seo-indexing-architecture.md.
import type { DbClient } from '~/server/db'
import { listMediaAssets, toResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import { PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

export class SocialImageResolutionError extends Error {}

export type SocialImageBackgroundTier = 'page' | 'site_default' | 'platform_default'

export interface ResolvedBackgroundAsset {
  assetId: string
  url: string
  tier: SocialImageBackgroundTier
}

/** Owner types with a single dedicated hero/cover media_placement slot (see
 * shared/media-placement-contract.ts) — covers both tenant content (business_location, post,
 * product, ...) and platform DB-backed content (blog_post, platform_doc), which use the exact
 * same slot lookup, just scoped to PLATFORM_MEDIA_SITE_ID. `tenant_page` and bare platform
 * marketing routes with no owning DB row (e.g. pages/index.vue) are handled separately below. */
const PAGE_LEVEL_SLOT: Record<string, string> = {
  business_location: 'hero',
  post: 'cover',
  blog_post: 'featured',
  offering: 'hero',
  platform_doc: 'featured',
  product: 'image',
  experience: 'gallery',
  review: 'portrait',
}

const TENANT_PAGE_BACKGROUND_SLOTS = new Set(['media', 'featured', 'background'])

function backgroundUrlForKind(asset: { kind: string; public_url: string; thumbnail_url: string | null }): string {
  // Video assets are guaranteed a thumbnail_url by toResolvedMediaAsset/createMediaAsset — see
  // server/utils/media-asset-manager.ts. This is the "video-backed page" tier from the plan;
  // no new poster-generation pipeline exists or is needed.
  if (asset.kind === 'video') return asset.thumbnail_url!
  return asset.public_url
}

function resolveTenantPageBlockBackground(blocks: TenantPageBlock[]): ResolvedBackgroundAsset | null {
  for (const block of blocks) {
    const media = block.media.find(item => TENANT_PAGE_BACKGROUND_SLOTS.has(item.slot) && (item.public_url || item.thumbnail_url))
    if (!media) continue
    const url = media.kind === 'video' ? media.thumbnail_url : media.public_url
    if (!url) continue
    return { assetId: media.asset_id, url, tier: 'page' }
  }
  return null
}

async function resolvePageLevelBackground(
  db: DbClient,
  siteId: string,
  ownerType: string,
  ownerId: string,
  blocks?: TenantPageBlock[],
): Promise<ResolvedBackgroundAsset | null> {
  if (ownerType === 'tenant_page') {
    return resolveTenantPageBlockBackground(blocks ?? [])
  }
  const slot = PAGE_LEVEL_SLOT[ownerType]
  if (!slot) return null
  const rows = await listMediaAssets(db, siteId, { ownerType, ownerId, slot, limit: 1 })
  const row = rows[0]
  if (!row) return null
  const resolved = toResolvedMediaAsset(row)
  return { assetId: resolved.asset_id, url: backgroundUrlForKind(resolved), tier: 'page' }
}

async function resolveSiteDefaultBackground(db: DbClient, siteId: string): Promise<ResolvedBackgroundAsset | null> {
  const rows = await listMediaAssets(db, siteId, { ownerType: 'site', ownerId: siteId, slot: 'og_default', limit: 1 })
  const row = rows[0]
  if (!row) return null
  const resolved = toResolvedMediaAsset(row)
  // PLATFORM_MEDIA_SITE_ID's own 'og_default' IS the platform default — see below, there is no
  // separate table/mechanism for it (deliberately: reuse the exact same site-default resolution
  // that every tenant site already uses, scoped to the reserved platform site instead).
  const tier: SocialImageBackgroundTier = siteId === PLATFORM_MEDIA_SITE_ID ? 'platform_default' : 'site_default'
  return { assetId: resolved.asset_id, url: backgroundUrlForKind(resolved), tier }
}

export interface ResolveSocialImageBackgroundInput {
  /** Real tenant site id, or PLATFORM_MEDIA_SITE_ID (server/utils/platform-media.ts) for
   * platform-owned pages (marketing routes, blog posts, docs, template pages) — there is no
   * separate "platform" code path, it is the same two-tier resolution scoped to the reserved
   * platform site. */
  siteId: string
  ownerType: string
  ownerId: string
  /** Required when ownerType is 'tenant_page' — already-hydrated blocks with resolved media URLs
   * (e.g. from attachTenantPageMedia in server/utils/tenant-pages.ts). */
  blocks?: TenantPageBlock[]
}

/**
 * Tier 1: the page's own image (or video poster). Tier 2: the site's real default photo — for
 * platform-owned pages this is the platform default (PLATFORM_MEDIA_SITE_ID's own 'og_default').
 * Nothing resolvable throws instead of silently defaulting, so publish blocks on a typed error
 * rather than shipping a page with no real image (confirmed product policy) — this applies
 * equally to a tenant site with zero real media and to the platform site if its default is ever
 * unseeded.
 */
export async function resolveSocialImageBackground(
  db: DbClient,
  input: ResolveSocialImageBackgroundInput,
): Promise<ResolvedBackgroundAsset> {
  const page = await resolvePageLevelBackground(db, input.siteId, input.ownerType, input.ownerId, input.blocks)
  if (page) return page

  const siteDefault = await resolveSiteDefaultBackground(db, input.siteId)
  if (siteDefault) return siteDefault

  throw new SocialImageResolutionError(
    `Site ${input.siteId} has no page image for ${input.ownerType}:${input.ownerId} and no default social image — upload a real photo before this page can publish`,
  )
}
