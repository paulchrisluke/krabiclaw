import { execute, queryAll, type DbClient } from '~/server/db'
import { organizationAdapter } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'

export const PLATFORM_MEDIA_ORG_ID = 'platform'
export const PLATFORM_MEDIA_SITE_ID = 'platform'

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
  if (!(await adapter.findOrganizationBySlug(PLATFORM_MEDIA_ORG_ID))) {
    try {
      await adapter.createOrganization({
        organization: {
          id: PLATFORM_MEDIA_ORG_ID,
          name: 'KrabiClaw Platform',
          slug: PLATFORM_MEDIA_ORG_ID,
          createdAt: new Date(),
        },
      })
    } catch (error) {
      // A concurrent first caller may have created it between the check and here.
      if (!(await adapter.findOrganizationBySlug(PLATFORM_MEDIA_ORG_ID))) throw error
    }
  }

  const now = new Date().toISOString()
  await execute(db, `
    INSERT OR IGNORE INTO sites (id, organization_id, theme_id, theme, slug, status, onboarding_status, created_at, updated_at)
    VALUES (?, ?, 'saya-theme-v1', 'saya', ?, 'active', 'active', ?, ?)
  `, [PLATFORM_MEDIA_SITE_ID, PLATFORM_MEDIA_ORG_ID, PLATFORM_MEDIA_SITE_ID, now, now])
}

export async function listPlatformMediaAssets(
  db: DbClient,
  options: { id?: string; kind?: 'image' | 'video' | 'file'; limit?: number } = {},
): Promise<PlatformMediaAssetRecord[]> {
  const conditions = [`site_id = ?`, `status = 'active'`]
  const params: Array<string | number> = [PLATFORM_MEDIA_SITE_ID]

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
