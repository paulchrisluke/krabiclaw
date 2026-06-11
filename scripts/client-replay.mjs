#!/usr/bin/env node
/**
 * client-replay — hash-verified replay of an approved client import into any D1 environment.
 *
 * Reads client-imports/<slug>/approved.json, verifies the manifest hash, then executes
 * client-imports/<slug>/seed-preview.sql against the target D1. This is the standard way
 * to re-seed a real client import in local dev, staging, or preview without re-running the
 * full onboarding pipeline.
 *
 * Usage:
 *   yarn client:replay --slug pottery-house-krabi               # local D1 (default)
 *   yarn client:replay --slug pottery-house-krabi --remote      # production D1
 *   yarn client:replay --slug pottery-house-krabi --env staging # staging D1
 *   yarn client:replay --slug pottery-house-krabi --env preview # preview D1
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function arg(name) {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : null
}

const SLUG = arg('--slug')
const ENV = arg('--env')
const REMOTE = args.includes('--remote') || ENV != null

if (!SLUG) {
  console.error('Error: --slug <slug> is required.')
  console.error('')
  console.error('Usage:')
  console.error('  yarn client:replay --slug pottery-house-krabi')
  console.error('  yarn client:replay --slug pottery-house-krabi --env staging')
  console.error('  yarn client:replay --slug pottery-house-krabi --remote')
  process.exit(1)
}

const OUT_DIR = join(process.cwd(), 'client-imports', SLUG)
const approvedPath = join(OUT_DIR, 'approved.json')
const seedPath = join(OUT_DIR, 'seed-preview.sql')
const manifestPath = join(OUT_DIR, 'client-manifest.json')

// Gate 1: approved.json must exist and be approved
if (!existsSync(approvedPath)) {
  console.error(`Error: No approved.json found at ${approvedPath}`)
  console.error(`  Run the onboarding pipeline first: yarn client:import --slug ${SLUG} --dry-run`)
  process.exit(1)
}

const approvedRaw = JSON.parse(await readFile(approvedPath, 'utf8'))

if (!approvedRaw.approved) {
  console.error('Error: approved.json has approved: false — cannot replay an unapproved import.')
  process.exit(1)
}

if (approvedRaw.invalidated) {
  console.error(`Error: Approval was invalidated — ${approvedRaw.invalidated_reason ?? 'approval invalidated after a subsequent override'}`)
  process.exit(1)
}

// Gate 2: manifest and seed files must still exist
if (!existsSync(manifestPath) || !existsSync(seedPath)) {
  console.error('Error: client-manifest.json or seed-preview.sql is missing.')
  console.error(`  Expected at: ${OUT_DIR}`)
  console.error(`  Re-run the onboarding pipeline to regenerate them.`)
  process.exit(1)
}

// Gate 3: hash must match the stored approval hash
const manifestContent = await readFile(manifestPath, 'utf8')
const seedContent = await readFile(seedPath, 'utf8')
const currentHash = createHash('sha256').update(manifestContent).update(seedContent).digest('hex')

if (currentHash !== approvedRaw.manifest_hash) {
  console.error('Error: Manifest hash mismatch — the dry-run output has changed since approval.')
  console.error('  Re-run --dry-run and --approve to refresh the approval for the current output.')
  console.error(`  Stored:  ${approvedRaw.manifest_hash}`)
  console.error(`  Current: ${currentHash}`)
  process.exit(1)
}

const target = ENV
  ? `${ENV} D1 (remote)`
  : REMOTE
    ? 'production D1 (remote)'
    : 'local D1'

console.log(`✓ Hash verified (${currentHash.slice(0, 12)}…)`)
console.log(`  Approved by: ${approvedRaw.approved_by} at ${approvedRaw.approved_at}`)
console.log(`  Slug: ${SLUG}`)
console.log(`\n→ Replaying seed into ${target}...`)

const d1Args = ['wrangler', 'd1', 'execute', 'DB']
if (ENV) {
  d1Args.push('--env', ENV, '--remote')
} else if (REMOTE) {
  d1Args.push('--remote')
} else {
  d1Args.push('--local')
}
d1Args.push('--file', seedPath)

const result = spawnSync('yarn', d1Args, { stdio: 'inherit', cwd: process.cwd() })

if (result.status !== 0) {
  console.error('\n✗ Seed replay failed — check wrangler output above.')
  process.exit(1)
}

console.log(`\n✓ Replay complete: ${SLUG} → ${target}`)
