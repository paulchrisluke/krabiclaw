#!/usr/bin/env node
/**
 * D1 migration guardrails.
 *
 * D1 rejects raw BEGIN/COMMIT/ROLLBACK (see CLAUDE.md "D1 does not support raw
 * transactions" — confirmed both via Drizzle's execute() and the raw binding).
 * A migration that slips one in applies fine in isolation but breaks the first
 * write path that tries to wrap it, so this is checked at the SQL-file level:
 *
 * 1. Rejects bare BEGIN/COMMIT/ROLLBACK statements in migrations/*.sql outside
 *    of CREATE TRIGGER ... BEGIN ... END bodies (where BEGIN/END are trigger
 *    body delimiters, not transaction control, and are always allowed).
 * 2. Rejects renaming/removing the historical, already-applied 0001-0007
 *    migration filenames (see CLAUDE.md "Database Schema Workflow" — wrangler
 *    tracks applied migrations by filename, not content, so renaming a
 *    filename that's already applied anywhere makes wrangler re-run it and
 *    fail with "table X already exists").
 * 3. Rejects rebuilding the sites parent table. D1/Drizzle sends migration
 *    statements in separate batches, so PRAGMA foreign_keys=OFF does not
 *    protect site-owned rows when a later statement drops sites.
 *
 * Usage:
 *   node scripts/lint-migrations.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'migrations')

const REQUIRED_HISTORICAL_FILES = [
  '0001_initial.sql',
  '0002_add_work_requests_and_platform_content_components.sql',
  '0003_add_pageview_visitor_geo_columns.sql',
  '0004_add_platform_pageview_tracking.sql',
  '0005_drop_platform_content_components_type_check.sql',
  '0006_add_platform_docs_canonical_url_robots.sql',
  '0007_add_missing_platform_blog_post_seo_columns.sql',
]

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
      message: `Bare "${match[1]}" statement outside a CREATE TRIGGER body — D1 rejects raw transaction control (see CLAUDE.md "D1 does not support raw transactions").`,
    })
  }

  return violations
}

function lintSitesParentRebuild(sql, filePath) {
  const violations = []
  const patterns = [
    { re: /CREATE\s+TABLE\s+[`"]?__new_sites[`"]?/gi, message: 'Creating __new_sites is forbidden' },
    { re: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?sites[`"]?/gi, message: 'Dropping the sites parent table is forbidden' },
  ]

  for (const { re, message } of patterns) {
    let match
    while ((match = re.exec(sql)) !== null) {
      const line = sql.slice(0, match.index).split('\n').length
      violations.push({
        file: relative(ROOT, filePath),
        line,
        message: `${message} — it cascades deletion into tenant-owned tables in D1. Add compatible ALTER/INDEX statements instead.`,
      })
    }
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

function lintHistoricalFilenames(presentFiles) {
  const violations = []
  const presentNames = new Set(presentFiles.map((file) => relative(MIGRATIONS_DIR, file)))

  for (const requiredName of REQUIRED_HISTORICAL_FILES) {
    if (!presentNames.has(requiredName)) {
      violations.push({
        file: `migrations/${requiredName}`,
        message: 'Missing or renamed historical migration file. 0001-0007 are already applied everywhere by filename — never rename, renumber, or squash them.',
      })
    }
  }

  return violations
}

let totalViolations = 0

const sqlFiles = await collectSqlFiles()

for (const violation of lintHistoricalFilenames(sqlFiles)) {
  console.error(`  ✗ ${violation.file} — ${violation.message}`)
  totalViolations++
}

for (const file of sqlFiles) {
  const sql = await readFile(file, 'utf8')
  const violations = [
    ...lintTransactionControl(sql, file),
    ...lintSitesParentRebuild(sql, file),
  ]

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
