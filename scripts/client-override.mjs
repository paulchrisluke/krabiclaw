#!/usr/bin/env node
/**
 * Apply client-supplied corrections without hand-editing seed SQL.
 *
 * Overrides are stored in client-imports/<slug>/overrides.json and applied
 * automatically on the next --dry-run pass. Changing overrides invalidates
 * any existing approval, requiring --approve before --apply.
 *
 * Usage:
 *   # List current overrides
 *   yarn client:override --slug pottery-house-krabi --list
 *
 *   # Set fields (primary location)
 *   yarn client:override --slug pottery-house-krabi --set phone=+66626505890
 *   yarn client:override --slug pottery-house-krabi --set "title=Pottery House Krabi - Main"
 *   yarn client:override --slug pottery-house-krabi --set address="123 Moo 5, Ao Nang, Krabi"
 *
 *   # Clear a field
 *   yarn client:override --slug pottery-house-krabi --unset phone
 *
 * Supported override keys (primary location):
 *   phone, address, title, website, lat, lng
 *
 * After setting overrides, re-run the approved flow:
 *   yarn client:import --slug <slug> --dry-run
 *   yarn client:import --slug <slug> --approve
 *   yarn client:import --slug <slug> --apply
 *
 * Or use the interactive wrapper:
 *   yarn client:onboard --slug <slug> --vertical <vertical>
 */

import { parseArgs } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'

const { values: args } = parseArgs({
  options: {
    slug:  { type: 'string' },
    set:   { type: 'string', multiple: true, default: [] },
    unset: { type: 'string', multiple: true, default: [] },
    list:  { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

if (!args.slug) {
  console.error('Error: --slug is required')
  console.error('Usage: yarn client:override --slug <slug> [--set key=value] [--unset key] [--list]')
  process.exit(1)
}

const SLUG    = args.slug
const OUT_DIR = join(process.cwd(), 'client-imports', SLUG)
const overridesPath = join(OUT_DIR, 'overrides.json')
const approvedPath  = join(OUT_DIR, 'approved.json')

const SUPPORTED_KEYS = new Set(['phone', 'address', 'title', 'website', 'lat', 'lng'])

// ── Load / save overrides ─────────────────────────────────────────────────────

async function loadOverrides() {
  if (!existsSync(overridesPath)) return {}
  return JSON.parse(await readFile(overridesPath, 'utf8'))
}

async function saveOverrides(overrides) {
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8')
}

// ── List ──────────────────────────────────────────────────────────────────────

if (args.list) {
  if (!existsSync(overridesPath)) {
    console.log(`No overrides for ${SLUG}.`)
    process.exit(0)
  }
  const overrides = await loadOverrides()
  const entries = Object.entries(overrides)
  if (entries.length === 0) {
    console.log(`No overrides for ${SLUG}.`)
    process.exit(0)
  }
  console.log(`\nOverrides for ${SLUG}:\n`)
  for (const [key, meta] of entries) {
    console.log(`  ${key.padEnd(12)} = ${JSON.stringify(meta.value).padEnd(40)}  (${meta.set_at} by ${meta.set_by})`)
  }
  process.exit(0)
}

// ── Validate ──────────────────────────────────────────────────────────────────

const setEntries = args.set ?? []
const unsetKeys  = args.unset ?? []

if (setEntries.length === 0 && unsetKeys.length === 0) {
  console.log('No changes. Use --set key=value, --unset key, or --list.')
  process.exit(0)
}

for (const pair of setEntries) {
  const eqIdx = pair.indexOf('=')
  if (eqIdx < 1) {
    console.error(`Invalid --set format (expected key=value): "${pair}"`)
    process.exit(1)
  }
  const key = pair.slice(0, eqIdx).trim()
  if (!SUPPORTED_KEYS.has(key)) {
    console.error(`Unknown override key: "${key}"`)
    console.error(`Supported keys: ${[...SUPPORTED_KEYS].join(', ')}`)
    process.exit(1)
  }
}

// ── Apply changes ─────────────────────────────────────────────────────────────

const overrides = await loadOverrides()
let changed = false

for (const pair of setEntries) {
  const eqIdx = pair.indexOf('=')
  const key   = pair.slice(0, eqIdx).trim()
  const value = pair.slice(eqIdx + 1).trim()
  const prev  = overrides[key]

  overrides[key] = { value, set_at: new Date().toISOString(), set_by: process.env.USER ?? 'unknown' }

  if (prev) {
    console.log(`  Updated  ${key}: ${JSON.stringify(prev.value)} → ${JSON.stringify(value)}`)
  } else {
    console.log(`  Set      ${key} = ${JSON.stringify(value)}`)
  }
  changed = true
}

for (const key of unsetKeys) {
  if (key in overrides) {
    delete overrides[key]
    console.log(`  Cleared  ${key}`)
    changed = true
  } else {
    console.log(`  ${key} was not set — nothing to clear`)
  }
}

if (!changed) {
  console.log('No effective changes.')
  process.exit(0)
}

await saveOverrides(overrides)
console.log(`\n✓ Saved: ${relative(process.cwd(), overridesPath)}`)

// Invalidate existing approval so --apply can't run on stale data
if (existsSync(approvedPath)) {
  const approved = JSON.parse(await readFile(approvedPath, 'utf8'))
  if (approved.approved && !approved.invalidated) {
    approved.invalidated = true
    approved.invalidated_reason = `Overrides updated at ${new Date().toISOString()}`
    await writeFile(approvedPath, JSON.stringify(approved, null, 2) + '\n', 'utf8')
    console.log('⚠ Existing approval invalidated.')
  }
}

// Print next steps
console.log(`\nNext steps:`)
console.log(`  1. Regenerate manifests:  yarn client:import --slug ${SLUG} --dry-run`)
console.log(`     (overrides applied automatically during seed generation)`)
console.log(`  2. Approve:               yarn client:import --slug ${SLUG} --approve`)
console.log(`  3. Apply:                 yarn client:import --slug ${SLUG} --apply`)
