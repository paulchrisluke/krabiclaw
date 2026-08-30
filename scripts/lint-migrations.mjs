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
 * 2. Requires the epoch-3 baseline to remain first and rejects duplicate
 *    migration numbers. Every file applied to an active D1 ID is immutable;
 *    squashing starts a new database epoch instead of rewriting this one.
 * Usage:
 *   node scripts/lint-migrations.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'migrations')
const EPOCH_BASELINE = '0000_epoch_3_baseline.sql'

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
    message: 'Epoch 3 must start with its immutable generated baseline. A future squash requires new D1 resources and a new database epoch.',
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

console.log(`\nMigration guardrails finished with ${totalViolations} violation(s).`)

if (totalViolations > 0) {
  process.exit(1)
}
