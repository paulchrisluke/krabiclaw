#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const LEGACY_MIGRATION = '0111_sharp_switch.sql'
const REQUIRED_PREDECESSOR = '0110_giant_stick.sql'
const PRESERVED_TABLES = [
  'business_locations',
  'experiences',
  'menus',
  'reviews',
  'reservation_submissions',
  'experience_bookings',
  'location_qa',
]

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function resultRows(value) {
  if (Array.isArray(value)) {
    const rows = value.flatMap(entry => Array.isArray(entry?.results) ? entry.results : [])
    if (rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return rows
  }
  throw new Error('Wrangler D1 response did not contain result rows')
}

export function createWranglerD1Adapter({ remote = true } = {}) {
  const targetArgs = remote ? ['--remote'] : ['--local']
  function execute(sql) {
    const result = spawnSync(
      'node_modules/.bin/wrangler',
      ['d1', 'execute', 'DB', ...targetArgs, '--command', sql, '--json'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000 },
    )
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Wrangler D1 execution failed')
    return resultRows(JSON.parse(result.stdout))
  }
  return { query: execute, run: execute }
}

async function tableColumns(db, table) {
  return new Set((await db.query(`PRAGMA table_info(${table})`)).map(row => row.name))
}

async function tableCounts(db) {
  const counts = {}
  for (const table of PRESERVED_TABLES) {
    const [row] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`)
    counts[table] = Number(row?.count)
  }
  return counts
}

function assertCountsEqual(before, after) {
  for (const table of PRESERVED_TABLES) {
    if (before[table] !== after[table]) {
      throw new Error(`${table} row count changed during safe 0111 reconciliation: ${before[table]} -> ${after[table]}`)
    }
  }
}

export async function reconcileLocationParentMigration(db) {
  const migrations = await db.query('SELECT id, name FROM d1_migrations ORDER BY id')
  if (migrations.some(row => row.name === LEGACY_MIGRATION)) {
    return { status: 'already_reconciled', migration: LEGACY_MIGRATION }
  }
  const latest = migrations.at(-1)
  if (latest?.name !== REQUIRED_PREDECESSOR) {
    throw new Error(`Safe 0111 reconciliation requires ${REQUIRED_PREDECESSOR} as the latest migration; found ${latest?.name ?? 'none'}`)
  }

  const before = await tableCounts(db)
  const locationColumns = await tableColumns(db, 'business_locations')
  const qaColumns = await tableColumns(db, 'location_qa')
  for (const required of ['google_location_id', 'google_connection_id']) {
    if (!locationColumns.has(required)) throw new Error(`Expected legacy business_locations.${required} before 0111 reconciliation`)
  }
  if (!qaColumns.has('google_question_id')) {
    throw new Error('Expected legacy location_qa.google_question_id before 0111 reconciliation')
  }

  await db.run(`
    INSERT OR REPLACE INTO site_entitlements
      (id, site_id, organization_id, key, value, source, created_at, updated_at)
    SELECT replace(id, 'google_business', 'google_places'), site_id, organization_id,
           'google_places', value, source, created_at,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM site_entitlements
     WHERE key = 'google_business';
    DELETE FROM site_entitlements WHERE key = 'google_business';
    UPDATE work_requests
       SET type = 'google_places', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE type = 'google_business';
    UPDATE location_qa
       SET source = CASE
         WHEN source IN ('gmb', 'google_maps') THEN 'import'
         WHEN source IN ('llm_generated', 'manual_override') THEN 'manual'
         ELSE source
       END
     WHERE source IN ('gmb', 'google_maps', 'llm_generated', 'manual_override');
  `)
  await db.run('DROP INDEX IF EXISTS idx_location_qa_google_id')
  await db.run('ALTER TABLE location_qa DROP COLUMN google_question_id')
  await db.run('ALTER TABLE business_locations DROP COLUMN google_location_id')
  await db.run('DROP TABLE IF EXISTS google_business_events')

  const after = await tableCounts(db)
  assertCountsEqual(before, after)
  const foreignKeyViolations = await db.query('PRAGMA foreign_key_check')
  if (foreignKeyViolations.length > 0) throw new Error('Foreign-key violations found after safe 0111 reconciliation')

  const finalLocationColumns = await tableColumns(db, 'business_locations')
  const finalQaColumns = await tableColumns(db, 'location_qa')
  if (finalLocationColumns.has('google_location_id') || finalQaColumns.has('google_question_id')) {
    throw new Error('Safe 0111 reconciliation did not remove non-relational legacy columns')
  }
  if (!finalLocationColumns.has('google_connection_id')) {
    throw new Error('Safe 0111 reconciliation must retain the FK-bound compatibility column')
  }

  const nextId = Number(latest.id) + 1
  if (!Number.isInteger(nextId)) throw new Error('Latest D1 migration id is invalid')
  await db.run(`INSERT INTO d1_migrations (id, name) VALUES (${nextId}, ${quoteSql(LEGACY_MIGRATION)})`)
  const marker = await db.query(`SELECT id, name FROM d1_migrations WHERE name = ${quoteSql(LEGACY_MIGRATION)}`)
  if (marker.length !== 1) throw new Error('Safe 0111 reconciliation marker was not recorded')

  return { status: 'reconciled', migration: LEGACY_MIGRATION, preservedCounts: after }
}

async function main(argv = process.argv.slice(2)) {
  const remote = argv.includes('--remote')
  if (!remote && !argv.includes('--local')) {
    throw new Error('Specify exactly one target: --remote or --local')
  }
  if (remote && argv.includes('--local')) throw new Error('Specify only one target')
  const evidence = await reconcileLocationParentMigration(createWranglerD1Adapter({ remote }))
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

