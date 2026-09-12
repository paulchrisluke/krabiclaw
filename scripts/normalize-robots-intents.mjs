#!/usr/bin/env node
/**
 * Canonicalizes every stored `robots` value to a robots intent.
 *
 * The column used to be free text, so the same intent is stored several ways:
 * on 2026-09-10 the production snapshot held `index, follow` (5 rows) and
 * `index,follow` (9 rows) in `content_documents`, and NULL everywhere else.
 * Since shared/robots-directive.ts now derives the served directive from the
 * intent, those rows serve correctly either way — this brings storage in line
 * with the contract so the read side never has to canonicalize a legacy row.
 *
 * Data only: no schema change, so this is not a migration (see CLAUDE.md).
 * It is idempotent, and it reports any value it cannot name instead of
 * guessing one.
 *
 * Usage:
 *   node scripts/normalize-robots-intents.mjs --local
 *   node scripts/normalize-robots-intents.mjs --env preview
 *   node scripts/normalize-robots-intents.mjs --env staging
 *   node scripts/normalize-robots-intents.mjs --env production
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler')
const TABLES = ['sites', 'business_locations', 'products', 'content_documents']
const INTENTS = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']

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
  const payload = JSON.parse(result.stdout)
  return payload.flatMap(entry => entry.results ?? [])
}

// Canonicalization the same four ways shared/robots-directive.ts does: lowercase,
// drop whitespace, and put indexing before following.
function canonical(value) {
  const tokens = String(value).toLowerCase().split(',').map(token => token.trim()).filter(Boolean)
  const indexing = tokens.filter(token => token === 'index' || token === 'noindex')
  const following = tokens.filter(token => token === 'follow' || token === 'nofollow')
  if (tokens.length !== indexing.length + following.length) return null
  if (indexing.length > 1 || following.length > 1) return null
  if (!indexing.length && !following.length) return null
  const intent = `${indexing[0] ?? 'index'},${following[0] ?? 'follow'}`
  return INTENTS.includes(intent) ? intent : null
}

let changed = 0
const unnameable = []

for (const table of TABLES) {
  const rows = d1(`SELECT robots AS value, count(*) AS rows FROM ${table} WHERE robots IS NOT NULL GROUP BY robots`)
  for (const row of rows) {
    // A blank is not an unnameable intent, it is an unset one, and the sweep
    // below clears it. Listing it here made the script fix the rows and then
    // exit 1 saying it could not.
    if (!String(row.value).trim()) continue
    const intent = canonical(row.value)
    if (!intent) {
      unnameable.push(`${table}: ${JSON.stringify(row.value)} (${row.rows} row(s))`)
      continue
    }
    if (intent === row.value) continue
    d1(`UPDATE ${table} SET robots = '${intent}' WHERE robots = '${String(row.value).replaceAll("'", "''")}'`)
    console.log(`${table}: ${row.rows} row(s) ${JSON.stringify(row.value)} -> ${intent}`)
    changed += Number(row.rows)
  }
  // Blank strings are neither an intent nor "unset"; make them unset.
  d1(`UPDATE ${table} SET robots = NULL WHERE robots IS NOT NULL AND trim(robots) = ''`)
}

if (unnameable.length) {
  console.error(`Values that name no supported intent:\n${unnameable.map(item => `- ${item}`).join('\n')}`)
  console.error('Fix these through the editor or the MCP tools; this script will not guess an intent.')
  process.exit(1)
}

console.log(`Robots intents are canonical (${changed} row(s) rewritten).`)
