import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

async function execute(db: SqliteDb, query: string, params: unknown[] = []) {
  const result = db.prepare(query).run(...params)
  return { meta: { changes: Number(result.changes) } }
}

async function executeBatch(db: SqliteDb, queries: Array<{ query: string; params?: unknown[] }>) {
  const transaction = db.transaction((statements: Array<{ query: string; params?: unknown[] }>) => statements.map(statement => {
    const result = db.prepare(statement.query).run(...(statement.params ?? []))
    return { meta: { changes: Number(result.changes) } }
  }))
  return transaction(queries)
}

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).all(...params) as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute,
    executeBatch,
    queryFirst,
    queryAll,
    createDb: () => ({}),
    schema: {},
  },
})
const { getOrganizationCreditsResource } = await import('../../server/utils/ai-credits.ts')

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE organization_billing (
      organization_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT,
      status TEXT,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER,
      updated_at TEXT
    );
    CREATE TABLE ai_credits (
      organization_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL,
      lifetime_used INTEGER NOT NULL,
      balance_period_key TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE usage_quota_grants (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      period_key TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT,
      grant_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT,
      idempotency_key TEXT NOT NULL,
      applied_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX usage_quota_grants_org_key ON usage_quota_grants (organization_id, idempotency_key);
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT,
      resource TEXT NOT NULL,
      source TEXT NOT NULL,
      provider TEXT,
      channel TEXT,
      session_id TEXT,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      metadata_json TEXT,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX usage_events_org_key ON usage_events (organization_id, idempotency_key);
    CREATE TABLE sites (id TEXT PRIMARY KEY, brand_name TEXT, organization_id TEXT);
  `)
  return db
}

test('shared credits loader reports malformed canonical metadata without dropping usage', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:00:00.000Z')
  db.prepare('INSERT INTO ai_credits (organization_id, balance, lifetime_used, balance_period_key, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('org-loader', 500, 9, '2026-08-10', now.toISOString())
  db.prepare('INSERT INTO sites (id, brand_name, organization_id) VALUES (?, ?, ?)').run('site-1', 'Demo', 'org-loader')
  db.prepare(`
    INSERT INTO usage_events
      (id, organization_id, site_id, resource, source, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('event-malformed', 'org-loader', 'site-1', 'messaging', 'test', 2, 'credit', '{not-json', 'event-malformed', '2026-08-10T10:00:00.000Z')
  db.prepare(`
    INSERT INTO usage_events
      (id, organization_id, site_id, resource, source, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('event-charged', 'org-loader', 'site-1', 'ai_inference', 'test', 3, 'credit', JSON.stringify({ action: 'chowbot', charged: true }), 'event-charged', '2026-08-10T11:00:00.000Z')

  const resource = await getOrganizationCreditsResource(db as never, 'org-loader', null, now)

  assert.equal(resource.periodUsed, 5)
  assert.equal(resource.periodRemaining, 495)
  assert.equal(resource.lifetimeUsed, 9)
  assert.deepEqual(resource.usage[0], {
    resource: 'ai_inference',
    site_id: 'site-1',
    site_name: 'Demo',
    action: 'chowbot',
    quantity: 3,
    charged: true,
    created_at: '2026-08-10T11:00:00.000Z',
  })
  assert.deepEqual(resource.byAction, [
    { resource: 'ai_inference', action: 'chowbot', charged: true, quantity: 3, calls: 1 },
    { resource: 'messaging', action: null, charged: null, quantity: 2, calls: 1 },
  ])
})
