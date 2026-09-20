import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
