import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeTenantPageBlocks, validateTenantPageSnapshot } from '../../utils/tenant-page-blocks.ts'
import { replaceStoryImageBlock } from '../../server/utils/media-placement.ts'

test('tenant page image blocks only persist canonical asset IDs', () => {
  assert.throws(
    () => normalizeTenantPageBlocks([{ type: 'image', data: { url: 'https://example.com/image.jpg' } }]),
    /image\.url is not canonical; use image\.asset_id/,
  )
  assert.throws(
    () => normalizeTenantPageBlocks([{ type: 'image', data: { asset_id: '' } }]),
    /image\.asset_id is required/,
  )
  assert.deepEqual(
    normalizeTenantPageBlocks([{ id: 'story', type: 'image', data: { asset_id: ' media-story ', alt: 'Our story' } }]),
    [{ id: 'story', type: 'image', position: 0, data: { asset_id: 'media-story', alt: 'Our story' } }],
  )
  assert.throws(
    () => validateTenantPageSnapshot({
      schemaVersion: 1,
      metadata: {
        locale: 'en',
        path: '/about',
        title: 'About',
        summary: null,
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        robots: null,
        pageType: 'system',
        recipe: 'about',
      },
      blocks: [{ id: 'story', type: 'image', position: 0, data: { url: 'legacy-value' } }],
    }),
    /image\.url is not canonical/,
  )
})

test('MCP and CMS story placement share one canonical add, replace, and clear shape', () => {
  const prose = { id: 'body', type: 'markdown', position: 0, data: { markdown: 'Story' } }
  const added = replaceStoryImageBlock([prose], 'media-story')
  assert.deepEqual(added, [
    prose,
    {
      id: added[1]!.id,
      type: 'image',
      position: 1,
      data: { field: 'story.image', asset_id: 'media-story', alt: 'Story image' },
    },
  ])
  const replaced = replaceStoryImageBlock([
    prose,
    {
      id: 'story',
      type: 'image',
      position: 1,
      data: { field: 'story.image', asset_id: 'old-media', url: 'https://legacy.example/image.jpg', alt: 'Story' },
    },
  ], 'new-media')
  assert.deepEqual(replaced, [
    prose,
    {
      id: 'story',
      type: 'image',
      position: 1,
      data: { field: 'story.image', asset_id: 'new-media', alt: 'Story' },
    },
  ])
  assert.deepEqual(replaceStoryImageBlock(replaced, null), [prose])
})

