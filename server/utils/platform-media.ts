import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { organizationAdapter } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID } from '~/shared/platform-scope'
import { buildSingleMediaPlacementQueries } from '~/server/utils/media-asset-manager'
import { buildR2Key, uploadToR2 } from '~/server/utils/cloudflare-r2'
import platformLogoBase64 from '~/server/assets/platform-logo'

const PLATFORM_LOGO_ASSET_ID = 'platform-logo'
const PLATFORM_LOGO_FILENAME = 'krabi-claw-logo.png'

function platformLogoBytes(): Uint8Array {
  return Uint8Array.from(atob(platformLogoBase64), char => char.charCodeAt(0))
}

async function ensurePlatformLogoPlacement(env: CloudflareEnv, db: DbClient, now: string): Promise<void> {
  const current = await queryFirst<{ id: string }>(db, `
    SELECT ma.id
      FROM media_placements mp
      JOIN media_assets ma
        ON ma.organization_id = mp.organization_id
       AND ma.site_id = mp.site_id
       AND ma.id = mp.asset_id
     WHERE mp.organization_id = ? AND mp.site_id = ?
       AND mp.owner_type = 'site' AND mp.owner_id = ? AND mp.slot = 'logo'
       AND mp.status = 'active' AND ma.status = 'active' AND ma.generation_key IS NULL
     LIMIT 1
  `, [PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID, PLATFORM_SITE_ID])
  if (current) return

  const existingAsset = await queryFirst<{ organization_id: string; site_id: string }>(
    db,
    'SELECT organization_id, site_id FROM media_assets WHERE id = ? LIMIT 1',
    [PLATFORM_LOGO_ASSET_ID],
  )
  if (existingAsset && (
    existingAsset.organization_id !== PLATFORM_ORGANIZATION_ID
    || existingAsset.site_id !== PLATFORM_SITE_ID
  )) {
    throw new Error(`Reserved platform logo asset ID is already owned by ${existingAsset.organization_id}/${existingAsset.site_id}`)
  }

  const bytes = platformLogoBytes()
  const r2Key = buildR2Key(PLATFORM_SITE_ID, PLATFORM_LOGO_ASSET_ID, PLATFORM_LOGO_FILENAME)
  const publicUrl = await uploadToR2(env, r2Key, bytes, 'image/png')
  await execute(db, `
    INSERT INTO media_assets (
      id, organization_id, site_id, kind, provider, source, r2_key, public_url,
      mime_type, file_name, file_size, width, height, alt_text, category, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'image', 'cloudflare_r2', 'external', ?, ?,
              'image/png', ?, ?, 512, 512, 'KrabiClaw', 'logo', 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      provider = excluded.provider,
      source = excluded.source,
      generation_key = NULL,
      cloudflare_image_id = NULL,
      r2_key = excluded.r2_key,
      public_url = excluded.public_url,
      thumbnail_url = NULL,
      mime_type = excluded.mime_type,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      width = excluded.width,
      height = excluded.height,
      alt_text = excluded.alt_text,
      category = excluded.category,
      status = excluded.status,
      updated_at = excluded.updated_at
  `, [
    PLATFORM_LOGO_ASSET_ID,
    PLATFORM_ORGANIZATION_ID,
    PLATFORM_SITE_ID,
    r2Key,
    publicUrl,
    PLATFORM_LOGO_FILENAME,
    bytes.byteLength,
    now,
    now,
  ])
  await executeBatch(db, buildSingleMediaPlacementQueries({
    organizationId: PLATFORM_ORGANIZATION_ID,
    siteId: PLATFORM_SITE_ID,
    placement: { owner_type: 'site', owner_id: PLATFORM_SITE_ID, slot: 'logo' },
    media: [{ asset_id: PLATFORM_LOGO_ASSET_ID }],
    now,
  }))
}

export interface PlatformMediaAssetRecord {
  id: string
  public_url: string | null
  thumbnail_url: string | null
  alt_text: string | null
  kind: 'image' | 'video' | 'file'
  provider: string
  source: string
  mime_type: string | null
  file_name: string | null
  width: number | null
  height: number | null
  created_at: string
  updated_at: string
}

// Platform media (docs screenshots, marketing assets, the ChatGPT app icon,
// etc.) has no tenant owner, but media_assets/media_placements still require
// an organization_id/site_id. The reserved 'platform' organization+site below
// is purely infrastructure scope — never a tenant, never member-owned, never
// reachable through a dashboard org-switcher — so it is created through Better
// Auth's own organization adapter (not raw SQL against Better Auth's table),
// with no owner member: nothing resolves membership against this org, only
// its bare existence for the FK is needed. `sites` is KrabiClaw's own table,
// so writing it directly is fine.
export async function ensurePlatformMediaScope(env: CloudflareEnv, db: DbClient): Promise<void> {
  const adapter = await organizationAdapter(env)
  if (!(await adapter.findOrganizationBySlug(PLATFORM_ORGANIZATION_ID))) {
    try {
      await adapter.createOrganization({
        organization: {
          id: PLATFORM_ORGANIZATION_ID,
          name: 'KrabiClaw Platform',
          slug: PLATFORM_ORGANIZATION_ID,
          createdAt: new Date(),
        },
      })
    } catch (error) {
      // A concurrent first caller may have created it between the check and here.
      if (!(await adapter.findOrganizationBySlug(PLATFORM_ORGANIZATION_ID))) throw error
    }
  }

  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO sites (id, organization_id, theme_id, theme, slug, brand_name, status, onboarding_status, created_at, updated_at)
    VALUES (?, ?, 'saya-theme-v1', 'saya', ?, 'KrabiClaw', 'active', 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      brand_name = excluded.brand_name,
      updated_at = excluded.updated_at
    WHERE sites.brand_name IS NULL OR trim(sites.brand_name) <> excluded.brand_name
  `, [PLATFORM_SITE_ID, PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID, now, now])
  await ensurePlatformLogoPlacement(env, db, now)
}

export async function listPlatformMediaAssets(
  db: DbClient,
  options: { id?: string; kind?: 'image' | 'video' | 'file'; limit?: number } = {},
): Promise<PlatformMediaAssetRecord[]> {
  const conditions = [`site_id = ?`, `status = 'active'`, `generation_key IS NULL`]
  const params: Array<string | number> = [PLATFORM_SITE_ID]

  if (options.id) {
    conditions.push('id = ?')
    params.push(options.id)
  }

  if (options.kind) {
    conditions.push('kind = ?')
    params.push(options.kind)
  }

  params.push(Math.min(Math.max(options.limit ?? 50, 1), 100))

  return await queryAll<PlatformMediaAssetRecord>(
    db,
    `SELECT id, public_url, thumbnail_url, alt_text, kind, provider, source,
            mime_type, file_name, width, height, created_at, updated_at
     FROM media_assets
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ?`,
    params,
  )
}
