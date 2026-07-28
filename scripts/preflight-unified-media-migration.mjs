#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

export function buildUnifiedMediaPreflightSql() {
  return `
WITH
experience_gallery AS (
  SELECT e.id AS experience_id, e.organization_id, e.site_id, e.image_asset_id, e.video_asset_id, e.images
  FROM experiences e
  WHERE e.image_asset_id IS NOT NULL
     OR e.video_asset_id IS NOT NULL
     OR (e.images IS NOT NULL AND trim(e.images) != '')
),
gallery_items AS (
  SELECT
    e.experience_id,
    e.organization_id,
    e.site_id,
    json_extract(item.value, '$.url') AS url,
    COALESCE(json_extract(item.value, '$.kind'), 'image') AS kind,
    item.key AS position
  FROM experience_gallery e, json_each(e.images) item
  WHERE json_valid(e.images)
),
url_matches AS (
  SELECT gi.experience_id, gi.position, gi.url, COUNT(ma.id) AS matches
  FROM gallery_items gi
  LEFT JOIN media_assets ma
    ON ma.organization_id = gi.organization_id
   AND ma.site_id = gi.site_id
   AND ma.public_url = gi.url
   AND ma.status = 'active'
   AND ma.kind IN ('image', 'video')
  WHERE gi.url IS NOT NULL AND trim(gi.url) != ''
  GROUP BY gi.experience_id, gi.position, gi.url
),
checks AS (
  SELECT 'malformed_experience_gallery_json' AS check_name, COUNT(*) AS failures
  FROM experience_gallery
  WHERE images IS NOT NULL AND trim(images) != '' AND NOT json_valid(images)
  UNION ALL
  SELECT 'experience_gallery_items_missing_urls', COUNT(*)
  FROM gallery_items
  WHERE url IS NULL OR trim(url) = ''
  UNION ALL
  SELECT 'unsupported_experience_gallery_kinds', COUNT(*)
  FROM gallery_items
  WHERE kind NOT IN ('image', 'video')
  UNION ALL
  SELECT 'missing_legacy_experience_asset_ids', COUNT(*)
  FROM (
    SELECT e.id
    FROM experiences e
    LEFT JOIN media_assets ma ON ma.id = e.image_asset_id
    WHERE e.image_asset_id IS NOT NULL AND ma.id IS NULL
    UNION ALL
    SELECT e.id
    FROM experiences e
    LEFT JOIN media_assets ma ON ma.id = e.video_asset_id
    WHERE e.video_asset_id IS NOT NULL AND ma.id IS NULL
  )
  UNION ALL
  SELECT 'inactive_legacy_experience_assets', COUNT(*)
  FROM (
    SELECT e.id
    FROM experiences e
    JOIN media_assets ma ON ma.id = e.image_asset_id
    WHERE e.image_asset_id IS NOT NULL AND ma.status != 'active'
    UNION ALL
    SELECT e.id
    FROM experiences e
    JOIN media_assets ma ON ma.id = e.video_asset_id
    WHERE e.video_asset_id IS NOT NULL AND ma.status != 'active'
  )
  UNION ALL
  SELECT 'cross_scope_legacy_experience_assets', COUNT(*)
  FROM (
    SELECT e.id
    FROM experiences e
    JOIN media_assets ma ON ma.id = e.image_asset_id
    WHERE e.image_asset_id IS NOT NULL AND (ma.organization_id != e.organization_id OR ma.site_id != e.site_id)
    UNION ALL
    SELECT e.id
    FROM experiences e
    JOIN media_assets ma ON ma.id = e.video_asset_id
    WHERE e.video_asset_id IS NOT NULL AND (ma.organization_id != e.organization_id OR ma.site_id != e.site_id)
  )
  UNION ALL
  SELECT 'unmatched_experience_gallery_urls', COUNT(*)
  FROM url_matches
  WHERE matches = 0
  UNION ALL
  SELECT 'ambiguous_experience_gallery_urls', COUNT(*)
  FROM url_matches
  WHERE matches > 1
  UNION ALL
  SELECT 'unsupported_video_mime_records', COUNT(*)
  FROM media_assets
  WHERE kind = 'video' AND COALESCE(mime_type, '') NOT IN ('video/mp4', 'video/webm')
  UNION ALL
  SELECT 'posterless_cover_videos', COUNT(*)
  FROM (
    SELECT e.id
    FROM experiences e
    JOIN media_assets ma ON ma.id = e.video_asset_id
    WHERE e.video_asset_id IS NOT NULL AND (ma.thumbnail_url IS NULL OR trim(ma.thumbnail_url) = '')
    UNION ALL
    SELECT em.experience_id
    FROM experience_media em
    JOIN media_assets ma ON ma.id = em.asset_id
    WHERE em.sort_order = 0 AND ma.kind = 'video' AND (ma.thumbnail_url IS NULL OR trim(ma.thumbnail_url) = '')
  )
  UNION ALL
  SELECT 'dual_location_hero_assets', COUNT(*)
  FROM business_locations
  WHERE hero_image_asset_id IS NOT NULL AND hero_video_asset_id IS NOT NULL
  UNION ALL
  SELECT 'dual_site_content_hero_assets', COUNT(*)
  FROM site_content
  WHERE hero_image_asset_id IS NOT NULL AND hero_video_asset_id IS NOT NULL
  UNION ALL
  SELECT 'remaining_media_assets_old_table', COUNT(*)
  FROM sqlite_master
  WHERE type = 'table' AND name = 'media_assets_old'
)
SELECT check_name, failures FROM checks WHERE failures > 0 ORDER BY check_name;
`.trim()
}

