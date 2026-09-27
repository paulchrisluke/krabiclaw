/**
 * Local and staging start from a copy of production instead of hand-maintained
 * seed definitions, so what they test against is what customers actually have.
 *
 * The row copy is transferred through scripts/transfer-database-export.mjs: every row is
 * copied into the current generated baseline, the schema epoch and the pending
 * data transforms run, and the result is audited before anything is written.
 * Until the source itself carries the baseline this is what makes its copy
 * loadable; after that the epoch reads nothing and the transforms are no-ops.
 *
 * `jwks` is left alone — production's signing keys are encrypted under
 * production's BETTER_AUTH_SECRET, so the target keeps and mints its own. E2E
 * credentials come from provision-development-auth.ts afterwards, as before.
 *
 *   node --experimental-strip-types scripts/pull-production-snapshot.ts --local
 *   node --experimental-strip-types scripts/pull-production-snapshot.ts --staging
 *   node --experimental-strip-types scripts/pull-production-snapshot.ts --out <target.sqlite> [--source <database>]
 *
 * The source is the top-level `DB` binding (production) unless `--source` names
 * a D1 database. A schema replacement names it, because once the binding is
 * repointed `DB` is the replacement, not the database being replaced.
 *
 * `--out` is the preflight: the transformed target, its data-only payload and
 * its manifest are kept at that path and nothing remote is written.
 * `--delta-from <initial target.sqlite>` writes only the rows the initial
 * transfer did not hold, for the final copy after the binding is repointed.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { printTransferReport, SCHEMA_OBJECTS_QUERY, transferDatabaseExport } from './transfer-database-export.mjs'

// Staging is a release gate, so it has to hold what production holds. It had no
// target here, so it was never refreshed and drifted to whatever an older
// epoch's migration left in it — a Kikuzuki homepage of four blocks against
// production's eight, three product sessions against production's 808. A gate
// standing in front of `main` on data that does not resemble production is the
// reason tenant rendering, booking and localisation defects kept reaching
// production green. Staging is the same restore as local with `--env staging`;
// it is never a target while its schema is already released.
const { values } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    staging: { type: 'boolean', default: false },
    out: { type: 'string' },
    source: { type: 'string', default: 'DB' },
    'delta-from': { type: 'string' },
  },
  strict: true,
})
const targets = (['local', 'staging', 'out'] as const).filter(name => values[name])
if (targets.length !== 1) throw new Error('Choose exactly one of --local, --staging or --out <target.sqlite>.')
const target = targets[0]!
const deltaFrom = values['delta-from'] ? resolve(values['delta-from']) : null

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
// transfer audit still validates the copy before either target is written.
// https://developers.cloudflare.com/d1/best-practices/import-export-data/
function sourceRows<T>(sql: string): T[] {
  const output = run(['d1', 'execute', values.source, '--remote', '--command', sql, '--json'], true)
  const results = JSON.parse(output) as Array<{ success: boolean; results: T[] }>
  if (results.length !== 1 || !results[0]!.success) throw new Error(`${values.source} snapshot query failed`)
  return results[0]!.results
}

function copyProductionRows(path: string) {
  const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"'
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"
  const catalog = "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT IN ('d1_migrations', '__drizzle_migrations', 'jwks')"
  const tables = sourceRows<{ name: string; sql: string; column_names: string }>(
    `SELECT name, sql, (SELECT json_group_array(name) FROM pragma_table_xinfo(catalog.name) WHERE hidden = 0) AS column_names FROM (${catalog}) catalog ORDER BY name`,
  )
  const queries = [`SELECT name AS table_name, 0 AS phase, sql AS statement FROM (${catalog})`]
  for (const table of tables) {
    const names = (JSON.parse(table.column_names) as string[]).map(identifier)
    const prefix = `INSERT INTO ${identifier(table.name)} (${names.join(',')}) VALUES (`
    const expression = literal(prefix) + ' || ' + names.map(name => `quote(${name})`).join(" || ',' || ") + " || ');'"
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
  if (!rows.length || rows[0]!.total_rows !== rows.length) throw new Error(`Incomplete ${values.source} copy; no target data was written`)
  const schema = rows.filter(row => row.phase === 0)
  if (schema.length !== tables.length || schema.some((row, index) => row.table_name !== tables[index]!.name || row.statement !== tables[index]!.sql)) {
    throw new Error(`${values.source} schema changed during column discovery; no target data was written`)
  }
  writeFileSync(path, 'PRAGMA foreign_keys=OFF;\n' + rows.map(row => row.statement + (row.phase === 0 ? ';' : '')).join('\n'), { mode: 0o600 })
  for (const table of tables) console.log(`Copied ${table.name}: ${rows.filter(row => row.phase === 1 && row.table_name === table.name).length} rows`)
}

// The baseline this transfer builds must be the one server/db/schema.ts
// describes, or the payload is written for a schema no deploy will run.
execFileSync(process.execPath, ['scripts/check-schema-drift.mjs'], { cwd: process.cwd(), stdio: 'inherit' })

const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-snapshot-'))
try {
  const dumpPath = join(directory, 'source.sql')
  copyProductionRows(dumpPath)

  const targetPath = target === 'out' ? resolve(values.out!) : join(directory, 'target.sqlite')
  const payloadPath = target === 'out' ? `${targetPath}.payload.sql` : join(directory, 'payload.sql')
  const manifest = transferDatabaseExport(dumpPath, targetPath, { payloadPath, withoutJwks: true, deltaFrom })
  printTransferReport(manifest)
  const rows = manifest.tables.reduce((total, table) => total + table.target_rows, 0)
  if (target === 'out') {
    console.log(`Preflight passed: ${manifest.tables.length} tables (${rows} rows) from ${values.source} into ${targetPath}; payload ${payloadPath}. Nothing remote was written.`)
  } else {
    const destination = target === 'local' ? ['--local'] : ['--env', target, '--remote']
    // The payload is data only, written for the schema the target was built
    // from. A destination still on an earlier baseline — the file is regenerated
    // under the same name, so `migrations apply` sees nothing new — fails half
    // way through the import instead, on whichever object moved first.
    const expectedSchema = manifest.schema
    if (!expectedSchema) throw new Error('The transfer did not report the schema it built')
    const [actual] = JSON.parse(run(['d1', 'execute', 'DB', ...destination, '--command', SCHEMA_OBJECTS_QUERY, '--json'], true)) as Array<{ results: Array<{ type: string; name: string; sql: string }> }>
    const key = (object: { type: string; name: string }) => `${object.type} ${object.name}`
    const actualSchema = new Map((actual?.results ?? []).map(object => [key(object), object.sql]))
    const drift = expectedSchema.filter(object => actualSchema.get(key(object)) !== object.sql).map(key)
    if (drift.length || actualSchema.size !== expectedSchema.length) {
      throw new Error(`${target} D1 does not carry the current baseline (${drift.length ? drift.slice(0, 5).join(', ') : 'extra objects'} differ); no data was written. ${target === 'local'
        ? 'Delete .wrangler/state/v3/d1 and run `corepack yarn local:setup` again.'
        : 'Replace the database through the schema replacement in docs/operations/release-and-outage-prevention.md first.'}`)
    }
    // Every deploy runs `d1 migrations apply` before it ships. A destination
    // whose ledger does not already record each migration file would have the
    // baseline applied again on top of the rows loaded here, so it is refused
    // until it was built with `wrangler d1 migrations apply`.
    const query = <T>(sql: string) => (JSON.parse(run(['d1', 'execute', 'DB', ...destination, '--command', sql, '--json'], true)) as Array<{ results: T[] }>)[0]?.results ?? []
    const ledgered = query<{ n: number }>("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table' AND name = 'd1_migrations'")[0]?.n === 1
      ? query<{ name: string }>('SELECT name FROM d1_migrations ORDER BY name').map(row => row.name)
      : []
    const migrationFiles = readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()
    if (JSON.stringify(ledgered) !== JSON.stringify(migrationFiles)) {
      throw new Error(`${target} D1 records migrations [${ledgered.join(', ')}] but the repository has [${migrationFiles.join(', ')}]; no data was written. Build it with \`wrangler d1 migrations apply\`, not by executing the baseline file.`)
    }
    run(['d1', 'execute', 'DB', ...destination, '--file', payloadPath])
    console.log(`Restored ${manifest.tables.length} tables (${rows} rows) from ${values.source} into ${target} D1${deltaFrom ? ' as a delta' : ''}.`)
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
  rmSync(logDirectory, { recursive: true, force: true })
}
