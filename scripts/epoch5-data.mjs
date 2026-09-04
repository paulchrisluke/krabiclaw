#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

const repoRoot = resolve(import.meta.dirname, '..')
const migrationsDirectory = resolve(repoRoot, 'migrations')
const baselineSql = readdirSync(migrationsDirectory)
  .filter(name => /^\d{4}_.+\.sql$/u.test(name))
  .sort()
  .map(name => ({ name, sql: readFileSync(join(migrationsDirectory, name), 'utf8') }))

const RESET_TABLES = new Set([
  'guest_thread_deliveries',
  'guest_thread_entries',
  'guest_threads',
  'notification_reads',
  'notifications',
])

const DELETED_TABLES = new Set([
  'guest_thread_commands',
  'guest_thread_member_state',
  'guest_thread_outbox',
  'guest_thread_sequence_counters',
  'notification_deliveries',
  'notification_events',
])

function assert(condition, message) { if (!condition) throw new Error(message) }
function qi(value) { return `"${String(value).replaceAll('"', '""')}"` }
function tableExists(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) }
function columns(db, table) { return db.prepare(`PRAGMA table_info(${qi(table)})`).all().map(column => column.name) }
function rows(db, table) { return db.prepare(`SELECT * FROM ${qi(table)}`).all() }
function rowCount(db, table) { return db.prepare(`SELECT count(*) AS count FROM ${qi(table)}`).get().count }

function tables(db) {
  return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
    .map(row => row.name)
    .filter(name => name !== 'd1_migrations' && !name.startsWith('sqlite_') && !name.startsWith('_cf_'))
}

function openDatabase(path) {
  if (!path.endsWith('.sql')) return new Database(path, { readonly: true, fileMustExist: true })
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  db.exec(readFileSync(path, 'utf8'))
  return db
}

function hashRows(records, names) {
  const logical = records.map(record => JSON.stringify(names.map(name => record[name]))).sort()
  return createHash('sha256').update(logical.join('\n')).digest('hex')
}

function assertSchemaTransition(source, target) {
  assert(tableExists(source, 'guest_thread_commands'), 'Source must be an Epoch 4 database')
  for (const table of DELETED_TABLES) assert(!tableExists(target, table), `Target still contains ${table}`)

  const expectedTargetTables = tables(source).filter(table => !DELETED_TABLES.has(table)).sort()
  assert(JSON.stringify(expectedTargetTables) === JSON.stringify(tables(target)), 'Application table census changed outside the declared messaging cleanup')

  for (const table of expectedTargetTables) {
    if (RESET_TABLES.has(table)) continue
    assert(JSON.stringify(columns(source, table)) === JSON.stringify(columns(target, table)), `${table}: unexpected column change`)
  }

  const expectedThreadColumns = [
    'id', 'organization_id', 'site_id', 'location_id', 'submission_type', 'submission_id',
    'guest_name', 'guest_email', 'guest_phone', 'conversation_state', 'resolved_at',
    'created_at', 'updated_at',
  ]
  assert(JSON.stringify(columns(target, 'guest_threads')) === JSON.stringify(expectedThreadColumns), 'Target guest_threads shape is not canonical')
  assert(columns(target, 'guest_thread_entries').includes('dedupe_key'), 'Target guest_thread_entries lacks dedupe_key')
  assert(!columns(target, 'guest_thread_entries').includes('external_id'), 'Target guest_thread_entries still has external_id')
  assert(columns(target, 'notifications').includes('source_entry_id'), 'Target notifications lacks source_entry_id')
  assert(!columns(target, 'notifications').includes('channel'), 'Target notifications still contains transport state')
}

