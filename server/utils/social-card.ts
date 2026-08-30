import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  buildSingleMediaPlacementQueries,
  deleteMediaAsset,
  readMediaPlacements,
  type StoredMediaPlacementItem,
} from '~/server/utils/media-asset-manager'
import { uploadResolvedMediaToAssetStore, type UploadResolvedMediaInput } from '~/server/utils/media-upload'
import { renderOgImagePng } from '~/server/utils/og-image/render'
import { PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID } from '~/shared/platform-scope'
import {
  hashSocialCardGenerationInput,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  truncateForSeo,
  type SocialCardRenderPayload,
  type SocialTemplate,
} from '~/utils/social-metadata'
import { resolvePublicTemplate } from '~/utils/template-registry'

export type SocialCardOwner =
  | { owner_type: 'site'; owner_id: string }
  | { owner_type: 'business_location'; owner_id: string }
  | { owner_type: 'product'; owner_id: string }
  | { owner_type: 'post'; owner_id: string }
  | { owner_type: 'blog_post'; owner_id: string }
  | { owner_type: 'experience'; owner_id: string }
  | { owner_type: 'offering'; owner_id: string }
  | { owner_type: 'platform_doc'; owner_id: string }
  | { owner_type: 'review'; owner_id: string }
  | { owner_type: 'tenant_page'; owner_id: string }

export type SocialCardRefreshResult =
  | { kind: 'generated'; owner: SocialCardOwner; assetId: string; publicUrl: string; generationKey: string }
  | { kind: 'reused'; owner: SocialCardOwner; assetId: string; publicUrl: string; generationKey: string }
  | { kind: 'skipped'; owner: SocialCardOwner; reason: 'no_source' | 'owner_not_found' | 'missing_content' }
  | { kind: 'failed'; owner: SocialCardOwner; error: string }

interface OwnerRecord {
  organization_id: string
  site_id: string
  title: string | null
  description: string | null
  label: string | null
  location: string | null
  updated_at: string | null
}

interface SiteRecord {
  organization_id: string
  id: string
  brand_name: string | null
  brand_description: string | null
  theme_id: string
  vertical: string
  updated_at: string | null
  brand_color: string | null
}

export type SocialCardPlacedAsset = StoredMediaPlacementItem

const SOCIAL_CARD_RENDERER_VERSION = 'social-card-v1'
type SocialCardEnv = UploadResolvedMediaInput['env'] & { NUXT_PUBLIC_PLATFORM_DOMAIN?: string }

const OWNER_SOURCE_SLOTS: Record<SocialCardOwner['owner_type'], readonly string[]> = {
  site: [],
  business_location: ['hero', 'gallery'],
  product: ['image', 'gallery'],
  post: ['cover', 'gallery'],
  blog_post: ['featured'],
  experience: ['gallery'],
  offering: ['thumbnail', 'hero', 'gallery'],
  platform_doc: ['featured'],
  review: ['portrait', 'gallery'],
  tenant_page: [],
}

