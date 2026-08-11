import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { reconcileLocationParentMigration } from '../../scripts/reconcile-location-parent-migration.mjs'

function createLegacyDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE d1_migrations (id integer PRIMARY KEY, name text, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO d1_migrations (id, name) VALUES (149, '0110_giant_stick.sql');
    CREATE TABLE google_business_connections (id text PRIMARY KEY);
    CREATE TABLE google_business_events (id text PRIMARY KEY);
    CREATE TABLE business_locations (
      id text PRIMARY KEY,
      google_location_id text,
      google_connection_id text REFERENCES google_business_connections(id) ON DELETE SET NULL,
      title text NOT NULL
    );
    CREATE TABLE experiences (id text PRIMARY KEY, location_id text REFERENCES business_locations(id) ON DELETE CASCADE);
    CREATE TABLE menus (id text PRIMARY KEY, location_id text REFERENCES business_locations(id) ON DELETE CASCADE);
    CREATE TABLE reviews (id text PRIMARY KEY, location_id text REFERENCES business_locations(id) ON DELETE CASCADE);
    CREATE TABLE reservation_submissions (id text PRIMARY KEY, location_id text REFERENCES business_locations(id) ON DELETE CASCADE);
    CREATE TABLE experience_bookings (id text PRIMARY KEY, location_id text REFERENCES business_locations(id) ON DELETE CASCADE);
    CREATE TABLE location_qa (
      id text PRIMARY KEY,
      location_id text REFERENCES business_locations(id) ON DELETE CASCADE,
      google_question_id text,
      source text NOT NULL
    );
    CREATE UNIQUE INDEX idx_location_qa_google_id ON location_qa(google_question_id) WHERE google_question_id IS NOT NULL;
    CREATE TABLE site_entitlements (
      id text PRIMARY KEY, site_id text, organization_id text, key text, value integer,
      source text, created_at text, updated_at text
    );
    CREATE TABLE work_requests (id text PRIMARY KEY, type text, updated_at text);
    INSERT INTO google_business_connections VALUES ('connection-1');
    INSERT INTO google_business_events VALUES ('event-1');
    INSERT INTO business_locations VALUES ('location-1', 'legacy-google-location', 'connection-1', 'Location');
    INSERT INTO experiences VALUES ('experience-1', 'location-1');
    INSERT INTO menus VALUES ('menu-1', 'location-1');
    INSERT INTO reviews VALUES ('review-1', 'location-1');
    INSERT INTO reservation_submissions VALUES ('reservation-1', 'location-1');
    INSERT INTO experience_bookings VALUES ('booking-1', 'location-1');
    INSERT INTO location_qa VALUES ('qa-1', 'location-1', 'question-1', 'gmb');
    INSERT INTO site_entitlements VALUES ('entitlement-google_business', 'site-1', 'org-1', 'google_business', 1, 'plan', 'now', 'now');
    INSERT INTO work_requests VALUES ('request-1', 'google_business', 'now');
  `)
  return db
}

function adapter(db: Database.Database) {
  return {
    query: async (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>,
    run: async (sql: string) => { db.exec(sql); return [] },
  }
}

test('safe 0111 reconciliation preserves every location-owned row and is idempotent', async () => {
  const db = createLegacyDatabase()
  try {
    const result = await reconcileLocationParentMigration(adapter(db))
    assert.equal(result.status, 'reconciled')
    for (const table of ['business_locations', 'experiences', 'menus', 'reviews', 'reservation_submissions', 'experience_bookings', 'location_qa']) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 1)
    }
    const locationColumns = db.prepare('PRAGMA table_info(business_locations)').all().map(row => (row as { name: string }).name)
    assert.equal(locationColumns.includes('google_location_id'), false)
    assert.equal(locationColumns.includes('google_connection_id'), true)
    const qa = db.prepare('SELECT source FROM location_qa').get() as { source: string }
    assert.equal(qa.source, 'import')
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM site_entitlements WHERE key = 'google_places'").get() as { count: number }).count, 1)
    assert.equal((db.prepare("SELECT type FROM work_requests WHERE id = 'request-1'").get() as { type: string }).type, 'google_places')
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='google_business_events'").get() as { count: number }).count, 0)
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM d1_migrations WHERE name='0111_sharp_switch.sql'").get() as { count: number }).count, 1)

    const repeated = await reconcileLocationParentMigration(adapter(db))
    assert.equal(repeated.status, 'already_reconciled')
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM experiences').get() as { count: number }).count, 1)
  } finally {
    db.close()
  }
})

test('safe 0111 reconciliation refuses an unexpected migration boundary', async () => {
  const db = createLegacyDatabase()
  try {
    db.prepare("UPDATE d1_migrations SET name = '0109_fix_stale_media_scope_trigger.sql'").run()
    await assert.rejects(() => reconcileLocationParentMigration(adapter(db)), /requires 0110_giant_stick\.sql as the latest migration/)
  } finally {
    db.close()
  }
})

