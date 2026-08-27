import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'
import { MEDIA_PLACEMENT_OWNER_CHECK_SQL, MEDIA_PLACEMENT_SLOT_CHECK_SQL, MAX_ORDERED_MEDIA_ASSETS } from '../../shared/media-placement-contract.ts'

type SqliteDb = InstanceType<typeof Database>
type BatchQuery = { query: string; params?: unknown[] }

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
  CREATE TABLE business_locations (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (owner_type, owner_id, slot, asset_id),
    UNIQUE (owner_type, owner_id, slot, sort_order)
  );
`)
// The reorder guard row deliberately fails this check (owner_type = '__reorder_guard__' is not
// in the editable-owner allowlist) — the CHECK above must NOT allow it, matching production.
assert.throws(() => db.prepare(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, created_at, updated_at) VALUES ('x','o','s','__reorder_guard__','o','gallery','__reorder_guard__','t','t')`).run(), /CHECK constraint failed/)

const state: { batches: BatchQuery[][]; beforeBatch: (() => void) | null } = { batches: [], beforeBatch: null }

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (sqlite: SqliteDb, query: string, params: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...params)
      return { meta: { changes: Number(result.changes) } }
    },
    executeBatch: async (sqlite: SqliteDb, batch: BatchQuery[]) => {
      state.beforeBatch?.()
      state.beforeBatch = null
      state.batches.push(batch)
      const transaction = sqlite.transaction((statements: BatchQuery[]) => statements.map((statement) => {
        const result = sqlite.prepare(statement.query).run(...(statement.params ?? []))
        return { meta: { changes: Number(result.changes) } }
      }))
      return transaction(batch)
    },
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => sqlite.prepare(query).all(...params) as T[],
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (sqlite.prepare(query).get(...params) as T | undefined) ?? null,
  },
})

const { attachMediaPlacement, removeMediaPlacement, reorderMediaPlacements } = await import('../../server/utils/media-placement.ts?media-placement-concurrency')

const ORG = 'org-1'
const SITE = 'site-1'
const LOCATION = 'location-1'
const PLACEMENT = { owner_type: 'business_location' as const, owner_id: LOCATION, slot: 'gallery' }

function baseInput() {
  return { organizationId: ORG, siteId: SITE, placement: PLACEMENT }
}

function insertAsset(id: string) {
  db.prepare(`INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, public_url) VALUES (?, ?, ?, 'image', 'cloudflare_images', 'uploaded', ?)`)
    .run(id, ORG, SITE, `https://images.example/${id}`)
}

function currentOrder(): string[] {
  return db.prepare(`SELECT asset_id FROM media_placements WHERE owner_type = ? AND owner_id = ? AND slot = ? ORDER BY sort_order ASC`)
    .all(PLACEMENT.owner_type, PLACEMENT.owner_id, PLACEMENT.slot)
    .map((row: unknown) => (row as { asset_id: string }).asset_id)
}

test.beforeEach(() => {
  db.exec('DELETE FROM media_placements; DELETE FROM media_assets; DELETE FROM business_locations;')
  db.prepare(`INSERT INTO business_locations (id, site_id) VALUES (?, ?)`).run(LOCATION, SITE)
  state.batches = []
  state.beforeBatch = null
})

test('attach appends one asset without touching others', async () => {
  insertAsset('a1')
  insertAsset('a2')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  const result = await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  assert.deepEqual(currentOrder(), ['a1', 'a2'])
  assert.deepEqual(result.asset_ids, ['a1', 'a2'])
})

test('concurrent duplicate attach of the same asset results in exactly one attachment', async () => {
  insertAsset('a1')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await assert.rejects(
    () => attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' }),
    /already attached/,
  )
  assert.deepEqual(currentOrder(), ['a1'])
})