export function socialCardRefreshOwnerForPlacement(placement: {
  owner_type: string
  owner_id: string
  slot: string
}): SocialCardOwner | null {
  if (placement.slot === 'social_card') return null
  switch (placement.owner_type) {
    case 'site':
      return placement.slot === 'logo' || placement.slot === 'favicon' || placement.slot === 'social_share'
        ? { owner_type: 'site', owner_id: placement.owner_id }
        : null
    case 'business_location':
    case 'product':
    case 'post':
    case 'blog_post':
    case 'experience':
    case 'offering':
    case 'platform_doc':
    case 'review':
    case 'tenant_page':
      return OWNER_SOURCE_SLOTS[placement.owner_type].includes(placement.slot)
        ? { owner_type: placement.owner_type, owner_id: placement.owner_id }
        : null
    default:
      return null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mediaUrl(asset: SocialCardPlacedAsset | null): string | null {
  if (!asset) return null
  if (asset.kind === 'video') return asset.thumbnail_url?.trim() || null
  return asset.kind === 'image' ? asset.public_url?.trim() || null : null
}

function ownerLabel(ownerType: SocialCardOwner['owner_type']): string | null {
  const labels: Record<SocialCardOwner['owner_type'], string | null> = {
    site: null,
    business_location: 'Location',
    product: 'Product',
    post: 'Update',
    blog_post: 'Article',
    experience: 'Experience',
    offering: 'Service',
    platform_doc: 'Documentation',
    review: 'Review',
    tenant_page: null,
  }
  return labels[ownerType]
}

async function loadOwner(db: DbClient, owner: SocialCardOwner): Promise<OwnerRecord | null> {
  switch (owner.owner_type) {
    case 'site':
      return await queryFirst<OwnerRecord>(db, `SELECT organization_id, id AS site_id,
        COALESCE(NULLIF(trim(seo_title), ''), NULLIF(trim(brand_name), '')) AS title,
        COALESCE(NULLIF(trim(seo_description), ''), NULLIF(trim(brand_description), '')) AS description,
        NULL AS label, NULL AS location, updated_at FROM sites WHERE id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'business_location':
      return await queryFirst<OwnerRecord>(db, `SELECT organization_id, site_id,
        COALESCE(NULLIF(trim(seo_title), ''), title) AS title,
        COALESCE(NULLIF(trim(seo_description), ''), NULLIF(trim(short_description), ''), NULLIF(trim(description), '')) AS description,
        'Location' AS label, city AS location, updated_at FROM business_locations WHERE id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'product':
      return await queryFirst<OwnerRecord>(db, `SELECT p.organization_id, p.site_id,
        COALESCE(NULLIF(trim(p.seo_title), ''), p.name) AS title,
        COALESCE(NULLIF(trim(p.seo_description), ''), NULLIF(trim(p.description), '')) AS description,
        'Product' AS label, bl.title AS location, p.updated_at
        FROM products p JOIN business_locations bl ON bl.id = p.location_id WHERE p.id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'post':
      return await queryFirst<OwnerRecord>(db, `SELECT p.organization_id, p.site_id,
        COALESCE(NULLIF(trim(p.seo_title), ''), NULLIF(trim(p.title), ''), 'Update') AS title,
        COALESCE(NULLIF(trim(p.seo_description), ''), NULLIF(trim(p.body), '')) AS description,
        'Update' AS label, bl.title AS location, p.updated_at
        FROM posts p LEFT JOIN business_locations bl ON bl.id = p.location_id WHERE p.id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'blog_post':
      return await queryFirst<OwnerRecord>(db, `SELECT organization_id, site_id,
        COALESCE(NULLIF(trim(seo_title), ''), title) AS title,
        COALESCE(NULLIF(trim(seo_description), ''), NULLIF(trim(excerpt), '')) AS description,
        'Article' AS label, NULL AS location, updated_at FROM blog_posts WHERE id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'experience':
      return await queryFirst<OwnerRecord>(db, `SELECT p.organization_id, p.site_id,
        COALESCE(NULLIF(trim(p.seo_title), ''), p.name) AS title,
        COALESCE(NULLIF(trim(p.seo_description), ''), NULLIF(trim(p.description), '')) AS description,
        'Experience' AS label, bl.title AS location, COALESCE(e.updated_at, p.updated_at) AS updated_at
        FROM experiences e JOIN products p ON p.id = e.id JOIN business_locations bl ON bl.id = p.location_id
        WHERE e.id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'offering':
      return await queryFirst<OwnerRecord>(db, `SELECT o.organization_id, o.site_id,
        COALESCE(NULLIF(trim(o.seo_title), ''), o.name) AS title,
        COALESCE(NULLIF(trim(o.seo_description), ''), NULLIF(trim(o.short_description), ''), NULLIF(trim(o.summary), '')) AS description,
        'Service' AS label, bl.title AS location, o.updated_at
        FROM offerings o LEFT JOIN business_locations bl ON bl.id = o.location_id WHERE o.id = ? LIMIT 1`, [owner.owner_id]) ?? null
    case 'platform_doc':
      return await queryFirst<OwnerRecord>(db, `SELECT ? AS organization_id, ? AS site_id,
        title, COALESCE(NULLIF(trim(seo_description), ''), NULLIF(trim(excerpt), '')) AS description,
        'Documentation' AS label, NULL AS location, updated_at FROM platform_docs WHERE id = ? LIMIT 1`,
      [PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID, owner.owner_id]) ?? null
    case 'review':
      return await queryFirst<OwnerRecord>(db, `SELECT organization_id, site_id,
        COALESCE(NULLIF(trim(title), ''), 'Review by ' || COALESCE(NULLIF(trim(author_name), ''), 'a customer')) AS title,
        NULLIF(trim(content), '') AS description, 'Review' AS label, NULL AS location, updated_at
        FROM reviews WHERE id = ? AND organization_id IS NOT NULL AND site_id IS NOT NULL LIMIT 1`, [owner.owner_id]) ?? null
    case 'tenant_page':
      return await queryFirst<OwnerRecord>(db, `SELECT v.organization_id, v.site_id,
        COALESCE(NULLIF(trim(v.seo_title), ''), v.title) AS title,
        COALESCE(NULLIF(trim(v.seo_description), ''), NULLIF(trim(v.summary), '')) AS description,
        NULL AS label, NULL AS location, v.updated_at FROM tenant_page_variants v WHERE v.id = ? LIMIT 1`, [owner.owner_id]) ?? null
    default: {
      const exhaustive: never = owner
      return exhaustive
    }
  }
}

async function loadSite(db: DbClient, siteId: string): Promise<SiteRecord | null> {
  return await queryFirst<SiteRecord>(db, `SELECT s.organization_id, s.id, s.brand_name, s.brand_description,
    s.theme_id, s.vertical, s.updated_at,
    (SELECT value FROM site_config WHERE site_id = s.id AND key = 'brand_color' LIMIT 1) AS brand_color
    FROM sites s WHERE s.id = ? LIMIT 1`, [siteId]) ?? null
}

async function loadPlacedAssets(db: DbClient, siteId: string, owner: SocialCardOwner): Promise<SocialCardPlacedAsset[]> {
  const ownerAssets = (await readMediaPlacements(db, {
    siteId,
    ownerType: owner.owner_type,
    ownerIds: [owner.owner_id],
  })).get(owner.owner_id) ?? []
  if (owner.owner_type === 'site') return ownerAssets
  const siteAssets = (await readMediaPlacements(db, {
    siteId,
    ownerType: 'site',
    ownerIds: [siteId],
  })).get(siteId) ?? []
  return [...ownerAssets, ...siteAssets]
}

function firstAsset(assets: SocialCardPlacedAsset[], owner: SocialCardOwner, slots: readonly string[]): SocialCardPlacedAsset | null {
  for (const slot of slots) {
    const asset = assets.find(item => item.owner_type === owner.owner_type
      && item.owner_id === owner.owner_id && item.slot === slot && mediaUrl(item))
    if (asset) return asset
  }
  return null
}

function siteAsset(assets: SocialCardPlacedAsset[], siteId: string, slot: string): SocialCardPlacedAsset | null {
  return assets.find(item => item.owner_type === 'site' && item.owner_id === siteId
    && item.slot === slot && mediaUrl(item)) ?? null
}

export function selectSocialCardPlacements(
  assets: SocialCardPlacedAsset[],
  owner: SocialCardOwner,
  siteId: string,
) {
  const ownerSource = firstAsset(assets, owner, OWNER_SOURCE_SLOTS[owner.owner_type])
  const socialShare = siteAsset(assets, siteId, 'social_share')
  const logo = siteAsset(assets, siteId, 'logo')
  const favicon = siteAsset(assets, siteId, 'favicon')
  const current = assets.find(item => item.owner_type === owner.owner_type
    && item.owner_id === owner.owner_id && item.slot === 'social_card') ?? null
  return { ownerSource, socialShare, logo, favicon, current, source: ownerSource ?? socialShare ?? logo }
}

export function buildSocialCardGenerationKey(input: {
  owner: SocialCardOwner
  ownerUpdatedAt: string | null
  siteUpdatedAt: string | null
  sourceAssetId: string
  sourceUpdatedAt: string | null
  logoAssetId: string | null
  faviconAssetId: string | null
  payload: SocialCardRenderPayload
}): string {
  return hashSocialCardGenerationInput(JSON.stringify({ renderer: SOCIAL_CARD_RENDERER_VERSION, ...input }))
}

function socialTemplate(site: SiteRecord): SocialTemplate {
  if (site.id === PLATFORM_SITE_ID) return 'platform'
  return resolvePublicTemplate({ themeId: site.theme_id, vertical: site.vertical }).slug
}

export async function refreshSocialCard(input: {
  db: DbClient
  env: SocialCardEnv
  owner: SocialCardOwner
  actorId?: string | null
}): Promise<SocialCardRefreshResult> {
  const { db, env, owner } = input
  try {
    const ownerRecord = await loadOwner(db, owner)
    if (!ownerRecord) return { kind: 'skipped', owner, reason: 'owner_not_found' }
    const site = await loadSite(db, ownerRecord.site_id)
    if (!site) return { kind: 'skipped', owner, reason: 'owner_not_found' }
    const title = ownerRecord.title?.trim()
    const siteName = site.brand_name?.trim() || (site.id === PLATFORM_SITE_ID ? 'KrabiClaw' : null)
    if (!title || !siteName) return { kind: 'skipped', owner, reason: 'missing_content' }

    const assets = await loadPlacedAssets(db, site.id, owner)
    const { logo, favicon, current, source } = selectSocialCardPlacements(assets, owner, site.id)
    const backgroundImageUrl = mediaUrl(source)
    if (!source || !backgroundImageUrl) return { kind: 'skipped', owner, reason: 'no_source' }

    const payload: SocialCardRenderPayload = {
      template: socialTemplate(site),
      title,
      description: truncateForSeo(ownerRecord.description, 160),
      siteName,
      label: ownerRecord.label ?? ownerLabel(owner.owner_type),
      location: ownerRecord.location,
      logoUrl: mediaUrl(logo),
      faviconUrl: mediaUrl(favicon),
      backgroundImageUrl,
      primaryColor: site.brand_color,
      secondaryColor: null,
    }
    const generationKey = buildSocialCardGenerationKey({
      owner,
      ownerUpdatedAt: ownerRecord.updated_at,
      siteUpdatedAt: site.updated_at,
      sourceAssetId: source.asset_id,
      sourceUpdatedAt: source.updated_at,
      logoAssetId: logo?.asset_id ?? null,
      faviconAssetId: favicon?.asset_id ?? null,
      payload,
    })
    if (current?.generation_key === generationKey && current.public_url) {
      return { kind: 'reused', owner, assetId: current.asset_id, publicUrl: current.public_url, generationKey }
    }

    const png = await renderOgImagePng(payload, { platformDomain: env.NUXT_PUBLIC_PLATFORM_DOMAIN })
    const uploaded = await uploadResolvedMediaToAssetStore({
      db,
      env,
      siteId: site.id,
      organizationId: site.organization_id,
      userId: input.actorId ?? null,
      buffer: Uint8Array.from(png),
      contentType: 'image/png',
      filename: 'social-card.png',
      source: 'generated',
      kind: 'image',
      altText: ownerRecord.title,
      fileSize: png.byteLength,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      generationKey,
    })

    try {
      await executeBatch(db, buildSingleMediaPlacementQueries({
        organizationId: site.organization_id,
        siteId: site.id,
        placement: { owner_type: owner.owner_type, owner_id: owner.owner_id, slot: 'social_card' },
        media: [{ asset_id: uploaded.assetId }],
      }), { operation: 'replace social card placement' })
    } catch (placementError) {
      try {
        await deleteMediaAsset(db, env, uploaded.assetId, site.id, input.actorId ?? null)
      } catch (cleanupError) {
        throw new AggregateError([placementError, cleanupError], 'Social card placement and cleanup failed')
      }
      throw placementError
    }

    if (current?.source === 'generated' && current.asset_id !== uploaded.assetId) {
      try {
        await deleteMediaAsset(db, env, current.asset_id, site.id, input.actorId ?? null)
      } catch (cleanupError) {
        console.warn('[social-card]', {
          stage: 'old_asset_cleanup',
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          assetId: current.asset_id,
          error: errorMessage(cleanupError),
        })
      }
    }
    return { kind: 'generated', owner, assetId: uploaded.assetId, publicUrl: uploaded.publicUrl, generationKey }
  } catch (error) {
    console.error('[social-card]', {
      stage: 'refresh',
      ownerType: owner.owner_type,
      ownerId: owner.owner_id,
      error: errorMessage(error),
    })
    return { kind: 'failed', owner, error: errorMessage(error) }
  }
}

export async function regenerateSiteSocialCards(input: {
  db: DbClient
  env: SocialCardEnv
  siteId: string
  actorId?: string | null
}): Promise<SocialCardRefreshResult[]> {
  let owners: Array<{ owner_type: SocialCardOwner['owner_type']; owner_id: string }>
  try {
    owners = await queryAll<{ owner_type: SocialCardOwner['owner_type']; owner_id: string }>(input.db, `
    SELECT 'site' AS owner_type, id AS owner_id FROM sites WHERE id = ?
    UNION ALL SELECT 'business_location', id FROM business_locations WHERE site_id = ? AND status = 'active'
    UNION ALL SELECT 'product', id FROM products WHERE site_id = ? AND is_visible = 1
    UNION ALL SELECT 'experience', id FROM experiences WHERE site_id = ?
    UNION ALL SELECT 'post', id FROM posts WHERE site_id = ? AND status = 'published'
    UNION ALL SELECT 'blog_post', id FROM blog_posts WHERE site_id = ? AND status = 'published'
    UNION ALL SELECT 'offering', id FROM offerings WHERE site_id = ?
    UNION ALL SELECT 'review', id FROM reviews WHERE site_id = ? AND status = 'approved'
    UNION ALL SELECT 'tenant_page', id FROM tenant_page_variants WHERE site_id = ?
    `, Array(9).fill(input.siteId))
    if (input.siteId === PLATFORM_SITE_ID) {
      const docs = await queryAll<{ owner_id: string }>(input.db, 'SELECT id AS owner_id FROM platform_docs')
      owners.push(...docs.map((row): SocialCardOwner => ({ owner_type: 'platform_doc', owner_id: row.owner_id })))
    }
  } catch (error) {
    console.error('[social-card]', { stage: 'regenerate_site', siteId: input.siteId, error: errorMessage(error) })
    return [{
      kind: 'failed',
      owner: { owner_type: 'site', owner_id: input.siteId },
      error: errorMessage(error),
    }]
  }

  const results: SocialCardRefreshResult[] = []
  for (const owner of owners) {
    results.push(await refreshSocialCard({ ...input, owner }))
  }
  return results
}
