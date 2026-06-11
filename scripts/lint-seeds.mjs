#!/usr/bin/env node
/**
 * Seed and curated-fixture guardrails.
 *
 * 1. Rejects undeclared `seeds/*.sql` files.
 * 2. Ensures any checked SQL seed still honors the site seed contract.
 * 3. Flags curated fixture media regressions:
 *    - `external_url` providers
 *    - repo-local `/public/`, `/images/`, `/videos/` tenant asset paths
 *    - third-party hosted tenant media URLs in seeded media fields
 *
 * Usage:
 *   node scripts/lint-seeds.mjs
 *   node scripts/lint-seeds.mjs --file client-imports/acme/seed-preview.sql
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    file: { type: 'string' },
  },
  allowPositionals: false,
})

const ROOT = process.cwd()
const REQUIRED_FIELDS = ['vertical', 'content_source', 'media_source']
const ALLOWED_GENERATED_SEED_SQL = new Set([])
const CURATED_FIXTURE_FILES = [
  'seed-definitions/demo.ts',
  'seed-definitions/pottery-house.ts',
  'seed-definitions/kikuzuki.ts',
]

async function collectSqlFiles() {
  if (args.file) {
    if (!existsSync(args.file)) {
      console.error(`File not found: ${args.file}`)
      process.exit(1)
    }
    return [args.file]
  }

  const files = []
  const seedsDir = join(ROOT, 'seeds')
  if (existsSync(seedsDir)) {
    const entries = await readdir(seedsDir)
    for (const entry of entries) {
      if (!entry.endsWith('.sql')) continue
      const rel = relative(ROOT, join(seedsDir, entry))
      if (ALLOWED_GENERATED_SEED_SQL.has(rel)) {
        files.push(join(seedsDir, entry))
      }
    }
  }

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

async function collectUnexpectedSeedOutputs() {
  if (args.file) return []

  const violations = []
  const seedsDir = join(ROOT, 'seeds')
  if (!existsSync(seedsDir)) return violations

  const entries = await readdir(seedsDir)
  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue
    const rel = relative(ROOT, join(seedsDir, entry))
    if (!ALLOWED_GENERATED_SEED_SQL.has(rel)) {
      violations.push({
        file: rel,
        message: 'Unexpected checked-in seeds/*.sql output. Curated tenant seeds must be ephemeral.',
      })
    }
  }

  return violations
}

function lintSql(sql, filePath) {
  const violations = []
  const insertRe = /INSERT\s+INTO\s+sites\s*\(([^)]+)\)/gi
  let match

  while ((match = insertRe.exec(sql)) !== null) {
    const columns = match[1]
      .split(',')
      .map((column) => column.trim().replace(/[`"[\]]/g, '').toLowerCase())

    const missing = REQUIRED_FIELDS.filter((field) => !columns.includes(field))
    if (missing.length === 0) continue

    const line = sql.slice(0, match.index).split('\n').length
    violations.push({
      file: relative(ROOT, filePath),
      line,
      message: `INSERT INTO sites missing: ${missing.join(', ')}`,
    })
  }

  return violations
}

function lintCuratedFixtureSource(source, filePath) {
  const violations = []
  const rel = relative(ROOT, filePath)
  const patterns = [
    {
      regex: /provider:\s*'external_url'/g,
      message: 'Curated fixtures may not use external_url media providers.',
    },
    {
      regex: /(?:publicUrl|thumbnailUrl|reviewerPhotoUrl|content):\s*['"]\/(?:public|images|videos)\//g,
      message: 'Curated fixtures may not point tenant media at repo-local /public, /images, or /videos paths.',
    },
    {
      regex: /(?:publicUrl|thumbnailUrl|reviewerPhotoUrl|content):\s*['"]https?:\/\/(?!imagedelivery\.net\/|media\.krabiclaw\.com\/)/g,
      message: 'Curated fixtures may not point tenant media at third-party hosted URLs.',
    },
  ]

  for (const { regex, message } of patterns) {
    let match
    while ((match = regex.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length
      violations.push({ file: rel, line, message })
    }
  }

  return violations
}

let totalViolations = 0

for (const violation of await collectUnexpectedSeedOutputs()) {
  console.error(`  ✗ ${violation.file} — ${violation.message}`)
  totalViolations++
}

for (const file of await collectSqlFiles()) {
  const sql = await readFile(file, 'utf8')
  const violations = lintSql(sql, file)

  if (violations.length === 0) {
    console.log(`  ✓ ${relative(ROOT, file)}`)
    continue
  }

  for (const violation of violations) {
    console.error(`  ✗ ${violation.file}:${violation.line} — ${violation.message}`)
    totalViolations++
  }
}

for (const rel of CURATED_FIXTURE_FILES) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) continue

  const source = await readFile(file, 'utf8')
  const violations = lintCuratedFixtureSource(source, file)

  if (violations.length === 0) {
    console.log(`  ✓ ${rel}`)
    continue
  }

  for (const violation of violations) {
    console.error(`  ✗ ${violation.file}:${violation.line} — ${violation.message}`)
    totalViolations++
  }
}

console.log(`\nSeed guardrails finished with ${totalViolations} violation(s).`)

if (totalViolations > 0) {
  process.exit(1)
}
