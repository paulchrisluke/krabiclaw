#!/usr/bin/env node
//
//   node scripts/check-schema-drift.mjs [--env staging|--production]
//
// Without a target: the committed migration metadata still describes
// server/db/schema.ts, so `db:generate` would emit nothing.
//
// With one: the live database's schema is also the one the baseline builds.
// Those are different questions. A re-baseline changes what
// `migrations/0000_baseline.sql` contains while its tag stays `0000_baseline`,
// so `d1 migrations apply` finds the tag in `d1_migrations` and skips it — the
// database keeps whatever content it was first migrated under, and the deploy
// that ships the new code says nothing. Staging served renamed columns against
// a database that still held the old names three times in one night before
// anyone noticed by hand. A database is rebuilt from a new baseline, never
// migrated toward one, and this is what says so out loud.
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

const { values: options } = parseArgs({
  options: { env: { type: 'string' }, production: { type: 'boolean', default: false } },
  strict: true,
})
if (options.env && options.production) throw new Error('Choose one of --env <name> or --production.')
const target = options.production ? 'production' : options.env ?? null

const root = process.cwd()
const temporaryParent = join(root, '.tmp')
mkdirSync(temporaryParent, { recursive: true })
const temporaryRoot = mkdtempSync(join(temporaryParent, 'schema-drift-'))
const temporaryMigrations = join(temporaryRoot, 'migrations')

function manifest(directory) {
  const entries = []
  function visit(path) {
    for (const name of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, name.name)
      if (name.isDirectory()) visit(child)
      else entries.push([relative(directory, child), createHash('sha256').update(readFileSync(child)).digest('hex')])
    }
  }
  visit(directory)
  return entries.sort(([left], [right]) => left.localeCompare(right))
}

/**
 * Formatting differences are not schema differences, but the contents of a
 * string literal are: `status IN ('a', 'b')` and `status IN ('a',  'b')` are the
 * same constraint, while `'a  b'` and `'a b'` are different values. So
 * whitespace collapses between literals and is left alone inside them.
 */
function normalizeSql(sql) {
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((part, index) => (index % 2 ? part : part.replace(/\s+/g, ' ')))
    .join('')
    .trim()
}

/** Every object the baseline defines, as the database itself reports it. */
function schemaOf(rows) {
  return rows
    .filter(row => row.name && !row.name.startsWith('sqlite_') && !row.name.startsWith('_cf_') && row.name !== 'd1_migrations')
    .map(row => `${row.type} ${row.name}\n${normalizeSql(row.sql ?? '')}`)
    .sort()
}

const SCHEMA_QUERY = "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations'"

try {
  cpSync(join(root, 'migrations'), temporaryMigrations, { recursive: true })
  const before = manifest(temporaryMigrations)
  const temporaryConfig = join(temporaryRoot, 'drizzle.config.ts')
  // Kit 0.31 prefixes snapshot paths with './'; an absolute out path fails.
  // Reuse the normal config so this check exercises the same schema contract.
  writeFileSync(temporaryConfig, `import config from ${JSON.stringify(join(root, 'drizzle.config.ts'))}; export default { ...config, out: ${JSON.stringify(relative(root, temporaryMigrations))}, dbCredentials: { url: ${JSON.stringify(join(temporaryRoot, 'drift.sqlite'))} } }\n`)
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules', 'drizzle-kit', 'bin.cjs'), 'generate', '--config', temporaryConfig,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DRIZZLE_DB_FILE: join(temporaryRoot, 'drift.sqlite') },
  })
  // Kit can print an exception and still exit 0. Never treat that as a clean diff.
  if (result.error || result.status !== 0 || result.stderr?.trim()) {
    throw new Error(`Schema generation failed: ${result.error?.message ?? result.stderr ?? ''}\n${result.stdout ?? ''}`)
  }
  const after = manifest(temporaryMigrations)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const beforePaths = new Set(before.map(([path]) => path))
    const added = after.map(([path]) => path).filter(path => !beforePaths.has(path))
    throw new Error(`Schema drift detected${added.length ? `; generated: ${added.join(', ')}` : '; committed migration metadata changed'}`)
  }
  if (!result.stdout.includes('No schema changes, nothing to migrate')) {
    throw new Error(`Schema generation did not confirm a clean diff:\n${result.stdout}`)
  }
  console.log('Schema and committed migration metadata are in sync.')
  if (target) compareLiveSchema(target)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}


function compareLiveSchema(name) {
  const scratch = join(temporaryRoot, 'baseline.sqlite')
  const database = new DatabaseSync(scratch)
  for (const file of readdirSync(join(root, 'migrations')).filter(entry => entry.endsWith('.sql')).sort()) {
    database.exec(readFileSync(join(root, 'migrations', file), 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const expected = schemaOf(database.prepare(SCHEMA_QUERY).all())
  database.close()

  const args = ['d1', 'execute', 'DB', '--remote', '--json', '--command', SCHEMA_QUERY]
  if (name !== 'production') args.splice(3, 0, '--env', name)
  const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Could not read the ${name} schema: ${(result.stderr || result.stdout || '').trim()}`)
  const live = schemaOf(JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))[0].results)

  const missing = expected.filter(entry => !live.includes(entry))
  const extra = live.filter(entry => !expected.includes(entry))
  if (missing.length || extra.length) {
    const name0 = entry => entry.split('\n')[0]
    throw new Error([
      `The ${name} database does not carry the schema this baseline builds.`,
      'It was migrated under an earlier baseline and the tag has not changed since, so `d1 migrations apply` skipped it.',
      'Rebuild it from the baseline (see docs/operations/release-and-outage-prevention.md); do not migrate it toward one.',
      missing.length ? `  the baseline defines, the database lacks: ${missing.map(name0).join(', ')}` : '',
      extra.length ? `  the database carries, the baseline does not: ${extra.map(name0).join(', ')}` : '',
    ].filter(Boolean).join('\n'))
  }
  console.log(`The ${name} database carries the schema this baseline builds.`)
}
