import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFinalUnifiedMediaPreflightSql,
  buildLegacyColumnProbeSql,
  buildUnifiedMediaPreflightSql,
  parseWranglerJson,
  rowsHaveFailures,
} from '../../scripts/preflight-unified-media-migration.mjs'

test('unified media preflight includes every destructive migration blocker', () => {
  const sql = buildUnifiedMediaPreflightSql()
  for (const check of [
    'malformed_experience_gallery_json',
    'experience_gallery_items_missing_urls',
    'unsupported_experience_gallery_kinds',
    'missing_legacy_experience_asset_ids',
    'inactive_legacy_experience_assets',
    'cross_scope_legacy_experience_assets',
    'unmatched_experience_gallery_urls',
    'ambiguous_experience_gallery_urls',
    'unsupported_video_mime_records',
    'posterless_cover_videos',
    'dual_location_hero_assets',
    'dual_site_content_hero_assets',
  ]) {
    assert.match(sql, new RegExp(check))
  }
  assert.doesNotMatch(sql, /FROM experience_media/)
  assert.doesNotMatch(sql, /remaining_media_assets_old_table/)
})

test('unified media final preflight checks migrated media integrity', () => {
  const sql = buildFinalUnifiedMediaPreflightSql()
  for (const check of [
    'unsupported_video_mime_records',
    'posterless_cover_videos',
    'cross_scope_experience_media_assets',
    'orphaned_experience_media_rows',
  ]) {
    assert.match(sql, new RegExp(check))
  }
  assert.doesNotMatch(sql, /remaining_media_assets_old_table/)
})

test('unified media preflight probes for legacy experience columns', () => {
  const sql = buildLegacyColumnProbeSql()
  assert.match(sql, /image_asset_id/)
  assert.match(sql, /video_asset_id/)
  assert.match(sql, /images/)
  assert.match(sql, /experience_media/)
})

test('unified media preflight reports failures from wrangler json rows', () => {
  const rows = parseWranglerJson(JSON.stringify([{ results: [{ check_name: 'ambiguous_experience_gallery_urls', failures: 1 }] }]))
  assert.equal(rowsHaveFailures(rows), true)
})

test('unified media preflight passes empty wrangler json rows', () => {
  const rows = parseWranglerJson(JSON.stringify([{ results: [] }]))
  assert.equal(rowsHaveFailures(rows), false)
})
