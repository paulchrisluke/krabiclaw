#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

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
  FROM (
    SELECT *
    FROM experience_gallery
    WHERE images IS NOT NULL AND trim(images) != '' AND json_valid(images)
  ) e, json_each(e.images) item
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
checks(check_name, failures) AS (
  VALUES
    ('malformed_experience_gallery_json', (
      SELECT COUNT(*)
      FROM experience_gallery
      WHERE images IS NOT NULL AND trim(images) != '' AND NOT json_valid(images)
    )),
    ('experience_gallery_items_missing_urls', (
      SELECT COUNT(*)
      FROM gallery_items
      WHERE url IS NULL OR trim(url) = ''
    )),
    ('unsupported_experience_gallery_kinds', (
      SELECT COUNT(*)
      FROM gallery_items
      WHERE kind NOT IN ('image', 'video')
    )),
    ('missing_legacy_experience_asset_ids', (
      SELECT
        (SELECT COUNT(*) FROM experiences e LEFT JOIN media_assets ma ON ma.id = e.image_asset_id WHERE e.image_asset_id IS NOT NULL AND ma.id IS NULL)
        + (SELECT COUNT(*) FROM experiences e LEFT JOIN media_assets ma ON ma.id = e.video_asset_id WHERE e.video_asset_id IS NOT NULL AND ma.id IS NULL)
    )),
    ('inactive_legacy_experience_assets', (
      SELECT
        (SELECT COUNT(*) FROM experiences e JOIN media_assets ma ON ma.id = e.image_asset_id WHERE e.image_asset_id IS NOT NULL AND ma.status != 'active')
        + (SELECT COUNT(*) FROM experiences e JOIN media_assets ma ON ma.id = e.video_asset_id WHERE e.video_asset_id IS NOT NULL AND ma.status != 'active')
    )),
    ('cross_scope_legacy_experience_assets', (
      SELECT
        (SELECT COUNT(*) FROM experiences e JOIN media_assets ma ON ma.id = e.image_asset_id WHERE e.image_asset_id IS NOT NULL AND (ma.organization_id != e.organization_id OR ma.site_id != e.site_id))
        + (SELECT COUNT(*) FROM experiences e JOIN media_assets ma ON ma.id = e.video_asset_id WHERE e.video_asset_id IS NOT NULL AND (ma.organization_id != e.organization_id OR ma.site_id != e.site_id))
    )),
    ('unmatched_experience_gallery_urls', (
      SELECT COUNT(*)
      FROM url_matches
      WHERE matches = 0
    )),
    ('ambiguous_experience_gallery_urls', (
      SELECT COUNT(*)
      FROM url_matches
      WHERE matches > 1
    )),
    ('unsupported_video_mime_records', (
      SELECT COUNT(*)
      FROM media_assets
      WHERE kind = 'video' AND COALESCE(mime_type, '') NOT IN ('video/mp4', 'video/webm')
    )),
    ('posterless_cover_videos', (
      SELECT COUNT(*)
      FROM experiences e
      JOIN media_assets ma ON ma.id = e.video_asset_id
      WHERE e.video_asset_id IS NOT NULL AND (ma.thumbnail_url IS NULL OR trim(ma.thumbnail_url) = '')
    )),
    ('dual_location_hero_assets', (
      SELECT COUNT(*)
      FROM business_locations
      WHERE hero_image_asset_id IS NOT NULL AND hero_video_asset_id IS NOT NULL
    ))
)
SELECT check_name, failures FROM checks WHERE failures > 0 ORDER BY check_name;
`.trim()
}

export function buildFinalUnifiedMediaPreflightSql() {
  return `
