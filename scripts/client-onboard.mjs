#!/usr/bin/env node
/**
 * Interactive onboarding wrapper — runs the full approved flow with human review gates.
 *
 * Usage:
 *   yarn client:onboard \
 *     --slug pottery-house-krabi \
 *     --vertical experience \
 *     --maps-url "https://maps.google.com/..." \
 *     --images ./photos
 *
 * Flow:
 *   1. dry-run  → fetch Places data, scan images, write manifests
 *   2. GATE     → print manifest paths, wait for "yes" before proceeding
 *   3. approve  → hash and sign the manifests
 *   4. apply    → execute seed SQL against D1, print row-count diff
 *   5. verify   → smoke test live site, write report
 *   6. print    → report path and next steps
 */

import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

// ── Minimal YAML parser for intake files ──────────────────────────────────────
// Handles the specific subset used in client-intake/*.yml: flat key:value,
// list items (  - item), and literal block scalars (key: |).

function parseIntakeYaml(content) {
  const result = {}
  const lines = content.split('\n')
  let currentKey   = null
  let currentList  = null
  let inMultiline  = false
  let multilineLines = []
  const _baseIndent   = 0

  const flush = () => {
    if (inMultiline && currentKey) {
      result[currentKey] = multilineLines.join('\n').trim()
      inMultiline  = false
      multilineLines = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')

    // Blank or comment — collect in multiline, skip otherwise
    if (line.trim() === '' || line.trim().startsWith('#')) {
      if (inMultiline) multilineLines.push('')
      continue
    }

    // List item
    const listMatch = line.match(/^(\s*)-\s+(.+)$/)
    if (listMatch && currentList) {
      flush()
      result[currentList].push(listMatch[2].trim())
      continue
    }

    // Key: value pair — must start at column 0
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      flush()
      currentKey  = kvMatch[1]
      const value = kvMatch[2].trim()

      if (value === '|') {
        inMultiline    = true
        multilineLines = []
        currentList    = null
      } else if (value === '') {
        currentList      = currentKey
        result[currentKey] = []
      } else {
        result[currentKey] = value
        currentList = null
      }
      continue
    }

    // Multiline continuation line
    if (inMultiline) {
      multilineLines.push(line.replace(/^ {2}/, ''))
    }
  }

  flush()
  return result
}

// ── Parse args ────────────────────────────────────────────────────────────────

const { values: rawArgs } = parseArgs({
  options: {
    slug:              { type: 'string' },
    vertical:          { type: 'string' },
    'maps-url':        { type: 'string', multiple: true, default: [] },
    images:            { type: 'string' },
    'allow-stock':     { type: 'boolean', default: false },
    'site-id':         { type: 'string' },
    'live-url':        { type: 'string' },
    url:               { type: 'string' },  // alias for --live-url
    remote:            { type: 'boolean', default: false },
    'non-interactive': { type: 'boolean', default: false },
    from:              { type: 'string' },  // path to client-intake YAML
  },
  allowPositionals: false,
})

// Merge intake YAML (--from) under explicit args
const args = { ...rawArgs }
if (args.from) {
  if (!existsSync(args.from)) {
    console.error(`Error: intake file not found: ${args.from}`)
    process.exit(1)
  }
  const intake = parseIntakeYaml(readFileSync(args.from, 'utf8'))
  if (!args.slug     && intake.slug)       args.slug = intake.slug
  if (!args.vertical && intake.vertical)   args.vertical = intake.vertical
  if (!args['live-url'] && intake.live_url) args['live-url'] = intake.live_url
  if (!args['site-id']  && intake.site_id)  args['site-id']  = intake.site_id
  if (!args.images      && intake.images_dir) args.images = intake.images_dir
  if (!args['maps-url']?.length && intake.maps_urls?.length) {
    args['maps-url'] = intake.maps_urls
  }
}

// Defaults
if (!args.vertical) args.vertical = 'restaurant'

if (!args.slug) {
  console.error('Error: --slug is required (or provide --from <intake.yml>)')
  console.error('Usage: yarn client:onboard --slug <slug> --vertical <vertical> [--maps-url <url>] [--images <dir>]')
  console.error('       yarn client:onboard --from client-intake/<slug>.yml')
  process.exit(1)
}

const SLUG            = args.slug
const VERTICAL        = args.vertical
const REMOTE          = args.remote
const NON_INTERACTIVE = args['non-interactive']
const OUT_DIR         = join(process.cwd(), 'client-imports', SLUG)

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(char = '─', width = 64) { return char.repeat(width) }

function step(n, label) {
  console.log(`\n${hr('═')}`)
  console.log(`  Step ${n}: ${label}`)
  console.log(hr('═'))
}

