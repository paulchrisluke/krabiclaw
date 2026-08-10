import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'

const migrationStatements = readFileSync('migrations/0113_bitter_omega_flight.sql', 'utf8')
  .split('--> statement-breakpoint')
  .map(statement => statement.trim())
  .filter(Boolean)

function createLegacyBillingSchema() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE service_addon_purchases (id text PRIMARY KEY);
    CREATE TABLE stripe_credit_topups (checkout_session_id text PRIMARY KEY);
    CREATE TABLE organization_billing (
      organization_id text PRIMARY KEY,
      auto_topup_enabled integer DEFAULT 0 NOT NULL,
      auto_topup_bundle integer DEFAULT 500 NOT NULL,
      auto_topup_threshold integer DEFAULT 100 NOT NULL,
      retained_projection text
    );
  `)
  return db
}

function applyMigration(db: Database.Database) {
  for (const statement of migrationStatements) db.exec(statement)
}

test('retired billing migration removes only unused product schema', () => {
  const db = createLegacyBillingSchema()
  try {
    db.prepare('INSERT INTO organization_billing (organization_id) VALUES (?)').run('org-growth')
    applyMigration(db)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      .map(row => (row as { name: string }).name)
    assert.equal(tables.includes('service_addon_purchases'), false)
    assert.equal(tables.includes('stripe_credit_topups'), false)

    const columns = db.prepare('PRAGMA table_info(organization_billing)').all()
      .map(row => (row as { name: string }).name)
    assert.deepEqual(columns, ['organization_id', 'retained_projection'])
  } finally {
    db.close()
  }
})

test('retired billing migration fails before deletion on unexpected obligations', () => {
  const cases = [
    {
      seed: (db: Database.Database) => db.prepare('INSERT INTO service_addon_purchases (id) VALUES (?)').run('addon-1'),
      error: /service_addon_purchases_not_empty/,
    },
    {
      seed: (db: Database.Database) => db.prepare('INSERT INTO stripe_credit_topups (checkout_session_id) VALUES (?)').run('cs_1'),
      error: /stripe_credit_topups_not_empty/,
    },
    {
      seed: (db: Database.Database) => db.prepare(`
        INSERT INTO organization_billing (organization_id, auto_topup_enabled)
        VALUES (?, 1)
      `).run('org-auto-topup'),
      error: /auto_topup_configuration_not_default/,
    },
    {
      seed: (db: Database.Database) => db.prepare(`
        INSERT INTO organization_billing (organization_id, auto_topup_bundle)
        VALUES (?, 1000)
      `).run('org-auto-topup-bundle'),
      error: /auto_topup_configuration_not_default/,
    },
    {
      seed: (db: Database.Database) => db.prepare(`
        INSERT INTO organization_billing (organization_id, auto_topup_threshold)
        VALUES (?, 200)
      `).run('org-auto-topup-threshold'),
      error: /auto_topup_configuration_not_default/,
    },
  ]

  for (const scenario of cases) {
    const db = createLegacyBillingSchema()
    try {
      scenario.seed(db)
      assert.throws(() => applyMigration(db), scenario.error)
      const tableCount = db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('service_addon_purchases', 'stripe_credit_topups')",
      ).get() as { count: number }
      assert.equal(tableCount.count, 2)
      assert.equal(
        db.prepare('PRAGMA table_info(organization_billing)').all()
          .some(row => (row as { name: string }).name === 'auto_topup_enabled'),
        true,
      )
    } finally {
      db.close()
    }
  }
})