test('removal is idempotent: removing an already-removed asset is a no-op, not an error', async () => {
  insertAsset('a1')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await removeMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  assert.deepEqual(currentOrder(), [])
  const result = await removeMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  assert.deepEqual(result.asset_ids, [])
})

test('removal never touches unrelated attachments\' relative order', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3')
  for (const id of ['a1', 'a2', 'a3']) await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  await removeMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  assert.deepEqual(currentOrder(), ['a1', 'a3'])
})

test('reorder rejects a move whose asset is no longer attached, mutating nothing', async () => {
  insertAsset('a1'); insertAsset('a2')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  await assert.rejects(
    () => reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'ghost' }] }),
    /no longer attached/,
  )
  assert.deepEqual(currentOrder(), ['a1', 'a2'])
})

test('reorder rejects a move whose anchor is no longer attached, mutating nothing', async () => {
  insertAsset('a1'); insertAsset('a2')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  await assert.rejects(
    () => reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'a1', before_asset_id: 'ghost' }] }),
    /no longer attached/,
  )
  assert.deepEqual(currentOrder(), ['a1', 'a2'])
})

test('reorder never changes membership, only positions', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3')
  for (const id of ['a1', 'a2', 'a3']) await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  const result = await reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'a3', before_asset_id: 'a1' }] })
  assert.deepEqual(result.asset_ids.slice().sort(), ['a1', 'a2', 'a3'])
  assert.deepEqual(currentOrder(), ['a3', 'a1', 'a2'])
})

test('unmentioned attachments retain their relative order after a reorder', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3'); insertAsset('a4')
  for (const id of ['a1', 'a2', 'a3', 'a4']) await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  await reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'a4', before_asset_id: 'a1' }] })
  const order = currentOrder()
  assert.ok(order.indexOf('a2') < order.indexOf('a3'), 'a2 must still precede a3')
  assert.deepEqual(order, ['a4', 'a1', 'a2', 'a3'])
})

test('swapping the first and last asset causes no transient unique(sort_order) violation', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3')
  for (const id of ['a1', 'a2', 'a3']) await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  const result = await reorderMediaPlacements(db as unknown as D1Database, {
    ...baseInput(),
    moves: [{ asset_id: 'a3', before_asset_id: 'a1' }, { asset_id: 'a1', after_asset_id: 'a2' }],
  })
  assert.deepEqual(result.asset_ids, ['a3', 'a2', 'a1'])
  assert.deepEqual(currentOrder(), ['a3', 'a2', 'a1'])
})

test('multiple sequential moves in one call produce a deterministic final order', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3'); insertAsset('a4')
  for (const id of ['a1', 'a2', 'a3', 'a4']) await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  const result = await reorderMediaPlacements(db as unknown as D1Database, {
    ...baseInput(),
    moves: [
      { asset_id: 'a1', after_asset_id: 'a4' },
      { asset_id: 'a2', before_asset_id: 'a3' },
    ],
  })
  assert.deepEqual(result.asset_ids, ['a2', 'a3', 'a4', 'a1'])
})

test('a stale reorder cannot resurrect an asset another client already removed', async () => {
  insertAsset('a1'); insertAsset('a2')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  // Client read order [a1, a2], then another client removes a2 before this reorder's batch commits.
  state.beforeBatch = () => {
    db.prepare(`DELETE FROM media_placements WHERE owner_type = ? AND owner_id = ? AND slot = ? AND asset_id = 'a2'`)
      .run(PLACEMENT.owner_type, PLACEMENT.owner_id, PLACEMENT.slot)
  }
  await assert.rejects(
    () => reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'a1', after_asset_id: 'a2' }] }),
    (error: unknown) => (error as { statusMessage?: string }).statusMessage === 'This collection changed while reordering. Reload and try again.',
  )
  assert.deepEqual(currentOrder(), ['a1'])
})

