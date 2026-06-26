import { executeBatch, queryAll, type DbClient } from '~/server/db'

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

export async function ensurePlatformMediaScope(db: DbClient): Promise<void> {
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `
        INSERT OR IGNORE INTO organization (id, name, slug, createdAt)
        VALUES (?, ?, ?, ?)
      `,
      params: [PLATFORM_MEDIA_ORG_ID, 'KrabiClaw Platform', PLATFORM_MEDIA_ORG_ID, now],
    },
    {
      query: `
        INSERT OR IGNORE INTO sites (id, organization_id, theme_id, theme, slug, status, onboarding_status, created_at, updated_at)
        VALUES (?, ?, 'saya-theme-v1', 'saya', ?, 'active', 'active', ?, ?)
      `,
      params: [PLATFORM_MEDIA_SITE_ID, PLATFORM_MEDIA_ORG_ID, PLATFORM_MEDIA_SITE_ID, now, now],
    },
  ])
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
