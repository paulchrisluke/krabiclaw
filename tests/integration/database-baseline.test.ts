import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

test('the migration chain applies from zero and builds every table the schema declares', () => {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  try {
    const journal = JSON.parse(readFileSync('migrations/meta/_journal.json', 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    for (const entry of journal.entries) database.exec(readFileSync(`migrations/${entry.tag}.sql`, 'utf8'))
    const last = journal.entries.at(-1)!
    const snapshot = JSON.parse(readFileSync(`migrations/meta/${String(last.idx).padStart(4, '0')}_snapshot.json`, 'utf8')) as { tables: Record<string, { name: string }> }
    const declared = Object.values(snapshot.tables).map(table => table.name).sort()
    const built = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map(row => row.name)
    assert.deepEqual(built, declared)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('a v7 export transfers into the current baseline, its connections into organization_integrations', async () => {
  const { transferDatabaseExport } = await import('../../scripts/transfer-database-export.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-v7-transfer-'))
  const v7 = ['0000_baseline.sql', '0001_drop_typed_social_profiles.sql', '0002_products_overview.sql']
  const export7 = (name: string, integrations: Record<string, unknown>) => {
    const path = join(directory, name)
    const source = new Database(path)
    for (const file of v7) source.exec(readFileSync(`migrations-history/v7/${file}`, 'utf8'))
    source.exec(`CREATE TABLE "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
      ${v7.map(file => `INSERT INTO d1_migrations (name) VALUES ('${file}');`).join('\n')}`)
    source.prepare("INSERT INTO organization (id, name, slug, subdomain, integrations_json) VALUES ('org', 'Org', 'org', 'org', ?)").run(JSON.stringify(integrations))
    source.prepare("INSERT INTO organization_locales (id, organization_id, locale, is_source, status) VALUES ('org-en', 'org', 'en', 1, 'published')").run()
    source.close()
    return path
  }
  const at = '2026-09-28T00:00:00.000Z'
  try {
    const sourcePath = export7('v7.sqlite', {
      facebook: { revision: 'fb-r', account_id: 'fb-account', page_id: 'page-1', page_name: 'Krabi Claw', status: 'active', created_at: at, updated_at: at },
      google_analytics: { revision: 'ga-r', account_id: 'google-account', property_id: '542527926', property_name: 'Krabiclaw', measurement_id: 'G-TEST', status: 'active', created_at: at, updated_at: at },
      google_search_console: { revision: 'gsc-r', account_id: 'google-account', site_url: 'sc-domain:krabiclaw.com', verified: true, status: 'active', created_at: at, updated_at: at },
    })
    const targetPath = join(directory, 'v8.sqlite')
    const manifest = transferDatabaseExport(sourcePath, targetPath)
    assert.deepEqual(manifest.source_migrations, v7)
    const target = new Database(targetPath, { readonly: true })
    try {
      assert.deepEqual(target.pragma('foreign_key_check'), [])
      assert.deepEqual(target.prepare('SELECT provider, account_id, target_id, target_name, measurement_id, verified, revision FROM organization_integrations ORDER BY provider').all(), [
        { provider: 'facebook', account_id: 'fb-account', target_id: 'page-1', target_name: 'Krabi Claw', measurement_id: null, verified: null, revision: 'fb-r' },
        { provider: 'google_analytics', account_id: 'google-account', target_id: '542527926', target_name: 'Krabiclaw', measurement_id: 'G-TEST', verified: null, revision: 'ga-r' },
        { provider: 'google_search_console', account_id: 'google-account', target_id: 'sc-domain:krabiclaw.com', target_name: 'sc-domain:krabiclaw.com', measurement_id: null, verified: 1, revision: 'gsc-r' },
      ])
      const organizationColumns = (target.prepare('PRAGMA table_info(organization)').all() as Array<{ name: string }>).map(column => column.name)
      assert.equal(organizationColumns.includes('integrations_json'), false)
    } finally {
      target.close()
    }

    // A connection that cannot be mapped stops the transfer.
    for (const [name, integrations, reason] of [
      ['unknown.sqlite', { google_business: { status: 'active' } }, /unmapped integration google_business/],
      ['errored.sqlite', { instagram: { revision: 'r', account_id: 'a', instagram_user_id: '1', username: 'u', status: 'error', created_at: at, updated_at: at } }, /instagram is error/],
      ['incomplete.sqlite', { google_analytics: { revision: 'r', measurement_id: 'G-X', status: 'active', created_at: at, updated_at: at } }, /google_analytics.account_id is missing/],
    ] as const) {
      assert.throws(() => transferDatabaseExport(export7(name, integrations), join(directory, `target-${name}`)), reason)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('consultation settings backfill preserves the full legacy object and referenced organization', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  try {
    db.exec(readFileSync('migrations/0000_baseline.sql', 'utf8'))
    const settings = { consultation: { mode: 'external_url', cta_label: 'Schedule', external_url: 'https://example.com/book', schedule_path: '/schedule', confirmation_path: '/confirmed', tracking_enabled: false, metadata_json: { custom: 'preserved' } }, config: { default_timezone: 'America/New_York' } }
    db.prepare('INSERT INTO organization (id,name,slug,createdAt,settings_json) VALUES (?,?,?,?,?)').run('consultation-migration', 'Example', 'consultation-migration', 1, JSON.stringify(settings))
    db.exec(readFileSync('migrations/0001_provider_support_v8.sql', 'utf8'))
    const row = db.prepare('SELECT settings_json,consultation_settings_json FROM organization WHERE id = ?').get('consultation-migration') as { settings_json: string; consultation_settings_json: string }
    assert.deepEqual(JSON.parse(row.settings_json), settings)
    assert.deepEqual(JSON.parse(row.consultation_settings_json), settings.consultation)
    db.prepare('UPDATE organization SET consultation_settings_json = json_set(consultation_settings_json, \'$.mode\', \'native\') WHERE id = ?').run('consultation-migration')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally { db.close() }
})
