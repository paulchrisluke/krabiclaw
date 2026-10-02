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

test('archived schemas transfer into the current baseline', async () => {
  const { transferDatabaseExport } = await import('../../scripts/transfer-database-export.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-v6-transfer-'))
  try {
    const sourcePath = join(directory, 'v5.sqlite')
    const targetPath = join(directory, 'v6.sqlite')
    const source = new Database(sourcePath)
    source.exec(readFileSync('migrations-history/v5/0000_baseline.sql', 'utf8'))
    source.exec(`CREATE TABLE "d1_migrations"(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    ); INSERT INTO d1_migrations (name) VALUES ('0000_baseline.sql')`)
    source.close()
    const manifest = transferDatabaseExport(sourcePath, targetPath)
    assert.deepEqual(manifest.source_migrations, ['0000_baseline.sql'])
    const target = new Database(targetPath, { readonly: true })
    try {
      assert.deepEqual(target.pragma('foreign_key_check'), [])
      const contentTable = (target.prepare("SELECT sql FROM sqlite_schema WHERE name = 'content_documents'").get() as { sql: string }).sql
      for (const retired of [
        'content_documents_page_type_check', 'content_documents_qa_counts_check',
        'content_documents_article_tags_check', 'content_documents_social_call_to_action_check',
        'content_documents_social_metadata_check',
      ]) assert.equal(contentTable.includes(retired), false, `${retired} remains in v6`)
    } finally {
      target.close()
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
    db.exec(readFileSync('migrations/0001_drop_typed_social_profiles.sql', 'utf8'))
    const settings = { consultation: { mode: 'external_url', cta_label: 'Schedule', external_url: 'https://example.com/book', schedule_path: '/schedule', confirmation_path: '/confirmed', tracking_enabled: false, metadata_json: { custom: 'preserved' } }, config: { default_timezone: 'America/New_York' } }
    db.prepare('INSERT INTO organization (id,name,slug,createdAt,settings_json) VALUES (?,?,?,?,?)').run('consultation-migration', 'Example', 'consultation-migration', 1, JSON.stringify(settings))
    db.exec(readFileSync('migrations/0002_products_overview.sql', 'utf8'))
    db.exec(readFileSync('migrations/0003_minimal_weekly_schedule.sql', 'utf8'))
    db.exec(readFileSync('migrations/0004_native_consultation_foundation.sql', 'utf8'))
    const row = db.prepare('SELECT settings_json,consultation_settings_json FROM organization WHERE id = ?').get('consultation-migration') as { settings_json: string; consultation_settings_json: string }
    assert.deepEqual(JSON.parse(row.settings_json), settings)
    assert.deepEqual(JSON.parse(row.consultation_settings_json), settings.consultation)
    db.prepare('UPDATE organization SET consultation_settings_json = json_set(consultation_settings_json, \'$.mode\', \'native\') WHERE id = ?').run('consultation-migration')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally { db.close() }
})
