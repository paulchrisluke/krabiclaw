/**
 * Preview and local start from a copy of production instead of hand-maintained
 * seed definitions, so what they test against is what customers actually have.
 *
 * The export is transferred through scripts/rebaseline-data.mjs: every row is
 * copied into the current generated baseline, the catalog derivation and the
 * pending data transforms run, and the result is audited before anything is
 * written. Until production itself carries the baseline this is what makes a
 * production export loadable; after that the derivation reads nothing and the
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
import { mkdtempSync, rmSync } from 'node:fs'
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
const run = (args: string[]) => execFileSync(process.execPath, [wrangler, ...args], { cwd: process.cwd(), stdio: 'inherit' })

const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-snapshot-'))
try {
  const dumpPath = join(directory, 'production.sql')
  run(['d1', 'export', 'DB', '--remote', '--output', dumpPath])

  const payloadPath = join(directory, 'payload.sql')
  const manifest = rebaseline(dumpPath, join(directory, 'target.sqlite'), { payloadPath, withoutJwks: true })

  const target = values.preview ? ['--env', 'preview', '--remote'] : ['--local']
  run(['d1', 'execute', 'DB', ...target, '--file', payloadPath])
  const rows = manifest.tables.reduce((total, table) => total + table.target_rows, 0)
  console.log(`Restored ${manifest.tables.length} tables (${rows} rows) from the production DB binding into ${values.preview ? 'preview' : 'local'} D1.`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