test('0106 repairs every legacy tenant-page image shape in documents and revisions', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE media_assets (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      public_url TEXT,
      cloudflare_image_id TEXT
    );
    CREATE TABLE tenant_pages (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      path TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE tenant_page_variants (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      draft_document_id TEXT NOT NULL,
      published_path TEXT NOT NULL,
      draft_path TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE content_documents (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL
    );
    CREATE TABLE content_blocks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE content_revisions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    );
    CREATE TABLE public_resource_cache_invalidations (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE site_config (
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT
    );
    CREATE TABLE __um_tenant_page_media_map (stale TEXT);
    CREATE TABLE __um_tenant_page_media_affected_sites (stale TEXT);
    CREATE TABLE __um_assert_0106 (stale TEXT);
    CREATE TABLE __um_tenant_page_block_media_repairs (stale TEXT);
    CREATE TABLE __um_tenant_page_revision_media_repairs (stale TEXT);
  `)

  const assets = [
    ['media-demo-team-1', 'site-demo', 'https://images.example/demo', 'demo-image'],
    ['media-kiku-about', 'site-kikuzuki', 'https://images.example/kiku', 'kiku-image'],
    ['media-ph-team', 'site-pottery-house', 'https://images.example/pottery', 'pottery-image'],
    ['media-generic', 'site-generic', 'https://images.example/generic', 'generic-image'],
  ]
  const insertAsset = db.prepare('INSERT INTO media_assets (id, site_id, kind, status, public_url, cloudflare_image_id) VALUES (?, ?, \'image\', \'active\', ?, ?)')
  for (const asset of assets) insertAsset.run(...asset)
  db.prepare('INSERT INTO site_config (organization_id, site_id, key, value) VALUES (?, ?, ?, ?)').run(
    'org-demo',
    'site-demo',
    'hero_image_url',
    'https://legacy.example/hero.jpg',
  )
  db.prepare('INSERT INTO site_config (organization_id, site_id, key, value) VALUES (?, ?, ?, ?)').run(
    'org-demo',
    'site-demo',
    'brand_color',
    '#123456',
  )

  const cases = [
    {
      siteId: 'site-demo',
      title: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cad82f19-5ecd-43cd-8781-606a59256000/public',
      data: { field: 'story.image', url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cad82f19-5ecd-43cd-8781-606a59256000/public' },
      expectedAssetId: 'media-demo-team-1',
    },
    {
      siteId: 'site-kikuzuki',
      title: 'About',
      data: { field: 'story.image', url: null },
      expectedAssetId: 'media-kiku-about',
    },
    {
      siteId: 'site-pottery-house',
      title: 'About',
      data: { field: 'story.image', url: '2aaf5d75-8459-46a5-8b8a-a4f517adf706' },
      expectedAssetId: 'media-ph-team',
    },
    {
      siteId: 'site-generic',
      title: 'About',
      data: { field: 'story.image', url: 'media-generic' },
      expectedAssetId: 'media-generic',
    },
    {
      siteId: 'site-empty',
      title: 'About',
      data: { field: 'story.image', url: null },
      expectedAssetId: null,
    },
  ]
  for (const entry of cases) {
    const pageId = `page-${entry.siteId}`
    const variantId = `variant-${entry.siteId}`
    const documentId = `document-${entry.siteId}`
    const blockId = `block-${entry.siteId}`
    db.prepare('INSERT INTO tenant_pages (id, site_id, path, title) VALUES (?, ?, \'/about\', ?)').run(pageId, entry.siteId, entry.title)
    db.prepare('INSERT INTO tenant_page_variants (id, site_id, draft_document_id, published_path, draft_path, title) VALUES (?, ?, ?, \'/about\', \'/about\', ?)').run(variantId, entry.siteId, documentId, entry.title)
    db.prepare('INSERT INTO content_documents (id, owner_type, owner_id) VALUES (?, \'tenant_page\', ?)').run(documentId, variantId)
    db.prepare('INSERT INTO content_blocks (id, document_id, type, data_json) VALUES (?, ?, \'image\', ?)').run(blockId, documentId, JSON.stringify(entry.data))
    db.prepare('INSERT INTO content_revisions (id, document_id, snapshot_json) VALUES (?, ?, ?)').run(
      `revision-${entry.siteId}`,
      documentId,
      JSON.stringify({
        schemaVersion: 1,
        metadata: {
          locale: 'en',
          path: '/about',
          title: entry.title,
          summary: null,
          seoTitle: null,
          seoDescription: null,
          canonicalUrl: null,
          robots: null,
          pageType: 'system',
          recipe: 'about',
        },
        blocks: [
          { id: 'intro', type: 'markdown', position: 0, data: { markdown: 'Story' } },
          { id: blockId, type: 'image', position: 1, data: entry.data },
        ],
      }),
    )
  }
  db.prepare('INSERT INTO content_blocks (id, document_id, type, data_json) VALUES (?, ?, \'image\', ?)').run(
    'block-site-kikuzuki-empty-other',
    'document-site-kikuzuki',
    JSON.stringify({ field: 'gallery.image', url: null }),
  )
  const kikuRevision = db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get('revision-site-kikuzuki') as { snapshot_json: string }
  const kikuSnapshot = JSON.parse(kikuRevision.snapshot_json) as { blocks: Array<Record<string, unknown>> }
  kikuSnapshot.blocks.push({
    id: 'block-site-kikuzuki-empty-other',
    type: 'image',
    position: 2,
    data: { field: 'gallery.image', url: null },
  })
  db.prepare('UPDATE content_revisions SET snapshot_json = ? WHERE id = ?').run(
    JSON.stringify(kikuSnapshot),
    'revision-site-kikuzuki',
  )

  const migration = readFileSync(resolve(process.cwd(), 'migrations/0106_canonical_tenant_page_media.sql'), 'utf8')
    .replaceAll('--> statement-breakpoint', '')
  db.exec(migration)

  for (const entry of cases) {
    const block = db.prepare('SELECT data_json FROM content_blocks WHERE id = ?').get(`block-${entry.siteId}`) as { data_json: string } | undefined
    const revision = db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(`revision-${entry.siteId}`) as { snapshot_json: string }
    const snapshot = JSON.parse(revision.snapshot_json) as { metadata: { title: string }; blocks: Array<{ id: string; type: string; data: Record<string, unknown> }> }
    const image = snapshot.blocks.find(item => item.type === 'image')
    assert.equal(snapshot.blocks[0]?.id, 'intro')
    if (entry.expectedAssetId) {
      assert.deepEqual(block && JSON.parse(block.data_json), { field: 'story.image', asset_id: entry.expectedAssetId })
      assert.equal(image?.data.asset_id, entry.expectedAssetId)
      assert.equal('url' in (image?.data ?? {}), false)
    } else {
      assert.equal(block, undefined)
      assert.equal(image, undefined)
    }
  }
  assert.equal(
    (db.prepare('SELECT title FROM tenant_pages WHERE site_id = \'site-demo\'').get() as { title: string }).title,
    'About',
  )
  assert.equal(
    (db.prepare('SELECT title FROM tenant_page_variants WHERE site_id = \'site-demo\'').get() as { title: string }).title,
    'About',
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM public_resource_cache_invalidations').get() as { count: number }).count,
    cases.length,
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM site_config WHERE key IN (\'hero_image_url\', \'location_hero_image_url\')').get() as { count: number }).count,
    0,
  )
  assert.equal(
    (db.prepare('SELECT value FROM site_config WHERE key = \'brand_color\'').get() as { value: string }).value,
    '#123456',
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM content_blocks WHERE id = ?').get('block-site-kikuzuki-empty-other') as { count: number }).count,
    0,
  )
  const repairedKikuRevision = db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get('revision-site-kikuzuki') as { snapshot_json: string }
  assert.equal(
    (JSON.parse(repairedKikuRevision.snapshot_json) as { blocks: Array<{ id: string }> }).blocks.some(block => block.id === 'block-site-kikuzuki-empty-other'),
    false,
  )
  db.close()
})