test('reorder preserves an asset attached concurrently by another client mid-flight', async () => {
  insertAsset('a1'); insertAsset('a2'); insertAsset('a3')
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a1' })
  await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'a2' })
  // Client read order [a1, a2], then another client attaches a3 before this reorder's batch commits.
  state.beforeBatch = () => {
    db.prepare(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
      VALUES ('placement-a3', ?, ?, ?, ?, ?, 'a3', 2, 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`)
      .run(ORG, SITE, PLACEMENT.owner_type, PLACEMENT.owner_id, PLACEMENT.slot)
  }
  await assert.rejects(
    () => reorderMediaPlacements(db as unknown as D1Database, { ...baseInput(), moves: [{ asset_id: 'a2', before_asset_id: 'a1' }] }),
    (error: unknown) => (error as { statusMessage?: string }).statusMessage === 'This collection changed while reordering. Reload and try again.',
  )
  // The reorder aborted entirely (409), so a3 stays exactly where the concurrent attach put it
  // and the pre-existing rows are untouched — nothing was silently dropped or resurrected.
  assert.deepEqual(currentOrder(), ['a1', 'a2', 'a3'])
})

test('the ordered collection limit is enforced against live persisted membership, not a stale count', async () => {
  for (let i = 0; i < MAX_ORDERED_MEDIA_ASSETS; i += 1) {
    const id = `a${i}`
    insertAsset(id)
    await attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: id })
  }
  insertAsset('overflow')
  await assert.rejects(
    () => attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'overflow' }),
    /accept at most/,
  )
  assert.equal(currentOrder().length, MAX_ORDERED_MEDIA_ASSETS)
})

test('attach rejects an asset outside the caller\'s organization/site scope', async () => {
  db.prepare(`INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, public_url) VALUES ('foreign', 'other-org', 'other-site', 'image', 'cloudflare_images', 'uploaded', 'https://images.example/foreign')`).run()
  await assert.rejects(
    () => attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'foreign' }),
    /inactive or out-of-scope/,
  )
  assert.deepEqual(currentOrder(), [])
})

test('attach rejects a deleted/inactive asset', async () => {
  db.prepare(`INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, status) VALUES ('deleted-1', ?, ?, 'image', 'cloudflare_images', 'uploaded', 'deleted')`).run(ORG, SITE)
  await assert.rejects(
    () => attachMediaPlacement(db as unknown as D1Database, { ...baseInput(), assetId: 'deleted-1' }),
    /inactive or out-of-scope/,
  )
})

test('attach rejects an unrecognized owner_type/slot pair via the placement key parser', async () => {
  const { parseMediaPlacementKey } = await import('../../server/utils/media-placement.ts?media-placement-concurrency')
  assert.throws(() => parseMediaPlacementKey({ owner_type: 'business_location', owner_id: LOCATION, slot: 'not-a-real-slot' }), /not supported/)
  assert.throws(() => parseMediaPlacementKey({ owner_type: 'not-a-real-owner', owner_id: LOCATION, slot: 'gallery' }), /invalid/)
})

test('reorder is rejected outright for a single-valued (non-ordered) placement', async () => {
  db.exec(`DELETE FROM business_locations; INSERT INTO business_locations (id, site_id) VALUES ('${LOCATION}', '${SITE}')`)
  await assert.rejects(
    () => reorderMediaPlacements(db as unknown as D1Database, {
      organizationId: ORG, siteId: SITE,
      placement: { owner_type: 'business_location', owner_id: LOCATION, slot: 'hero' },
      moves: [{ asset_id: 'a1' }],
    }),
    /single-valued/,
  )
})

test('attach is rejected outright for a single-valued (non-ordered) placement', async () => {
  insertAsset('a1')
  await assert.rejects(
    () => attachMediaPlacement(db as unknown as D1Database, {
      organizationId: ORG, siteId: SITE,
      placement: { owner_type: 'business_location', owner_id: LOCATION, slot: 'hero' },
      assetId: 'a1',
    }),
    /single-valued/,
  )
})
