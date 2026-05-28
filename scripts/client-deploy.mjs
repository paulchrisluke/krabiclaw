#!/usr/bin/env node
/**
 * Deploy-with-verify wrapper. Fails loudly if post-deploy smoke test fails.
 *
 * Internal flow:
 *   1. Apply seed to remote D1  (--apply --remote)
 *   2. Deploy app               (yarn build && wrangler deploy)
 *   3. Verify against live URL  (client:verify)
 *   4. Exit non-zero if verify fails — Cloudflare still serves the new
 *      Worker, so failures here require a manual rollback or fix+redeploy.
 *
 * Usage:
 *   yarn client:deploy \
 *     --slug pottery-house-krabi \
 *     --vertical experience \
 *     --site-id site-pottery-house-krabi
 *
 * Flags:
 *   --skip-seed    Skip the D1 apply step (seed was already applied separately)
 *   --skip-deploy  Skip the yarn deploy step (useful when testing verify against existing deploy)
 *   --allow-stock  Passed through to client:import --apply when seeding
 */

import { parseArgs } from 'node:util'
import { spawnSync, execSync } from 'node:child_process'

const { values: args } = parseArgs({
  options: {
    slug:          { type: 'string' },
    vertical:      { type: 'string', default: 'restaurant' },
    'site-id':     { type: 'string' },
    url:           { type: 'string' },
    'allow-stock': { type: 'boolean', default: false },
    'skip-seed':   { type: 'boolean', default: false },
    'skip-deploy': { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

if (!args.slug) {
  console.error('Error: --slug is required')
  console.error('Usage: yarn client:deploy --slug <slug> --vertical <vertical> [--site-id <id>]')
  process.exit(1)
}

const SLUG     = args.slug
const VERTICAL = args.vertical
const SITE_ID  = args['site-id'] ?? `site-${SLUG}`
const LIVE_URL = args.url ?? `https://${SLUG}.krabiclaw.com`

function hr(char = '─', width = 64) { return char.repeat(width) }

function run(label, nodeArgs) {
  console.log(`\n  $ node ${nodeArgs.join(' ')}`)
  const result = spawnSync('node', nodeArgs, { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed — aborting deploy.`)
    process.exit(result.status ?? 1)
  }
}

function runShell(label, cmd) {
  console.log(`\n  $ ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  } catch {
    console.error(`\n✗ ${label} failed — aborting deploy.`)
    process.exit(1)
  }
}

console.log(`\n${hr('═')}`)
console.log(`  client:deploy — ${SLUG}`)
console.log(`  Live URL: ${LIVE_URL}`)
console.log(hr('═'))

// ── Step 1: Apply seed (remote D1) ────────────────────────────────────────────

if (!args['skip-seed']) {
  console.log(`\n${hr()}\n  Step 1: Apply seed to remote D1\n${hr()}`)

  const applyArgs = ['scripts/client-import.mjs', '--slug', SLUG, '--vertical', VERTICAL, '--apply', '--remote']
  if (args['allow-stock']) applyArgs.push('--allow-stock')
  run('seed apply (remote)', applyArgs)
} else {
  console.log('\n  Step 1: skipped (--skip-seed)')
}

// ── Step 2: Deploy app ────────────────────────────────────────────────────────

if (!args['skip-deploy']) {
  console.log(`\n${hr()}\n  Step 2: Build and deploy Cloudflare Worker\n${hr()}`)
  runShell('yarn deploy', 'yarn deploy')
} else {
  console.log('\n  Step 2: skipped (--skip-deploy)')
}

// ── Step 3: Verify against live URL ──────────────────────────────────────────

console.log(`\n${hr()}\n  Step 3: Smoke-test live site\n${hr()}`)

const verifyArgs = [
  'scripts/client-verify.mjs',
  '--url',      LIVE_URL,
  '--vertical', VERTICAL,
  '--site-id',  SITE_ID,
  '--slug',     SLUG,
]

// spawnSync so we capture exit code; don't use run() as we want to print a
// deploy-specific error message rather than the generic "step failed" message
const verifyResult = spawnSync('node', verifyArgs, { stdio: 'inherit', cwd: process.cwd() })

console.log(`\n${hr('═')}`)
if (verifyResult.status === 0) {
  console.log(`  ✓ Deploy + verify passed — ${SLUG} is live`)
  console.log(`  ${LIVE_URL}`)
  console.log(hr('═'))
  process.exit(0)
} else {
  console.error(`  ✗ Post-deploy verify FAILED`)
  console.error(`\n  The Worker is already deployed. Fix the issues reported above, then:`)
  console.error(`    yarn client:deploy --slug ${SLUG} --skip-seed --skip-deploy`)
  console.error(`  Or redeploy with fixes:`)
  console.error(`    yarn client:deploy --slug ${SLUG} --skip-seed`)
  console.log(hr('═'))
  process.exit(verifyResult.status ?? 1)
}
