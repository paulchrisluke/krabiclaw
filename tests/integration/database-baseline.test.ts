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

test('the deployed v5 schema transfers into the v6 baseline', async () => {
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
