import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const root = resolve(import.meta.dirname, '../..')

function run(directory, script, args = []) {
  return spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: directory, encoding: 'utf8', timeout: 30_000,
  })
}

function schema(defaultValue = 'integer().default(0)', extraColumn = '', obsolete = true) {
  return `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const user = sqliteTable('user', { id: text().primaryKey(), emailVerified: ${defaultValue}.notNull() });
export const session = sqliteTable('session', { id: text().primaryKey(), userId: text().references(() => user.id, { onDelete: 'cascade' }) ${extraColumn} });
${obsolete ? "export const obsolete = sqliteTable('obsolete', { id: text().primaryKey() });" : ''}
`
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-migration-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  writeFileSync(join(directory, 'drizzle.config.ts'), "export default { schema: './schema.ts', out: './migrations', dialect: 'sqlite' }\n")
  writeFileSync(join(directory, 'schema.ts'), schema())
  // Tracks the current epoch: lint-migrations requires the chain to start with
  // the epoch baseline it is pinned to, so the fixture is named for that epoch.
  const result = generate(directory, 'epoch_5_baseline')
  assert.equal(result.status, 0, result.stderr + result.stdout)
  return directory
}

function generate(directory, name) {
  return run(directory, 'node_modules/drizzle-kit/bin.cjs', ['generate', '--name', name])
}

test('boolean mapping preserves the existing SQLite default without rebuilding a parent', async (t) => {
  const directory = fixture(t)
  const baseline = readFileSync(join(directory, 'migrations/meta/0000_snapshot.json'), 'utf8')
  writeFileSync(join(directory, 'schema.ts'), schema("integer({ mode: 'boolean' }).default(false)"))
  const result = run(directory, 'scripts/check-schema-drift.mjs')
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.equal(readFileSync(join(directory, 'migrations/meta/0000_snapshot.json'), 'utf8'), baseline)

  const previous = await generateSQLiteDrizzleJson({ user: sqliteTable('user', { id: text().primaryKey(), verified: integer().default(0) }) })
  const user = sqliteTable('user', { id: text().primaryKey(), verified: integer({ mode: 'boolean' }).default(false) })
  const current = await generateSQLiteDrizzleJson({ user })
  assert.deepEqual(await generateSQLiteMigration(previous, current), [])
  assert.equal(previous.tables.user.columns.verified.default, 0)
  assert.equal(current.tables.user.columns.verified.default, false)
  const unchanged = await generateSQLiteDrizzleJson({ user })
  assert.deepEqual(await generateSQLiteMigration(current, unchanged), [])
  assert.equal(user.verified.mapFromDriverValue(0), false)
  assert.equal(user.verified.mapFromDriverValue(1), true)
})

test('an additive schema change is detected and generates an applicable migration without rebuilding user', (t) => {
  const directory = fixture(t)
  writeFileSync(join(directory, 'schema.ts'), schema("integer({ mode: 'boolean' }).default(false)", ', note: text()'))
  const drift = run(directory, 'scripts/check-schema-drift.mjs')
  assert.notEqual(drift.status, 0)
  assert.match(drift.stderr, /Schema drift detected/)
  assert.equal(readdirSync(join(directory, 'migrations')).filter(name => name.endsWith('.sql')).length, 1)
  const generation = generate(directory, 'session_note')
  assert.equal(generation.status, 0, generation.stderr + generation.stdout)
  const lint = run(directory, 'scripts/lint-migrations.mjs')
  assert.equal(lint.status, 0, lint.stderr + lint.stdout)
  const clean = run(directory, 'scripts/check-schema-drift.mjs')
  assert.equal(clean.status, 0, clean.stderr + clean.stdout)
})

test('the drift guard rejects generator failures even when Kit exits zero', (t) => {
  const directory = fixture(t)
  const path = join(directory, 'migrations/meta/0000_snapshot.json')
  const snapshot = readFileSync(path, 'utf8')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(snapshot), version: '999' }))
  const unsupported = run(directory, 'scripts/check-schema-drift.mjs')
  assert.notEqual(unsupported.status, 0)
  assert.match(unsupported.stderr, /did not confirm a clean diff/)
  writeFileSync(path, snapshot)
  writeFileSync(join(directory, 'schema.ts'), "import './missing-schema.ts'\n")
  const broken = run(directory, 'scripts/check-schema-drift.mjs')
  assert.notEqual(broken.status, 0)
  assert.match(broken.stderr, /Schema generation failed/)
})

test('migration lint blocks a generated referenced-parent rebuild before DROP executes', (t) => {
  const directory = fixture(t)
  writeFileSync(join(directory, 'schema.ts'), schema("integer({ mode: 'boolean' }).default(true)"))
  const generation = generate(directory, 'changed_default')
  assert.equal(generation.status, 0, generation.stderr + generation.stdout)
  const result = run(directory, 'scripts/lint-migrations.mjs')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cannot DROP referenced parent table "user"/)
})

test('migration lint permits a generated drop of an unreferenced obsolete table', (t) => {
  const directory = fixture(t)
  writeFileSync(join(directory, 'schema.ts'), schema('integer().default(0)', '', false))
  const generation = generate(directory, 'remove_obsolete')
  assert.equal(generation.status, 0, generation.stderr + generation.stdout)
  const result = run(directory, 'scripts/lint-migrations.mjs')
  assert.equal(result.status, 0, result.stderr + result.stdout)
})
