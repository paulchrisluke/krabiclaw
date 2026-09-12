#!/usr/bin/env node
/**
 * Names each Product's cover on a database that was loaded before the
 * rebaseline derived one.
 *
 * The catalog epoch (#919) carried every product photograph across as
 * `product:gallery`, because the model it came from had one undifferentiated
 * list. The public grid and the product page read `product:image` — the cover
 * the model names — so on 2026-09-12 all 7 Pottery House products, 1 Kikuzuki
 * product and 3 demo products rendered with no photograph at all while their
 * gallery rows sat beside them.
 *
 * Data only: no schema change, so this is not a migration (see CLAUDE.md). The
 * transform is the one the rebaseline now derives, applied once to the
 * databases already loaded without it, and it is idempotent — a product that
 * already names a cover is left alone.
 *
 * Usage:
 *   node scripts/promote-product-covers.mjs --local
 *   node scripts/promote-product-covers.mjs --env preview
 *   node scripts/promote-product-covers.mjs --env staging
 *   node scripts/promote-product-covers.mjs --env production
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { PROMOTE_PRODUCT_COVERS_SQL, RENUMBER_PRODUCT_GALLERIES_SQL } from './lib/product-covers.mjs'

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
// environment is addressed through wrangler's --env flag (scripts/reset-d1.mjs
// says the same thing, for the same reason).
const target = local ? ['--local'] : [...(environment === 'production' ? [] : ['--env', environment]), '--remote']

function d1(sql) {
  const result = spawnSync(WRANGLER_BIN, ['d1', 'execute', 'DB', ...target, '--json', '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: join(tmpdir(), 'krabiclaw-wrangler-logs') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Wrangler failed for: ${sql}`)
  const payload = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))
  return payload
}

const COVERLESS = `SELECT count(*) AS n FROM (SELECT DISTINCT owner_id, site_id FROM media_placements
   WHERE owner_type = 'product' AND slot = 'gallery' AND status = 'active') owners
 WHERE NOT EXISTS (SELECT 1 FROM media_placements i
                    WHERE i.owner_type = 'product' AND i.slot = 'image' AND i.status = 'active'
                      AND i.owner_id = owners.owner_id AND i.site_id = owners.site_id)`

const before = d1(COVERLESS)[0].results[0].n
const promoted = d1(PROMOTE_PRODUCT_COVERS_SQL)[0].meta.changes
if (promoted > 0) d1(RENUMBER_PRODUCT_GALLERIES_SQL)
const after = d1(COVERLESS)[0].results[0].n
console.log(`Products with a gallery and no cover: ${before} before, ${after} after. Covers promoted: ${promoted}.`)
if (after !== 0) {
  console.error('Some products still have a gallery and no cover.')
  process.exit(1)
}
