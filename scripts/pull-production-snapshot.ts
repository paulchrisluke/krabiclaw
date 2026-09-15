/**
 * Preview and local start from a copy of production instead of hand-maintained
 * seed definitions, so what they test against is what customers actually have.
 *
 * The row copy is transferred through scripts/rebaseline-data.mjs: every row is
 * copied into the current generated baseline, the catalog derivation and the
 * pending data transforms run, and the result is audited before anything is
 * written. Until production itself carries the baseline this is what makes a
 * production copy loadable; after that the derivation reads nothing and the
 * transforms are no-ops.
 *
 * `jwks` is left alone — production's signing keys are encrypted under
 * production's BETTER_AUTH_SECRET, so the target keeps and mints its own. E2E
 * credentials come from provision-development-auth.ts afterwards, as before.
 *
 *   node --experimental-strip-types scripts/pull-production-snapshot.ts --local
 *   node --experimental-strip-types scripts/pull-production-snapshot.ts --preview
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { rebaseline } from './rebaseline-data.mjs'

const { values } = parseArgs({
  options: { local: { type: 'boolean', default: false }, preview: { type: 'boolean', default: false } },
  strict: true,
})
if (values.local === values.preview) throw new Error('Choose exactly one of --local or --preview.')

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')

/**
 * A failed `d1 execute` prints `✘ [ERROR]` with nothing after it and writes the
 * reason to a file, so CI shows an import that died at query 16465 for no
 * stated cause. WRANGLER_LOG_PATH puts that file in a directory we own — the
 * default location differs per platform, and guessing it means the reporter
 * throws ENOENT over the very error it was meant to report.
 */
const logDirectory = mkdtempSync(join(tmpdir(), 'krabiclaw-wrangler-logs-'))

function printWranglerLogs(): void {
  const names = readdirSync(logDirectory)
  if (names.length === 0) {
    console.error(`wrangler wrote no log under ${logDirectory}.`)
    return
  }
  for (const name of names) {
    const path = join(logDirectory, name)
    console.error(`--- ${path} ---`)
    console.error(readFileSync(path, 'utf8'))
    console.error(`--- end ${path} ---`)
  }
}

const run = (args: string[], json = false) => {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: process.cwd(),
      stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, WRANGLER_LOG_PATH: logDirectory },
    })
  } catch (error) {
    console.error(`wrangler ${args.join(' ')} failed.`)
    printWranglerLogs()
    throw error
  }
}

// Cloudflare's export operation rejects concurrent application queries for the
// duration of the export. Copy rows with ordinary SELECTs instead; the existing
// rebaseline audit still validates the copy before either target is written.
// https://developers.cloudflare.com/d1/best-practices/import-export-data/
function sourceRows<T>(sql: string): T[] {
  const output = run(['d1', 'execute', 'DB', '--remote', '--command', sql, '--json'], true)
  const results = JSON.parse(output) as Array<{ success: boolean; results: T[] }>
  if (results.length !== 1 || !results[0]!.success) throw new Error('Production snapshot query failed')
  return results[0]!.results
}

function copyProductionRows(path: string) {
  const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"'
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"
  const catalog = "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', '__drizzle_migrations', 'jwks')"
  const tables = sourceRows<{ name: string; sql: string; column_names: string }>(
    `SELECT name, sql, (SELECT json_group_array(name) FROM pragma_table_xinfo(catalog.name) WHERE hidden = 0) AS column_names FROM (${catalog}) catalog ORDER BY name`,
  )
  const queries = [`SELECT name AS table_name, 0 AS phase, sql AS statement FROM (${catalog})`]
  for (const table of tables) {
    const names = (JSON.parse(table.column_names) as string[]).map(identifier)
    const prefix = `INSERT INTO ${identifier(table.name)} (${names.join(',')}) VALUES (`
    // quote() renders text up to its first NUL byte. A text value holding one
    // is written as a hex literal cast back to text, so it survives the copy;
    // every other value keeps quote()'s compact form.
    const serialized = (name: string) =>
      `CASE WHEN typeof(${name}) = 'text' AND instr(CAST(${name} AS BLOB), x'00') > 0 THEN 'CAST(X''' || hex(${name}) || ''' AS TEXT)' ELSE quote(${name}) END`
    const expression = literal(prefix) + ' || ' + names.map(serialized).join(" || ',' || ") + " || ');'"
    queries.push(`SELECT ${literal(table.name)}, 1, ${expression} FROM ${identifier(table.name)}`)
  }
  // One SELECT gives all tables the same SQLite read snapshot. Include the
  // catalog in that read and reject schema changes since column discovery.
  // The existing buffer limit rejects oversized copies before target writes.
  // workerd limits each compound SELECT to five terms. Materialized CTEs
  // keep each group within that limit without splitting the read snapshot.
  // https://github.com/cloudflare/workerd/blob/main/src/workerd/util/sqlite.c++
  const ctes: string[] = []
  let groups = queries
  while (groups.length > 1) {
    const next: string[] = []
    for (let index = 0; index < groups.length; index += 5) {
      const name = `snapshot_group_${ctes.length}`
      ctes.push(`${name} AS MATERIALIZED (${groups.slice(index, index + 5).join(' UNION ALL ')})`)
      next.push(`SELECT * FROM ${name}`)
    }
    groups = next
  }
  const rows = sourceRows<{ table_name: string; phase: number; statement: string; total_rows: number }>(
    `WITH ${ctes.join(', ')} SELECT *, count(*) OVER () AS total_rows FROM (${groups[0]}) ORDER BY table_name, phase`,
  )
  if (!rows.length || rows[0]!.total_rows !== rows.length) throw new Error('Incomplete production copy; no target data was written')
  const schema = rows.filter(row => row.phase === 0)
  if (schema.length !== tables.length || schema.some((row, index) => row.table_name !== tables[index]!.name || row.statement !== tables[index]!.sql)) {
    throw new Error('Production schema changed during column discovery; no target data was written')
  }
  writeFileSync(path, 'PRAGMA foreign_keys=OFF;\n' + rows.map(row => row.statement + (row.phase === 0 ? ';' : '')).join('\n'), { mode: 0o600 })
  for (const table of tables) console.log(`Copied ${table.name}: ${rows.filter(row => row.phase === 1 && row.table_name === table.name).length} rows`)
}

const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-snapshot-'))
try {
  const dumpPath = join(directory, 'production.sql')
  copyProductionRows(dumpPath)

  const payloadPath = join(directory, 'payload.sql')
  const manifest = rebaseline(dumpPath, join(directory, 'target.sqlite'), { payloadPath, withoutJwks: true })

  const target = values.preview ? ['--env', 'preview', '--remote'] : ['--local']
  run(['d1', 'execute', 'DB', ...target, '--file', payloadPath])
  const rows = manifest.tables.reduce((total, table) => total + table.target_rows, 0)
  console.log(`Restored ${manifest.tables.length} tables (${rows} rows) from the production DB binding into ${values.preview ? 'preview' : 'local'} D1.`)
} finally {
  rmSync(directory, { recursive: true, force: true })
  rmSync(logDirectory, { recursive: true, force: true })
}
