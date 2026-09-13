#!/usr/bin/env node
/**
 * Moves a pricing note written under the wrong handle to the one the catalog
 * reads.
 *
 * The catalog has one handle for a price in words, PRICING_NOTE_HANDLE =
 * 'pricing.note' (shared/metafields.ts). The rebaseline derived a class's
 * `experience_json.pricing_note` as 'experience.pricing_note' instead, so on
 * 2026-09-13 production held one such definition (Pottery House, 2 products:
 * "Contact us for group pricing", "Contact us") that the price never saw —
 * both products read "Unavailable" on the public grid and "No price set" in
 * the CMS while carrying a price the merchant wrote.
 *
 * Data only: no schema change, so this is not a migration (see CLAUDE.md).
 * Idempotent, and it refuses rather than merges when an organization already
 * has a 'pricing.note' definition beside the misnamed one.
 *
 * Usage:
 *   node scripts/repair-pricing-note-handle.mjs --local
 *   node scripts/repair-pricing-note-handle.mjs --env staging
 *   node scripts/repair-pricing-note-handle.mjs --env production
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler')

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const local = process.argv.includes('--local')
const environment = readOption('--env')
if (!local && !environment) {
  console.error('Pass --local or --env <preview|staging|production>')
  process.exit(1)
}
// The production binding is the top-level [[d1_databases]]; every other
// environment is addressed through wrangler's --env flag.
const target = local ? ['--local'] : [...(environment === 'production' ? [] : ['--env', environment]), '--remote']

function d1(sql) {
  const result = spawnSync(WRANGLER_BIN, ['d1', 'execute', 'DB', ...target, '--json', '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: join(tmpdir(), 'krabiclaw-wrangler-logs') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Wrangler failed for: ${sql.slice(0, 120)}`)
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))
}

const MISNAMED = `SELECT d.organization_id, d.id,
   EXISTS (SELECT 1 FROM metafield_definitions c WHERE c.organization_id = d.organization_id AND c.namespace = 'pricing' AND c.key = 'note') AS collides
  FROM metafield_definitions d WHERE d.namespace = 'experience' AND d.key = 'pricing_note'`

const rows = d1(MISNAMED)[0].results
const collisions = rows.filter(row => row.collides)
if (collisions.length) {
  console.error(`Refusing: ${collisions.length} organization(s) already have pricing.note beside experience.pricing_note: ${collisions.map(row => row.organization_id).join(', ')}`)
  process.exit(1)
}
if (rows.length) {
  d1(`UPDATE metafield_definitions SET namespace = 'pricing', key = 'note', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE namespace = 'experience' AND key = 'pricing_note'`)
}
const remaining = d1(MISNAMED)[0].results.length
console.log(`Misnamed pricing-note definitions: ${rows.length} found, ${remaining} remaining after the rename.`)
if (remaining) process.exit(1)