function run(label, args) {
  const cmdStr = `node ${args.join(' ')}`
  console.log(`\n  $ ${cmdStr}`)
  const result = spawnSync('node', args, { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) {
    console.error(`\n  ✗ ${label} failed (exit ${result.status ?? 1}) — aborting.`)
    process.exit(result.status ?? 1)
  }
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(`\n  ${question} `, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function gate(message) {
  if (NON_INTERACTIVE) {
    console.log(`\n  → Non-interactive: skipping review gate`)
    return
  }
  console.log(`\n  ┌─ REVIEW REQUIRED ${'─'.repeat(46)}`)
  console.log(`  │  ${message}`)
  console.log(`  └${'─'.repeat(63)}`)
  const answer = await prompt('Type "yes" to continue, anything else to abort:')
  if (answer !== 'yes') {
    console.log('\n  Aborted by operator.')
    process.exit(0)
  }
}

// ── Build forwarded arg lists ─────────────────────────────────────────────────

const importArgs = ['scripts/client-import.mjs', '--slug', SLUG, '--vertical', VERTICAL]
for (const url of (args['maps-url'] ?? [])) importArgs.push('--maps-url', url)
if (args.images) importArgs.push('--images', args.images)
if (args['allow-stock']) importArgs.push('--allow-stock')
if (REMOTE) importArgs.push('--remote')

const siteId  = args['site-id'] ?? `site-${SLUG}`
const baseUrl = args['live-url'] ?? args.url ?? (REMOTE ? `https://${SLUG}.krabiclaw.com` : 'http://localhost:3000')

const verifyArgs = [
  'scripts/client-verify.mjs',
  '--url', baseUrl,
  '--vertical', VERTICAL,
  '--site-id', siteId,
  '--slug', SLUG,
]

// ── Non-interactive pre-check ─────────────────────────────────────────────────

if (NON_INTERACTIVE) {
  const approvedPath = join(OUT_DIR, 'approved.json')
  if (!existsSync(approvedPath)) {
    console.error('Error: --non-interactive requires an already-valid approved.json.')
    console.error(`  Run interactively first: yarn client:onboard --slug ${SLUG} --vertical ${VERTICAL}`)
    process.exit(1)
  }
  const approved = JSON.parse(await import('node:fs').then(m => m.readFileSync(approvedPath, 'utf8')))
  if (!approved.approved || approved.invalidated) {
    console.error('Error: approved.json is invalid or has been invalidated.')
    console.error('  Re-run the interactive flow to re-approve before using --non-interactive.')
    process.exit(1)
  }
  console.log(`  Using existing approval: approved by ${approved.approved_by} at ${approved.approved_at}`)
}

// ── Step 1: Dry run ───────────────────────────────────────────────────────────

step(1, 'Dry run — fetch Google Places data, scan images, generate manifests')
run('dry-run', [...importArgs, '--dry-run'])

// Print manifest paths for review
const reviewFiles = [
  'client-manifest.json',
  'seed-preview.sql',
  'route-manifest.json',
  'media-manifest.json',
  'missing-fields.json',
  'copy-scan.txt',
]
console.log(`\n  Review these files before continuing:\n`)
for (const f of reviewFiles) {
  const p = join(OUT_DIR, f)
  if (existsSync(p)) console.log(`    ${relative(process.cwd(), p)}`)
}

await gate('Review the manifests above. Check locations, seed SQL, copy scan, and images.')

// ── Step 2: Approve ───────────────────────────────────────────────────────────

step(2, 'Approve — sign manifest hash to gate the apply step')
run('approve', [...importArgs, '--approve'])

// ── Step 3: Apply ─────────────────────────────────────────────────────────────

step(3, `Apply — execute seed against ${REMOTE ? 'remote' : 'local'} D1`)
run('apply', [...importArgs, '--apply'])

// ── Step 4: Verify ────────────────────────────────────────────────────────────

step(4, 'Verify — smoke test live site routes, copy, and media')
run('verify', verifyArgs)

// ── Done ──────────────────────────────────────────────────────────────────────

const reportPath = join(OUT_DIR, 'verify-report.txt')
console.log(`\n${hr('═')}`)
console.log(`  Onboarding complete: ${SLUG}`)
if (existsSync(reportPath)) {
  console.log(`  Verify report: ${relative(process.cwd(), reportPath)}`)
}
if (!REMOTE) {
  console.log(`\n  To deploy and verify production:`)
  console.log(`    yarn deploy`)
  console.log(`    yarn client:verify --url https://${SLUG}.krabiclaw.com --vertical ${VERTICAL} --site-id ${siteId} --slug ${SLUG}`)
}
console.log(hr('═'))
