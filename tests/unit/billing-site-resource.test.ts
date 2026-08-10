import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).all(...params) as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll,
  },
})

const { loadOrganizationSiteSummaries } = await import('../../server/utils/billing-site-resource.ts')

test('all organization sites share the resolved subscription state despite stale site rows', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      brand_name TEXT,
      subdomain TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE site_billing (
      site_id TEXT PRIMARY KEY,
      plan TEXT,
      status TEXT,
      current_period_end TEXT
    );
  `)
  db.prepare('INSERT INTO sites (id, organization_id, brand_name, subdomain, created_at) VALUES (?, ?, ?, ?, ?)').run('site-a', 'org-shared', 'A', 'a', '2026-01-01')
  db.prepare('INSERT INTO sites (id, organization_id, brand_name, subdomain, created_at) VALUES (?, ?, ?, ?, ?)').run('site-b', 'org-shared', 'B', 'b', '2026-01-02')
  db.prepare('INSERT INTO site_billing (site_id, plan, status, current_period_end) VALUES (?, ?, ?, ?)').run('site-a', 'free', 'canceled', null)
  db.prepare('INSERT INTO site_billing (site_id, plan, status, current_period_end) VALUES (?, ?, ?, ?)').run('site-b', 'managed', 'active', '2030-01-01')

  const sites = await loadOrganizationSiteSummaries(db as never, 'org-shared', {
    plan: 'growth',
    subscriptionStatus: 'active',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  })

  assert.deepEqual(sites.map(site => ({
    siteId: site.siteId,
    plan: site.plan,
    subscriptionStatus: site.subscriptionStatus,
    currentPeriodEnd: site.currentPeriodEnd,
  })), [
    { siteId: 'site-a', plan: 'growth', subscriptionStatus: 'active', currentPeriodEnd: '2026-08-31T00:00:00.000Z' },
    { siteId: 'site-b', plan: 'growth', subscriptionStatus: 'active', currentPeriodEnd: '2026-08-31T00:00:00.000Z' },
  ])
})
