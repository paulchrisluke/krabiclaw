#!/usr/bin/env node
/**
 * Schema lint for seed SQL files.
 *
 * Fails if any INSERT INTO sites omits the required seed contract fields:
 *   vertical, content_source, media_source
 *
 * Usage:
 *   node scripts/lint-seeds.mjs
 *   node scripts/lint-seeds.mjs --file seeds/pottery-house-krabi.sql
 *
 * Exit code 0 = all clean. Non-zero = violations found.
 */

import { readdir, readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'

const { values: args } = parseArgs({
  options: {
    file: { type: 'string' },
  },
  allowPositionals: false,
})

const ROOT = process.cwd()
const REQUIRED_FIELDS = ['vertical', 'content_source', 'media_source']

// ── File discovery ────────────────────────────────────────────────────────────

async function collectSqlFiles() {
  if (args.file) {
    if (!existsSync(args.file)) {
      console.error(`File not found: ${args.file}`)
      process.exit(1)
    }
    return [args.file]
  }

  const files = []

  // seeds/*.sql
  const seedsDir = join(ROOT, 'seeds')
  if (existsSync(seedsDir)) {
    const entries = await readdir(seedsDir)
    for (const e of entries) {
      if (e.endsWith('.sql')) files.push(join(seedsDir, e))
    }
  }

  // client-imports/*/seed-preview.sql
  const importDir = join(ROOT, 'client-imports')
  if (existsSync(importDir)) {
    const slugDirs = await readdir(importDir)
    for (const slug of slugDirs) {
      const preview = join(importDir, slug, 'seed-preview.sql')
      if (existsSync(preview)) files.push(preview)
    }
  }

  return files
}

// ── Lint logic ────────────────────────────────────────────────────────────────

/**
 * Returns an array of violation objects for INSERT INTO sites statements
 * that are missing one or more required fields.
 *
 * Strategy: find each INSERT INTO sites block, extract the column list,
 * check required fields are present.
 */
function lintSql(sql, filePath) {
  const violations = []

  // Match multi-line INSERT INTO sites (...) statements
  // Capture column list between the first ( and the matching )
  const insertRe = /INSERT\s+INTO\s+sites\s*\(([^)]+)\)/gi
  let match

  while ((match = insertRe.exec(sql)) !== null) {
    const columnBlock = match[1]
    const columns = columnBlock
      .split(',')
      .map(c => c.trim().replace(/[`"[\]]/g, '').toLowerCase())

    const missing = REQUIRED_FIELDS.filter(f => !columns.includes(f))

    if (missing.length > 0) {
      // Find line number
      const linesBefore = sql.slice(0, match.index).split('\n')
      const lineNumber = linesBefore.length

      violations.push({
        file: relative(ROOT, filePath),
        line: lineNumber,
        missing,
        snippet: match[0].slice(0, 120).replace(/\n/g, ' '),
      })
    }
  }

  return violations
}

// ── Main ─────────────────────────────────────────────────────────────────────

const files = await collectSqlFiles()

if (files.length === 0) {
  console.log('No seed SQL files found — nothing to lint.')
  process.exit(0)
}

let totalViolations = 0

for (const file of files) {
  const sql = await readFile(file, 'utf8')
  const violations = lintSql(sql, file)

  if (violations.length === 0) {
    console.log(`  ✓ ${relative(ROOT, file)}`)
  } else {
    for (const v of violations) {
      console.error(`  ✗ ${v.file}:${v.line} — INSERT INTO sites missing: ${v.missing.join(', ')}`)
      console.error(`    ${v.snippet}...`)
      totalViolations++
    }
  }
}

console.log(`\n${files.length} file(s) checked, ${totalViolations} violation(s).`)

if (totalViolations > 0) {
  console.error('\nFIX: Every INSERT INTO sites must include vertical, content_source, and media_source.')
  process.exit(1)
} else {
  process.exit(0)
}
