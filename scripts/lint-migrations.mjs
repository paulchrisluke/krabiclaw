#!/usr/bin/env node
// A migration must never DROP TABLE a table that other tables reference. D1
// ignores `PRAGMA foreign_keys=OFF` and `defer_foreign_keys`, so the rebuild
// drizzle-kit generates for a constraint change on a parent (CREATE __new_x,
// copy, DROP TABLE x, RENAME) cascade-deletes every child row. RENAME rewrites
// the children's REFERENCES, so dropping the old table cascades just the same.
// Measured on a throwaway D1 instance, 2026-09-09.
//
// SQLite replays the chain in the order wrangler applies it (the sorted .sql
// files in migrations/) and its authorizer denies the DROP against the foreign
// keys that exist at that statement. A parent whose
// referencing tables were dropped first may go: nothing is left to cascade.
import { readdir, readFile } from 'node:fs/promises'
import { DatabaseSync, constants } from 'node:sqlite'

const files = (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()
const db = new DatabaseSync(':memory:')
let parents = new Set()
let blocked

db.setAuthorizer((action, table) => {
  if (action === constants.SQLITE_DROP_TABLE && parents.has(table.toLowerCase())) blocked = table
  return blocked ? constants.SQLITE_DENY : constants.SQLITE_OK
})

for (const name of files) {
  const file = `migrations/${name}`
  let remaining = await readFile(file, 'utf8')
  try {
    while ((remaining = remaining.replace(/^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, ''))) {
      const references = db.prepare(`
        SELECT DISTINCT lower(s.name) AS child, lower(f."table") AS parent
        FROM sqlite_schema AS s, pragma_foreign_key_list(s.name) AS f
        WHERE s.type = 'table' AND lower(s.name) <> lower(f."table")
      `).all()
      parents = new Set(references.map(row => row.parent))
      const statement = db.prepare(remaining)
      statement.run()
      remaining = remaining.slice(statement.sourceSQL.length)
    }
  } catch (error) {
    console.error(blocked
      ? `✗ ${file} drops "${blocked}", which other tables reference. On D1 that cascade-deletes their rows. Write an expand/contract migration by hand instead (see migrations/0006_site_currency_nullable.sql).`
      : `✗ ${file} does not apply: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ ${file}`)
}
