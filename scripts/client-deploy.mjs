#!/usr/bin/env node
/**
 * Apply an approved client import and verify its live URL.
 * Worker releases use the staging and main branch workflow separately.
 *
 * Usage:
 *   yarn client:deploy \
 *     --slug pottery-house-krabi \
 *     --vertical experience \
 *     --site-id site-pottery-house-krabi
 *
 * Flags:
 *   --skip-seed    Skip the D1 apply step when the import was already applied
 *   --allow-stock  Pass through to client:import --apply
 */

import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'

const { values: args } = parseArgs({
  options: {
    slug: { type: 'string' },
    vertical: { type: 'string', default: 'restaurant' },
    'site-id': { type: 'string' },
    url: { type: 'string' },
    'allow-stock': { type: 'boolean', default: false },
    'skip-seed': { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

if (!args.slug) {
  console.error('Error: --slug is required')
  console.error('Usage: yarn client:deploy --slug <slug> --vertical <vertical> [--site-id <id>]')
  process.exit(1)
}

const slug = args.slug
const vertical = args.vertical
const siteId = args['site-id'] ?? `site-${slug}`
const liveUrl = args.url ?? `https://${slug}.krabiclaw.com`

function rule(char = '─', width = 64) {
  return char.repeat(width)
}

function run(label, nodeArgs) {
  console.log(`\n  $ node ${nodeArgs.join(' ')}`)
  const result = spawnSync('node', nodeArgs, { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed.`)
    process.exit(result.status ?? 1)
  }
}

console.log(`\n${rule('═')}`)
console.log(`  client:deploy — ${slug}`)
console.log(`  Live URL: ${liveUrl}`)
console.log(rule('═'))

if (!args['skip-seed']) {
  console.log(`\n${rule()}\n  Step 1: Apply approved client import\n${rule()}`)
  const applyArgs = ['scripts/client-import.mjs', '--slug', slug, '--vertical', vertical, '--apply', '--remote']
  if (args['allow-stock']) applyArgs.push('--allow-stock')
  run('client import', applyArgs)
} else {
  console.log('\n  Step 1: skipped (--skip-seed)')
}

console.log(`\n${rule()}\n  Step 2: Verify live site\n${rule()}`)
const verifyResult = spawnSync('node', [
  'scripts/client-verify.mjs',
  '--url', liveUrl,
  '--vertical', vertical,
  '--site-id', siteId,
  '--slug', slug,
], { stdio: 'inherit', cwd: process.cwd() })

console.log(`\n${rule('═')}`)
if (verifyResult.status === 0) {
  console.log(`  ✓ Client import and live verification passed — ${slug}`)
  console.log(`  ${liveUrl}`)
  console.log(rule('═'))
  process.exit(0)
}

console.error('  ✗ Live verification failed')
console.error('\n  Fix the reported issues, then verify the existing deployment again:')
console.error(`    yarn client:deploy --slug ${slug} --vertical ${vertical} --site-id ${siteId} --skip-seed`)
console.error('  Worker fixes must go through staging and main.')
console.log(rule('═'))
process.exit(verifyResult.status ?? 1)