export function buildFinalUnifiedMediaPreflightSql() {
  return `
WITH checks AS (
  SELECT 'unsupported_video_mime_records' AS check_name, COUNT(*) AS failures
  FROM media_assets
  WHERE kind = 'video' AND COALESCE(mime_type, '') NOT IN ('video/mp4', 'video/webm')
  UNION ALL
  SELECT 'posterless_cover_videos', COUNT(*)
  FROM experience_media em
  JOIN media_assets ma ON ma.id = em.asset_id
  WHERE em.sort_order = 0 AND ma.kind = 'video' AND (ma.thumbnail_url IS NULL OR trim(ma.thumbnail_url) = '')
  UNION ALL
  SELECT 'cross_scope_experience_media_assets', COUNT(*)
  FROM experience_media em
  JOIN media_assets ma ON ma.id = em.asset_id
  WHERE ma.organization_id != em.organization_id OR ma.site_id != em.site_id
  UNION ALL
  SELECT 'orphaned_experience_media_rows', COUNT(*)
  FROM experience_media em
  LEFT JOIN experiences e
    ON e.organization_id = em.organization_id
   AND e.site_id = em.site_id
   AND e.id = em.experience_id
  WHERE e.id IS NULL
  UNION ALL
  SELECT 'remaining_media_assets_old_table', COUNT(*)
  FROM sqlite_master
  WHERE type = 'table' AND name = 'media_assets_old'
)
SELECT check_name, failures FROM checks WHERE failures > 0 ORDER BY check_name;
`.trim()
}

export function buildLegacyColumnProbeSql() {
  return `
SELECT COUNT(*) AS legacy_columns
FROM pragma_table_info('experiences')
WHERE name IN ('image_asset_id', 'video_asset_id', 'images');
`.trim()
}

export function parseWranglerJson(stdout) {
  const parsed = JSON.parse(stdout)
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return first?.results ?? first?.result?.[0]?.results ?? []
}

export function rowsHaveFailures(rows) {
  return rows.some(row => Number(row.failures ?? 0) > 0)
}

function runWrangler(command) {
  const result = spawnSync('wrangler', command, { encoding: 'utf8' })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    process.stdout.write(result.stdout)
    process.exit(result.status ?? 1)
  }
  return result.stdout
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const remote = args.includes('--remote')
  const envIndex = args.indexOf('--env')
  const envArgs = envIndex >= 0 && args[envIndex + 1] ? ['--env', args[envIndex + 1]] : []
  const baseCommand = [
    'd1',
    'execute',
    'DB',
    ...envArgs,
    ...(remote ? ['--remote'] : ['--local']),
    '--json',
  ]
  const probeRows = parseWranglerJson(runWrangler([
    ...baseCommand,
    '--command',
    buildLegacyColumnProbeSql(),
  ]))
  const hasLegacyColumns = Number(probeRows[0]?.legacy_columns ?? 0) > 0
  const rows = parseWranglerJson(runWrangler([
    ...baseCommand,
    '--command',
    hasLegacyColumns ? buildUnifiedMediaPreflightSql() : buildFinalUnifiedMediaPreflightSql(),
  ]))
  if (rows.length) {
    console.table(rows)
  } else {
    console.log('Unified media migration preflight passed.')
  }
  process.exit(rowsHaveFailures(rows) ? 1 : 0)
}
