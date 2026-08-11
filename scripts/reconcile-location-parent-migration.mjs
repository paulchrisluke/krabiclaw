#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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
const CASCADE_RESTORE_ORDER = [
  'business_location_translations',
  'menus',
  'reservation_slot_overrides',
  'experiences',
  'location_qa',
  'reviews',
  'invitation_access_scope',
  'reservation_submissions',
  'menu_translations',
  'menu_items',
  'experience_slot_overrides',
  'experience_media',
  'experience_bookings',
  'booking_policies',
  'review_media',
  'menu_item_translations',
  'menu_item_media',
]
const NULLABLE_LOCATION_RELATIONSHIPS = [
  ['chowbot_conversations', 'selected_location_id'],
  ['contact_submissions', 'location_id'],
  ['dashboard_preferences', 'selected_location_id'],
  ['google_place_snapshots', 'location_id'],
  ['guest_threads', 'location_id'],
  ['mcp_tool_call_events', 'location_id'],
  ['mcp_workspace_preferences', 'location_id'],
  ['media_assets', 'location_id'],
  ['notification_events', 'location_id'],
  ['notifications', 'location_id'],
  ['offerings', 'location_id'],
  ['posts', 'location_id'],
  ['review_requests', 'location_id'],
  ['site_events', 'location_id'],
  ['site_pageview_events', 'location_id'],
]
const BACKUP_PREFIX = '__reconcile_0111_'

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
  return { query: execute, run: execute, batch: statements => execute(statements.join(';\n')) }
}

