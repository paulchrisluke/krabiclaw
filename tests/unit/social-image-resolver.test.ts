import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'
import { MEDIA_PLACEMENT_OWNER_CHECK_SQL, MEDIA_PLACEMENT_SLOT_CHECK_SQL } from '../../shared/media-placement-contract.ts'

type SqliteDb = InstanceType<typeof Database>

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    source TEXT NOT NULL,
    cloudflare_image_id TEXT,
    r2_key TEXT,
    public_url TEXT,
    thumbnail_url TEXT,
    mime_type TEXT,
    file_name TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    alt_text TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by_user_id TEXT,
    created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
  );
  CREATE TABLE media_placements (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    owner_type TEXT NOT NULL CHECK (${MEDIA_PLACEMENT_OWNER_CHECK_SQL}),
    owner_id TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (${MEDIA_PLACEMENT_SLOT_CHECK_SQL}),
    asset_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'rejected')),
    source_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => sqlite.prepare(query).all(...params) as T[],
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (sqlite.prepare(query).get(...params) as T | undefined) ?? null,
    execute: async (sqlite: SqliteDb, query: string, params: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...params)
      return { meta: { changes: Number(result.changes) } }
    },
    executeBatch: async (sqlite: SqliteDb, batch: Array<{ query: string; params?: unknown[] }>) => {
      const transaction = sqlite.transaction((statements: Array<{ query: string; params?: unknown[] }>) => statements.map((statement) => {
        const result = sqlite.prepare(statement.query).run(...(statement.params ?? []))
        return { meta: { changes: Number(result.changes) } }
      }))
      return transaction(batch)
    },
  },
})
mock.module('../../server/utils/platform-media.ts', {
  namedExports: {
    PLATFORM_MEDIA_ORG_ID: 'platform',
    PLATFORM_MEDIA_SITE_ID: 'platform',
  },
})

const { resolveSocialImageBackground, SocialImageResolutionError } = await import('../../server/utils/social-image-resolver.ts?resolver-test')

const ORG = 'org-1'
const SITE = 'site-1'
let assetCounter = 0
const now = '2026-01-01T00:00:00.000Z'

function insertAsset(input: { siteId?: string; kind?: string; publicUrl?: string; thumbnailUrl?: string | null }) {
  const id = `asset-${++assetCounter}`
  db.prepare(`INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, public_url, thumbnail_url) VALUES (?, ?, ?, ?, 'cloudflare_images', 'uploaded', ?, ?)`)
    .run(id, ORG, input.siteId ?? SITE, input.kind ?? 'image', input.publicUrl ?? `https://images.example/${id}`, input.thumbnailUrl ?? null)
  return id
}

function insertPlacement(input: { siteId?: string; ownerType: string; ownerId: string; slot: string; assetId: string }) {
  db.prepare(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`placement-${input.ownerType}-${input.ownerId}-${input.slot}`, ORG, input.siteId ?? SITE, input.ownerType, input.ownerId, input.slot, input.assetId, now, now)
}

test('resolves the page-owned image (tier 1) for a business_location', async () => {
  const assetId = insertAsset({})
  insertPlacement({ ownerType: 'business_location', ownerId: 'loc-1', slot: 'hero', assetId })
  const result = await resolveSocialImageBackground(db, { siteId: SITE, ownerType: 'business_location', ownerId: 'loc-1' })
  assert.equal(result.tier, 'page')
  assert.equal(result.assetId, assetId)
})

test('a video-backed page resolves to its thumbnail_url, not public_url', async () => {
  const assetId = insertAsset({ kind: 'video', publicUrl: 'https://images.example/video.mp4', thumbnailUrl: 'https://images.example/poster.jpg' })
  insertPlacement({ ownerType: 'post', ownerId: 'post-video', slot: 'cover', assetId })
  const result = await resolveSocialImageBackground(db, { siteId: SITE, ownerType: 'post', ownerId: 'post-video' })
  assert.equal(result.url, 'https://images.example/poster.jpg')
})

test('falls back to the site default (tier 2) when the page has no own image', async () => {
  const assetId = insertAsset({ siteId: 'site-2' })
  insertPlacement({ siteId: 'site-2', ownerType: 'site', ownerId: 'site-2', slot: 'og_default', assetId })
  const result = await resolveSocialImageBackground(db, { siteId: 'site-2', ownerType: 'business_location', ownerId: 'loc-no-hero' })
  assert.equal(result.tier, 'site_default')
  assert.equal(result.assetId, assetId)
})

test('the platform site default resolves with tier platform_default (same mechanism, no bespoke table)', async () => {
  const assetId = insertAsset({ siteId: 'platform' })
  insertPlacement({ siteId: 'platform', ownerType: 'site', ownerId: 'platform', slot: 'og_default', assetId })
  const result = await resolveSocialImageBackground(db, { siteId: 'platform', ownerType: 'platform', ownerId: 'about' })
  assert.equal(result.tier, 'platform_default')
  assert.equal(result.assetId, assetId)
})

test('a tenant_page resolves its background by scanning content blocks, not a dedicated slot', async () => {
  const result = await resolveSocialImageBackground(db, {
    siteId: 'site-3',
    ownerType: 'tenant_page',
    ownerId: 'page-1',
    blocks: [
      { id: 'b1', type: 'heading', position: 0, data: {}, media: [] },
      { id: 'b2', type: 'hero', position: 1, data: {}, media: [{ asset_id: 'block-asset-1', slot: 'featured', public_url: 'https://images.example/block-asset-1', kind: 'image' }] },
    ] as never,
  })
  assert.equal(result.tier, 'page')
  assert.equal(result.assetId, 'block-asset-1')
})

test('a block-scan candidate missing the URL its own kind needs does not stop the scan (regression)', async () => {
  // A video item matching the slot but with no thumbnail_url must not short-circuit the search —
  // the next block's real image should still be found instead of falling through to site/platform
  // defaults.
  const result = await resolveSocialImageBackground(db, {
    siteId: 'site-3',
    ownerType: 'tenant_page',
    ownerId: 'page-2',
    blocks: [
      { id: 'b1', type: 'hero', position: 0, data: {}, media: [{ asset_id: 'video-no-poster', slot: 'featured', public_url: 'https://images.example/video.mp4', thumbnail_url: null, kind: 'video' }] },
      { id: 'b2', type: 'image', position: 1, data: {}, media: [{ asset_id: 'real-image', slot: 'media', public_url: 'https://images.example/real-image', kind: 'image' }] },
    ] as never,
  })
  assert.equal(result.tier, 'page')
  assert.equal(result.assetId, 'real-image')
})

test('a tenant site with nothing resolvable throws SocialImageResolutionError, never a gradient/null', async () => {
  await assert.rejects(
    () => resolveSocialImageBackground(db, { siteId: 'site-empty', ownerType: 'business_location', ownerId: 'loc-empty' }),
    SocialImageResolutionError,
  )
})

test('resolveSocialImageBackground never returns a URL for an inactive/deleted asset', async () => {
  const assetId = insertAsset({ siteId: 'site-4' })
  db.prepare(`UPDATE media_assets SET status = 'deleted' WHERE id = ?`).run(assetId)
  insertPlacement({ siteId: 'site-4', ownerType: 'business_location', ownerId: 'loc-deleted', slot: 'hero', assetId })
  await assert.rejects(
    () => resolveSocialImageBackground(db, { siteId: 'site-4', ownerType: 'business_location', ownerId: 'loc-deleted' }),
    SocialImageResolutionError,
  )
})
