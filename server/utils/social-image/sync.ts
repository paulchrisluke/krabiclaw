// Single entry point every publish-time mutation path calls to (re)generate one owner's OG
// card (issue #685) — wraps resolveSocialImageBackground + generateSocialImage so callers never
// duplicate that two-step sequence. Throws SocialImageResolutionError (a normal validation
// failure, not a 500) when nothing real can be resolved — publish blocks, per confirmed policy.
import { queryFirst, type DbClient } from '~/server/db'
import { resolveSocialImageBackground } from '~/server/utils/social-image-resolver'
import { generateSocialImage, type GeneratedSocialImage } from '~/server/utils/social-image/generate'
import { PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import type { SocialTemplate } from '~/utils/social-metadata'
import { resolvePublicTemplate } from '~/utils/template-registry'


type CloudflareImagesEnv = Parameters<typeof generateSocialImage>[1]

export interface SiteBrand {
  organizationId: string
  siteName: string
  template: SocialTemplate
  logoUrl: string | null
  logoAssetId: string | null
  faviconUrl: string | null
}

interface SiteBrandRow {
  organization_id: string
  brand_name: string
  theme_id: string
}

interface MediaPlacementRow {
  slot: string
  asset_id: string
  public_url: string | null
}

/** Real tenant site's own brand — logo/favicon/name/template, the same values every tenant page
 * already reads via publicSite.value.media in its own useSocialMetadata() brand block. For the
 * reserved platform site (PLATFORM_MEDIA_SITE_ID), returns the platform's own fixed brand
 * instead of querying `sites` — matches composables/useSocialMetadata.ts's platform-branch
 * default (PLATFORM_NAME + krabi-claw-logo.png), and 'platform' isn't a theme-resolvable
 * template the way a real tenant site's theme_id is. */
export async function loadSiteBrand(db: DbClient, siteId: string, platformDomain?: string): Promise<SiteBrand> {
  if (siteId === PLATFORM_MEDIA_SITE_ID) {
    const platformSite = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? LIMIT 1', [siteId])
    if (!platformSite) throw new Error('Platform media site is not configured')
    return {
      organizationId: platformSite.organization_id,
      siteName: 'KrabiClaw',
      template: 'platform',
      logoUrl: platformDomain ? `https://${platformDomain}/krabi-claw-logo.png` : null,
      logoAssetId: null,
      faviconUrl: null,
    }
  }
  const [site, placements] = await Promise.all([
    queryFirst<SiteBrandRow>(db, 'SELECT organization_id, brand_name, theme_id FROM sites WHERE id = ? LIMIT 1', [siteId]),
    queryFirst<MediaPlacementRow>(
      db,
      `SELECT mp.slot AS slot, mp.asset_id AS asset_id, ma.public_url AS public_url
       FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
       WHERE mp.owner_type = 'site' AND mp.owner_id = ? AND mp.slot = 'logo' AND mp.status = 'active' AND ma.status = 'active'
       LIMIT 1`,
      [siteId],
    ),
  ])
  if (!site) throw new Error(`Site ${siteId} not found`)
  const favicon = await queryFirst<MediaPlacementRow>(
    db,
    `SELECT mp.slot AS slot, mp.asset_id AS asset_id, ma.public_url AS public_url
     FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
     WHERE mp.owner_type = 'site' AND mp.owner_id = ? AND mp.slot = 'favicon' AND mp.status = 'active' AND ma.status = 'active'
     LIMIT 1`,
    [siteId],
  )
  return {
    organizationId: site.organization_id,
    siteName: site.brand_name,
    template: resolvePublicTemplate({ themeId: site.theme_id }).slug,
    logoUrl: placements?.public_url ?? null,
    logoAssetId: placements?.asset_id ?? null,
    faviconUrl: favicon?.public_url ?? null,
  }
}

export interface SyncSocialImageInput {
  siteId: string
  ownerType: string
  ownerId: string
  title: string
  description?: string | null
  label?: string | null
  location?: string | null
  /** Required when ownerType is 'tenant_page' — already-hydrated blocks. */
  blocks?: TenantPageBlock[]
  /** Only needs to differ from ownerId for synthetic per-view owner ids — see
   * server/utils/social-image-resolver.ts's ResolveSocialImageBackgroundInput. */
  backgroundOwnerId?: string
  platformDomain?: string
}

export async function syncSocialImageForOwner(
  db: DbClient,
  env: CloudflareImagesEnv,
  input: SyncSocialImageInput,
): Promise<GeneratedSocialImage> {
  const brand = await loadSiteBrand(db, input.siteId, input.platformDomain)
  const background = await resolveSocialImageBackground(db, {
    siteId: input.siteId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    backgroundOwnerId: input.backgroundOwnerId,
    blocks: input.blocks,
  })
  return generateSocialImage(db, env, {
    organizationId: brand.organizationId,
    siteId: input.siteId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    template: brand.template,
    title: input.title,
    description: input.description,
    siteName: brand.siteName,
    label: input.label,
    location: input.location,
    logoUrl: brand.logoUrl,
    logoAssetId: brand.logoAssetId,
    faviconUrl: brand.faviconUrl,
    background,
    platformDomain: input.platformDomain,
  })
}
