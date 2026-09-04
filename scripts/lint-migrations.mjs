#!/usr/bin/env node
/**
 * D1 migration guardrails.
 *
 * D1 rejects raw BEGIN/COMMIT/ROLLBACK (see AGENTS.md "D1 does not support raw
 * transactions" — confirmed both via Drizzle's execute() and the raw binding).
 * A migration that slips one in applies fine in isolation but breaks the first
 * write path that tries to wrap it, so this is checked at the SQL-file level:
 *
 * 1. Rejects bare BEGIN/COMMIT/ROLLBACK statements in migrations/*.sql outside
 *    of CREATE TRIGGER ... BEGIN ... END bodies (where BEGIN/END are trigger
 *    body delimiters, not transaction control, and are always allowed).
 * 2. Requires the current epoch baseline to remain first and rejects duplicate
 *    migration numbers. Every file applied to an active D1 ID is immutable;
 *    squashing starts a new database epoch instead of rewriting this one.
 * Usage:
 *   node scripts/lint-migrations.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DatabaseSync, constants } from 'node:sqlite'

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'migrations')
const EPOCH_BASELINE = '0000_epoch_5_baseline.sql'

function stripTriggerBodies(sql) {
  // Replace with an equal number of newlines (not '') so line numbers for any
  // violation reported after a trigger body stay aligned with the source file.
  return sql.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi, (match) => '\n'.repeat((match.match(/\n/g) || []).length))
}

function lintTransactionControl(sql, filePath) {
  const violations = []
  const stripped = stripTriggerBodies(sql)
  const statementRe = /\b(BEGIN|COMMIT|ROLLBACK)\b(\s+(IMMEDIATE|EXCLUSIVE|DEFERRED|TRANSACTION))*\s*;/gi
  let match

  while ((match = statementRe.exec(stripped)) !== null) {
    const line = stripped.slice(0, match.index).split('\n').length
    violations.push({
      file: relative(ROOT, filePath),
      line,
      message: `Bare "${match[1]}" statement outside a CREATE TRIGGER body — D1 rejects raw transaction control (see AGENTS.md "D1 does not support raw transactions").`,
    })
  }

  return violations
}

async function collectSqlFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return []
  const entries = await readdir(MIGRATIONS_DIR)
  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => join(MIGRATIONS_DIR, entry))
}

function lintEpochBaseline(presentFiles) {
  const names = presentFiles.map((file) => relative(MIGRATIONS_DIR, file))
  if (names[0] === EPOCH_BASELINE) return []
  return [{
    file: `migrations/${EPOCH_BASELINE}`,
    message: 'Epoch 5 must start with its immutable generated baseline. A future squash requires new D1 resources and a new database epoch.',
  }]
}

function lintDuplicateMigrationNumbers(presentFiles) {
  const byNumber = new Map()
  for (const file of presentFiles) {
    const name = relative(MIGRATIONS_DIR, file)
    const number = Number.parseInt(name.slice(0, 4), 10)
    if (!Number.isInteger(number)) continue
    const names = byNumber.get(number) ?? []
    names.push(name)
    byNumber.set(number, names)
  }

  return [...byNumber.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([number, names]) => ({
      file: `migrations/${String(number).padStart(4, '0')}_*.sql`,
      message: `Duplicate migration number: ${names.join(', ')}. Regenerate the later migration on the current target branch.`,
    }))
}

// Let SQLite parse the SQL and inspect its actual foreign keys. Snapshot metadata
// alone cannot establish whether a DROP is safe at this point in the chain.
async function lintReferencedParentDrops(files) {
  const db = new DatabaseSync(':memory:')
  let parents = new Set()
  let blockedTable
  db.setAuthorizer((action, table) => {
    if (action === constants.SQLITE_ATTACH) return constants.SQLITE_DENY
    if (action === constants.SQLITE_DROP_TABLE && parents.has(table.toLowerCase())) {
      blockedTable = table
      return constants.SQLITE_DENY
    }
    return constants.SQLITE_OK
  })
  try {
    for (const file of files) {
      let remaining = await readFile(file, 'utf8')
      try {
        while (true) {
          // Strip only leading whitespace, delimiters and comments; SQLite finds
          // statement boundaries, including quoted text and trigger bodies.
          remaining = remaining.replace(/^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '')
          if (!remaining) break
          parents = new Set(db.prepare(`
            SELECT DISTINCT lower(f."table") AS name
            FROM sqlite_schema AS s, pragma_foreign_key_list(s.name) AS f
            WHERE s.type = 'table'
          `).all().map(row => row.name))
          const statement = db.prepare(remaining)
          const length = statement.sourceSQL.length
          statement.run()
          remaining = remaining.slice(length)
        }
      } catch (error) {
        return [{
          file: relative(ROOT, file),
          message: blockedTable
            ? `Cannot DROP referenced parent table "${blockedTable}". D1 may execute foreign-key actions during a rebuild; follow docs/database/migrations.md.`
            : `Migration chain cannot be validated: ${error.message}`,
        }]
      }
    }
    return []
  } finally {
    db.close()
  }
}

let totalViolations = 0

const sqlFiles = await collectSqlFiles()

for (const violation of lintEpochBaseline(sqlFiles)) {
  console.error(`  ✗ ${violation.file} — ${violation.message}`)
  totalViolations++
}

for (const violation of lintDuplicateMigrationNumbers(sqlFiles)) {
  console.error(`  ✗ ${violation.file} — ${violation.message}`)
  totalViolations++
}

for (const file of sqlFiles) {
  const sql = await readFile(file, 'utf8')
  const violations = lintTransactionControl(sql, file)

  if (violations.length === 0) {
    console.log(`  ✓ ${relative(ROOT, file)}`)
    continue
  }

  for (const violation of violations) {
    console.error(`  ✗ ${violation.file}:${violation.line} — ${violation.message}`)
    totalViolations++
  }
}

if (totalViolations === 0) {
  for (const violation of await lintReferencedParentDrops(sqlFiles)) {
    console.error(`  ✗ ${violation.file} — ${violation.message}`)
    totalViolations++
  }
}

console.log(`\nMigration guardrails finished with ${totalViolations} violation(s).`)

if (totalViolations > 0) {
  process.exit(1)
}