async function tableColumns(db, table) {
  return new Set((await db.query(`PRAGMA table_info(${table})`)).map(row => row.name))
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function tableExists(db, table) {
  const rows = await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${quoteSql(table)}`)
  return rows.length === 1
}

async function primaryKeyColumns(db, table) {
  return (await db.query(`PRAGMA table_info(${quoteIdentifier(table)})`))
    .filter(row => Number(row.pk) > 0)
    .toSorted((a, b) => Number(a.pk) - Number(b.pk))
    .map(row => String(row.name))
}

export function parentRebuildStatements(migrationSql) {
  const statements = migrationSql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)
  const start = statements.findIndex(statement => /CREATE TABLE [`"]?__new_business_locations[`"]?/i.test(statement))
  const end = statements.findIndex(statement => /DROP TABLE [`"]?google_business_connections[`"]?/i.test(statement))
  if (start < 0 || end <= start) throw new Error('Could not isolate the immutable 0111 business_locations rebuild')
  return statements.slice(start, end).map(statement => statement.replaceAll('__um_backup_business_locations', 'business_locations'))
}

async function atomicCleanupStatements(db, rebuildStatements) {
  const existingBackup = await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '${BACKUP_PREFIX}%'`)
  if (existingBackup.length > 0) throw new Error('An unfinished 0111 relationship backup already exists; operator recovery is required')

  const backups = []
  const restores = []
  const assertions = []
  const cleanup = []
  for (const table of CASCADE_RESTORE_ORDER) {
    if (!(await tableExists(db, table))) continue
    const backup = `${BACKUP_PREFIX}rows_${table}`
    const columns = [...await tableColumns(db, table)]
    const primaryKeys = await primaryKeyColumns(db, table)
    if (primaryKeys.length === 0) throw new Error(`${table} must have a primary key before preserving cascaded rows`)
    const columnSql = columns.map(quoteIdentifier).join(', ')
    const matchSql = primaryKeys.map(column => `target.${quoteIdentifier(column)} = backup.${quoteIdentifier(column)}`).join(' AND ')
    backups.push(`CREATE TABLE ${quoteIdentifier(backup)} AS SELECT * FROM ${quoteIdentifier(table)}`)
    restores.push(`
      INSERT INTO ${quoteIdentifier(table)} (${columnSql})
      SELECT ${columns.map(column => `backup.${quoteIdentifier(column)}`).join(', ')}
        FROM ${quoteIdentifier(backup)} AS backup
       WHERE NOT EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} AS target WHERE ${matchSql})
    `)
    assertions.push(`
      INSERT INTO ${quoteIdentifier(`${BACKUP_PREFIX}assert`)} (violation)
      SELECT ${quoteSql(`${table}_row_count_mismatch`)}
       WHERE (SELECT COUNT(*) FROM ${quoteIdentifier(table)}) != (SELECT COUNT(*) FROM ${quoteIdentifier(backup)})
    `)
    cleanup.push(`DROP TABLE ${quoteIdentifier(backup)}`)
  }

  for (const [table, column] of NULLABLE_LOCATION_RELATIONSHIPS) {
    if (!(await tableExists(db, table))) continue
    const primaryKeys = await primaryKeyColumns(db, table)
    if (primaryKeys.length === 0) throw new Error(`${table} must have a primary key before preserving ${column}`)
    const backup = `${BACKUP_PREFIX}links_${table}_${column}`
    const selected = [...primaryKeys, column].map(quoteIdentifier).join(', ')
    const matchSql = primaryKeys.map(pk => `target.${quoteIdentifier(pk)} = backup.${quoteIdentifier(pk)}`).join(' AND ')
    backups.push(`CREATE TABLE ${quoteIdentifier(backup)} AS SELECT ${selected} FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IS NOT NULL`)
    restores.push(`
      UPDATE ${quoteIdentifier(table)} AS target
         SET ${quoteIdentifier(column)} = (
           SELECT backup.${quoteIdentifier(column)} FROM ${quoteIdentifier(backup)} AS backup WHERE ${matchSql}
         )
       WHERE EXISTS (SELECT 1 FROM ${quoteIdentifier(backup)} AS backup WHERE ${matchSql})
    `)
    assertions.push(`
      INSERT INTO ${quoteIdentifier(`${BACKUP_PREFIX}assert`)} (violation)
      SELECT ${quoteSql(`${table}_${column}_relationship_count_mismatch`)}
       WHERE (SELECT COUNT(*) FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IS NOT NULL)
          != (SELECT COUNT(*) FROM ${quoteIdentifier(backup)})
    `)
    cleanup.push(`DROP TABLE ${quoteIdentifier(backup)}`)
  }
  const assertionTable = quoteIdentifier(`${BACKUP_PREFIX}assert`)
  return [
    ...backups,
    ...rebuildStatements,
    ...restores,
    'DROP TABLE IF EXISTS google_business_connections',
    `CREATE TABLE ${assertionTable} (violation text NOT NULL CHECK (violation = ''))`,
    ...assertions,
    `INSERT INTO ${assertionTable} (violation) SELECT 'pragma_foreign_key_check' WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)`,
    `INSERT INTO ${assertionTable} (violation) SELECT 'google_connection_id_remained' WHERE EXISTS (SELECT 1 FROM pragma_table_info('business_locations') WHERE name = 'google_connection_id')`,
    `DROP TABLE ${assertionTable}`,
    ...cleanup,
  ]
}

export async function removeLegacyGoogleConnectionSchema(db, rebuildStatements) {
  const locationColumns = await tableColumns(db, 'business_locations')
  if (!locationColumns.has('google_connection_id')) return { status: 'already_clean' }
  if (typeof db.batch !== 'function') throw new Error('Atomic D1 batch support is required for complete location cleanup')
  const statements = await atomicCleanupStatements(db, rebuildStatements)
  await db.batch(statements)
  const violations = await db.query('PRAGMA foreign_key_check')
  if (violations.length > 0) throw new Error('Foreign-key violations found after complete business_locations cleanup')
  if ((await tableColumns(db, 'business_locations')).has('google_connection_id')) {
    throw new Error('business_locations.google_connection_id remained after complete cleanup')
  }
  return { status: 'cleaned', statements: statements.length }
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

export async function reconcileLocationParentMigration(db, { rebuildStatements = [] } = {}) {
  const migrations = await db.query('SELECT id, name FROM d1_migrations ORDER BY id')
  if (migrations.some(row => row.name === LEGACY_MIGRATION)) {
    const cleanup = await removeLegacyGoogleConnectionSchema(db, rebuildStatements)
    return { status: cleanup.status === 'cleaned' ? 'reconciled_and_cleaned' : 'already_reconciled', migration: LEGACY_MIGRATION, cleanup }
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
  const migrationSql = await readFile(path.resolve('migrations/0111_sharp_switch.sql'), 'utf8')
  const evidence = await reconcileLocationParentMigration(createWranglerD1Adapter({ remote }), {
    rebuildStatements: parentRebuildStatements(migrationSql),
  })
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
