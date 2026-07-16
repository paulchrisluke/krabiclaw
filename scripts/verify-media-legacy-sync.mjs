import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler')
const canaryId = 'media-local-legacy-sync-canary'

function execute(sql) {
  const output = execFileSync(wrangler, ['d1', 'execute', 'DB', '--local', '--command', sql, '--json'], {
    cwd: root,
    encoding: 'utf8',
  })
  return JSON.parse(output)
}

const fixture = execute(`
  SELECT id, organization_id, site_id
  FROM business_locations
  WHERE hero_image_asset_id IS NULL
  LIMIT 1;
`)[0]?.results?.[0]

assert.ok(fixture, 'A seeded location with no hero image is required for the legacy media FK canary')

try {
  execute(`
    DELETE FROM media_assets WHERE id = '${canaryId}';
    INSERT INTO media_assets (
      id, organization_id, site_id, location_id, kind, provider, source,
      public_url, mime_type, file_name, category, status
    ) VALUES (
      '${canaryId}', '${fixture.organization_id}', '${fixture.site_id}', '${fixture.id}',
      'image', 'external_url', 'template_stock', 'https://example.invalid/media-canary.jpg',
      'image/jpeg', 'media-canary.jpg', 'blog', 'active'
    );
  `)

  const mirror = execute(`
    SELECT id, source, category
    FROM media_assets_old
    WHERE id = '${canaryId}';
  `)[0]?.results?.[0]
  assert.deepEqual(mirror, { id: canaryId, source: 'external', category: 'other' })

  execute(`
    UPDATE business_locations
    SET hero_image_asset_id = '${canaryId}'
    WHERE id = '${fixture.id}';
  `)
  const assignment = execute(`
    SELECT hero_image_asset_id
    FROM business_locations
    WHERE id = '${fixture.id}';
  `)[0]?.results?.[0]
  assert.equal(assignment?.hero_image_asset_id, canaryId)

  const triggers = execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'trigger' AND name IN (
      'sync_media_assets_old_insert',
      'sync_media_assets_old_update',
      'sync_media_assets_old_delete'
    )
    ORDER BY name;
  `)[0]?.results ?? []
  assert.equal(triggers.length, 3, 'All three media compatibility sync triggers must exist')

  execute(`
    UPDATE media_assets
    SET category = 'menu'
    WHERE id = '${canaryId}';
  `)
  const updatedMirror = execute(`
    SELECT category
    FROM media_assets_old
    WHERE id = '${canaryId}';
  `)[0]?.results?.[0]
  assert.equal(updatedMirror?.category, 'menu')

  execute(`
    DELETE FROM media_assets
    WHERE id = '${canaryId}';
  `)
  const deletedMirror = execute(`
    SELECT id
    FROM media_assets_old
    WHERE id = '${canaryId}';
  `)[0]?.results?.[0]
  assert.equal(deletedMirror, undefined)
} finally {
  execute(`
    UPDATE business_locations
    SET hero_image_asset_id = NULL
    WHERE id = '${fixture.id}' AND hero_image_asset_id = '${canaryId}';
    DELETE FROM media_assets WHERE id = '${canaryId}';
  `)
}

console.log('Media legacy-sync schema canary passed.')
