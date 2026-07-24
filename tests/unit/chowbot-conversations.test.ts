import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

// #406: listSitesForMember used to be a two-step JS-side filter (query all
// member sites, separately query team-wide scopes into a Set, then filter in
// JS). It's now a single SQL query composed with member-access.ts's shared
// teamAccessPredicate. Runs against a real in-memory SQLite connection (not a
// hand-rolled JS fake reimplementing SQL semantics) so the actual query text
// is what's being verified, including SQL's IN-with-NULL behavior the
// dashboard-home.ts/webhook.post.ts rewrites also rely on.

function setupDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      brand_name TEXT,
      default_currency TEXT,
      status TEXT NOT NULL,
      team_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE teamMember (
      id TEXT PRIMARY KEY,
      teamId TEXT NOT NULL,
      userId TEXT NOT NULL
    );
  `)
  db.prepare(`INSERT INTO sites VALUES ('site-owned', 'org-1', 'Owned Site', 'THB', 'active', 'site:site-owned', '2026-01-01')`).run()
  db.prepare(`INSERT INTO sites VALUES ('site-team', 'org-1', 'Team Site', 'THB', 'active', 'site:site-team', '2026-01-02')`).run()
  db.prepare(`INSERT INTO sites VALUES ('site-no-team', 'org-1', 'No Team Site', 'THB', 'active', 'site:site-no-team', '2026-01-03')`).run()
  db.prepare(`INSERT INTO sites VALUES ('site-inactive', 'org-1', 'Inactive Site', 'THB', 'inactive', 'site:site-inactive', '2026-01-04')`).run()

  db.prepare(`INSERT INTO member VALUES ('member-owner', 'org-1', 'user-owner', 'owner')`).run()
  // A single org membership row (the real invariant — one member row per
  // user per org) with team membership on only one of the org's three
  // active sites — proving team membership, not just org membership, gates
  // an editor's per-site visibility.
  db.prepare(`INSERT INTO member VALUES ('member-editor', 'org-1', 'user-editor', 'editor')`).run()

  db.prepare(`INSERT INTO teamMember VALUES ('tm-editor', 'site:site-team', 'user-editor')`).run()
  return db
}

async function queryAll(db: DatabaseSync, sql: string, params: unknown[] = []) {
  return db.prepare(sql).all(...(params as never[]))
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll,
    queryFirst: async () => { throw new Error('queryFirst should not be called by listSitesForMember') },
    execute: async () => { throw new Error('execute should not be called by listSitesForMember') },
  },
})

const { listSitesForMember } = await import('../../server/utils/chowbot-conversations.ts')

test('listSitesForMember: an owner sees every active site in the org regardless of team membership', async () => {
  const db = setupDatabase()
  const sites = await listSitesForMember(db as never, 'user-owner')
  assert.deepEqual(sites.map(s => s.id).sort(), ['site-no-team', 'site-owned', 'site-team'])
  db.close()
})

test('listSitesForMember: an editor sees only the site their team membership actually covers, not every org membership row', async () => {
  const db = setupDatabase()
  const sites = await listSitesForMember(db as never, 'user-editor')
  assert.deepEqual(sites.map(s => s.id), ['site-team'])
  db.close()
})

test('listSitesForMember: inactive sites never appear, even for an owner', async () => {
  const db = setupDatabase()
  db.prepare(`INSERT INTO member VALUES ('member-owner-2', 'org-1', 'user-owner', 'owner')`).run()
  const sites = await listSitesForMember(db as never, 'user-owner')
  assert.equal(sites.some(s => s.id === 'site-inactive'), false)
  db.close()
})

test('listSitesForMember: a user with no membership rows at all sees nothing', async () => {
  const db = setupDatabase()
  const sites = await listSitesForMember(db as never, 'user-stranger')
  assert.deepEqual(sites, [])
  db.close()
})