function insertRows(db, table, values) {
  if (!values.length) return
  const names = Object.keys(values[0])
  const statement = db.prepare(`INSERT INTO ${qi(table)} (${names.map(qi).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
  db.transaction((records) => {
    for (const record of records) statement.run(names.map(name => record[name] ?? null))
  })(values)
}

function verifyDatabases(source, target) {
  assertSchemaTransition(source, target)
  const retained = []
  for (const table of tables(target)) {
    const targetRows = rows(target, table)
    if (RESET_TABLES.has(table)) {
      assert(targetRows.length === 0, `${table}: historical messaging rows were backfilled`)
      continue
    }
    const names = columns(target, table)
    const sourceRows = rows(source, table)
    const sourceHash = hashRows(sourceRows, names)
    const targetHash = hashRows(targetRows, names)
    assert(sourceRows.length === targetRows.length && sourceHash === targetHash, `${table}: retained data changed`)
    retained.push({ table, count: targetRows.length, hash: targetHash })
  }

  for (const [label, db] of [['source', source], ['target', target]]) {
    const violations = db.pragma('foreign_key_check')
    assert(violations.length === 0, `${label}: ${violations.length} foreign key violations`)
    assert(db.pragma('integrity_check', { simple: true }) === 'ok', `${label}: SQLite integrity check failed`)
  }

  return {
    epoch: 5,
    generated_at: new Date().toISOString(),
    baseline: baselineSql.map(migration => ({
      name: migration.name,
      sha256: createHash('sha256').update(migration.sql).digest('hex'),
    })),
    retained,
    discarded_messaging_rows: Object.fromEntries(
      [...RESET_TABLES, ...DELETED_TABLES]
        .filter(table => tableExists(source, table))
        .sort()
        .map(table => [table, rows(source, table).length]),
    ),
  }
}

function transform(sourcePath, targetPath) {
  assert(existsSync(sourcePath), `Source database not found: ${sourcePath}`)
  assert(!existsSync(targetPath), `Refusing to overwrite an existing target: ${targetPath}`)
  const source = openDatabase(sourcePath)
  const target = new Database(targetPath)
  try {
    target.pragma('foreign_keys = OFF')
    for (const migration of baselineSql) target.exec(migration.sql)
    assertSchemaTransition(source, target)
    for (const table of tables(target)) {
      if (!RESET_TABLES.has(table)) insertRows(target, table, rows(source, table))
    }
    target.pragma('foreign_keys = ON')
    const manifest = verifyDatabases(source, target)
    writeFileSync(`${targetPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    console.log(`Epoch 5 transform wrote ${targetPath}`)
    console.log(`  ${manifest.retained.length} retained tables verified; historical messaging rows were not backfilled`)
  } finally {
    source.close()
    target.close()
  }
}

function verify(sourcePath, targetPath) {
  const source = openDatabase(sourcePath)
  const target = openDatabase(targetPath)
  try {
    const manifest = verifyDatabases(source, target)
    writeFileSync(`${targetPath}.verification.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    console.log(`Epoch 5 verification passed: ${manifest.retained.length} retained tables preserved.`)
  } finally {
    source.close()
    target.close()
  }
}

function assertEmpty(targetPath) {
  const target = openDatabase(targetPath)
  try {
    for (const table of DELETED_TABLES) assert(!tableExists(target, table), `Target still contains ${table}`)
    assert(columns(target, 'guest_thread_entries').includes('dedupe_key'), 'Target is not an Epoch 5 database')
    const populated = tables(target)
      .map(table => ({ table, count: rowCount(target, table) }))
      .filter(result => result.count > 0)
    assert(populated.length === 0, `Target already contains application rows: ${JSON.stringify(populated)}`)
    assert(target.pragma('foreign_key_check').length === 0, 'Target has foreign key violations')
    console.log('Epoch 5 target is baselined and contains no application rows.')
  } finally {
    target.close()
  }
}

const [command, firstPath, secondPath] = process.argv.slice(2)
if (!command || !firstPath || (command !== 'assert-empty' && !secondPath)) {
  console.error('Usage: epoch5-data.mjs <transform|verify> <epoch4.sqlite|export.sql> <epoch5.sqlite|export.sql>')
  console.error('       epoch5-data.mjs assert-empty <epoch5.sqlite|export.sql>')
  process.exit(1)
}
if (command === 'transform') transform(resolve(firstPath), resolve(secondPath))
else if (command === 'verify') verify(resolve(firstPath), resolve(secondPath))
else if (command === 'assert-empty') assertEmpty(resolve(firstPath))
else {
  console.error(`Unknown command "${command}"`)
  process.exit(1)
}
