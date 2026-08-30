#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temporaryRoot = mkdtempSync(join(tmpdir(), 'krabiclaw-schema-drift-'))
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

try {
  cpSync(join(root, 'migrations'), temporaryMigrations, { recursive: true })
  const before = manifest(temporaryMigrations)
  const temporaryConfig = join(temporaryRoot, 'drizzle.config.ts')
  writeFileSync(temporaryConfig, `export default { schema: ${JSON.stringify(join(root, 'server/db/schema.ts'))}, out: ${JSON.stringify(temporaryMigrations)}, dialect: 'sqlite', dbCredentials: { url: ${JSON.stringify(join(temporaryRoot, 'drift.sqlite'))} } }\n`)
  const result = spawnSync(join(root, 'node_modules/.bin/drizzle-kit'), [
    'generate', '--config', temporaryConfig,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DRIZZLE_DB_FILE: join(temporaryRoot, 'drift.sqlite') },
  })
  if (result.status !== 0) {
    process.stderr.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  const after = manifest(temporaryMigrations)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const beforePaths = new Set(before.map(([path]) => path))
    const added = after.map(([path]) => path).filter(path => !beforePaths.has(path))
    throw new Error(`Schema drift detected${added.length ? `; generated: ${added.join(', ')}` : '; committed migration metadata changed'}`)
  }
  console.log('Schema and committed epoch-3 migration metadata are in sync.')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