WITH checks(check_name, failures) AS (
  VALUES
    ('legacy_experience_media_columns_present', (
      SELECT COUNT(*)
      FROM pragma_table_info('experiences')
      WHERE name IN ('image_asset_id', 'video_asset_id', 'images')
    )),
    ('legacy_location_hero_columns_present', (
      SELECT COUNT(*)
      FROM pragma_table_info('business_locations')
      WHERE name IN ('hero_image_asset_id', 'hero_video_asset_id')
    )),
    ('legacy_media_assets_old_table_present', (
      SELECT COUNT(*)
      FROM sqlite_master
      WHERE type = 'table' AND name = 'media_assets_old'
    )),
    ('legacy_media_assets_old_sync_triggers_present', (
      SELECT COUNT(*)
      FROM sqlite_master
      WHERE type = 'trigger' AND name IN (
        'sync_media_assets_old_delete',
        'sync_media_assets_old_insert',
        'sync_media_assets_old_update'
      )
    )),
    ('legacy_media_assets_old_foreign_keys_present', (
      SELECT
        (SELECT COUNT(*) FROM pragma_foreign_key_list('business_locations') WHERE "table" = 'media_assets_old')
        + (SELECT COUNT(*) FROM pragma_foreign_key_list('blog_posts') WHERE "table" = 'media_assets_old')
        + (SELECT COUNT(*) FROM pragma_foreign_key_list('menu_items') WHERE "table" = 'media_assets_old')
        + (SELECT COUNT(*) FROM pragma_foreign_key_list('platform_docs') WHERE "table" = 'media_assets_old')
        + (SELECT COUNT(*) FROM pragma_foreign_key_list('posts') WHERE "table" = 'media_assets_old')
    )),
    ('unsupported_video_mime_records', (
      SELECT COUNT(*)
      FROM media_assets
      WHERE kind = 'video' AND COALESCE(mime_type, '') NOT IN ('video/mp4', 'video/webm')
    )),
    ('posterless_cover_videos', (
      SELECT COUNT(*)
      FROM experience_media em
      JOIN media_assets ma ON ma.id = em.asset_id
      WHERE em.sort_order = 0 AND ma.kind = 'video' AND (ma.thumbnail_url IS NULL OR trim(ma.thumbnail_url) = '')
    )),
    ('cross_scope_experience_media_assets', (
      SELECT COUNT(*)
      FROM experience_media em
      JOIN media_assets ma ON ma.id = em.asset_id
      WHERE ma.organization_id != em.organization_id OR ma.site_id != em.site_id
    )),
    ('orphaned_experience_media_rows', (
      SELECT COUNT(*)
      FROM experience_media em
      LEFT JOIN experiences e
        ON e.organization_id = em.organization_id
       AND e.site_id = em.site_id
       AND e.id = em.experience_id
      WHERE e.id IS NULL
    ))
)
SELECT check_name, failures FROM checks WHERE failures > 0 ORDER BY check_name;
`.trim()
}

export function buildLegacyColumnProbeSql() {
  return `
SELECT
  (
    SELECT COUNT(*)
    FROM pragma_table_info('experiences')
    WHERE name IN ('image_asset_id', 'video_asset_id', 'images')
  ) AS legacy_experience_columns,
  (
    SELECT COUNT(*)
    FROM pragma_table_info('experiences')
    WHERE name IN ('image_asset_id', 'video_asset_id', 'images')
  )
  + (
    SELECT COUNT(*)
    FROM pragma_table_info('business_locations')
    WHERE name IN ('hero_image_asset_id', 'hero_video_asset_id')
  )
  + (
    SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'table' AND name = 'media_assets_old'
  )
  + (
    SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'trigger' AND name IN (
      'sync_media_assets_old_delete',
      'sync_media_assets_old_insert',
      'sync_media_assets_old_update'
    )
  )
  + (
    SELECT
      (SELECT COUNT(*) FROM pragma_foreign_key_list('business_locations') WHERE "table" = 'media_assets_old')
      + (SELECT COUNT(*) FROM pragma_foreign_key_list('blog_posts') WHERE "table" = 'media_assets_old')
      + (SELECT COUNT(*) FROM pragma_foreign_key_list('menu_items') WHERE "table" = 'media_assets_old')
      + (SELECT COUNT(*) FROM pragma_foreign_key_list('platform_docs') WHERE "table" = 'media_assets_old')
      + (SELECT COUNT(*) FROM pragma_foreign_key_list('posts') WHERE "table" = 'media_assets_old')
  ) AS legacy_objects,
  (
    SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'table' AND name = 'experience_media'
  ) AS experience_media_tables;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
  const hasLegacyExperienceColumns = Number(probeRows[0]?.legacy_experience_columns ?? 0) > 0
  const hasExperienceMedia = Number(probeRows[0]?.experience_media_tables ?? 0) > 0
  const rows = parseWranglerJson(runWrangler([
    ...baseCommand,
    '--command',
    hasLegacyExperienceColumns && !hasExperienceMedia ? buildUnifiedMediaPreflightSql() : buildFinalUnifiedMediaPreflightSql(),
  ]))
  if (rows.length) {
    console.table(rows)
  } else {
    console.log('Unified media migration preflight passed.')
  }
  process.exit(rowsHaveFailures(rows) ? 1 : 0)
}
