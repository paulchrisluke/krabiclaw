#!/usr/bin/env node
/**
 * Client data-apply and post-release verification wrapper.
 *
 * Internal flow:
 *   1. Apply seed to remote D1  (--apply --remote)
 *   2. Verify against live URL  (client:verify)
 *
 * Worker releases are intentionally excluded. They must use the immutable
 * staging-candidate and protected production workflows.
 *
 * Usage:
 *   yarn client:deploy \
 *     --slug pottery-house-krabi \
 *     --vertical experience \
 *     --site-id site-pottery-house-krabi \
 *     --skip-deploy
 *
 * Flags:
 *   --skip-seed    Skip the D1 apply step (seed was already applied separately)
 *   --skip-deploy  Required compatibility flag acknowledging that Worker release happens separately
 *   --allow-stock  Passed through to client:import --apply when seeding
 */

import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'

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
  console.error('Usage: yarn client:deploy --slug <slug> --vertical <vertical> [--site-id <id>] --skip-deploy')
  process.exit(1)
}

if (!args['skip-deploy']) {
  console.error('Direct Worker deployment from client:deploy is disabled; no client data was changed.')
  console.error('Run the immutable staging and protected production release workflows, then rerun with --skip-deploy for data apply and verification.')
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

// ── Step 2: Worker release boundary ───────────────────────────────────────────

console.log('\n  Step 2: Worker release handled by the immutable candidate workflows (--skip-deploy acknowledged)')

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
  console.log(`  ✓ Client apply + deployed verification passed — ${SLUG} is live`)
  console.log(`  ${LIVE_URL}`)
  console.log(hr('═'))
  process.exit(0)
} else {
  console.error(`  ✗ Post-deploy verify FAILED`)
  console.error(`\n  Fix the issues reported above, then verify the already released Worker again:`)
  console.error(`    yarn client:deploy --slug ${SLUG} --vertical ${VERTICAL} --site-id ${SITE_ID} --skip-seed --skip-deploy`)
  console.error('  Worker fixes must go through the immutable staging candidate and protected production release workflows.')
  console.log(hr('═'))
  process.exit(verifyResult.status ?? 1)
}
