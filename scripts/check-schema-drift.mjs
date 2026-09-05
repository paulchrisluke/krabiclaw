#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

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
  console.log('Schema and committed epoch-4 migration metadata are in sync.')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
