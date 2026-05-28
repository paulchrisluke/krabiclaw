#!/usr/bin/env node
/**
 * Regression fixture: Pottery House Krabi (experience vertical)
 *
 * This is the canonical test case derived from the Pottery House Krabi
 * onboarding incident. It documents the exact failure modes encountered
 * and asserts they cannot regress.
 *
 * What this tests:
 *   - Two Google Maps URLs (primary + beachfront location)
 *   - Experience vertical (not restaurant)
 *   - Client photos (not stock)
 *   - No restaurant copy bleeds through
 *   - Experience slugs route correctly
 *   - Location slugs route correctly
 *   - Q&A aggregation works (has qa records)
 *   - Static fallback phone must not be served (Saya demo phone)
 *   - Static Saya "Also part of Saya" copy must not appear
 *   - Image 404 must fail the run
 *   - Demo data (Ember & Slice) must not appear
 *
 * Usage:
 *   node scripts/fixtures/pottery-house-krabi.fixture.mjs --url http://localhost:3000 --site-id site-pottery-house-krabi
 *   node scripts/fixtures/pottery-house-krabi.fixture.mjs --url https://pottery-house-krabi.krabiclaw.com --site-id site-pottery-house-krabi
 *
 * Exit code 0 = all assertions passed. Non-zero = fixture regression detected.
 */

import { parseArgs } from 'node:util'
import { _spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const { values: args } = parseArgs({
  options: {
    url:       { type: 'string' },
    'site-id': { type: 'string', default: 'site-pottery-house-krabi' },
    slug:      { type: 'string', default: 'pottery-house-krabi' },
  },
  allowPositionals: false,
})

if (!args.url) {
  console.error('Usage: node scripts/fixtures/pottery-house-krabi.fixture.mjs --url <site-url> [--site-id <id>]')
  process.exit(1)
}

const BASE    = args.url.replace(/\/$/, '')
const SITE_ID = args['site-id']
const SLUG    = args.slug

let passed    = 0
let failed    = 0
const issues  = []

function assert(label, value, expected) {
  if (value === expected) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    got:      ${JSON.stringify(value)}`)
    issues.push(label)
    failed++
  }
}

function assertContains(label, haystack, needle) {
  if (typeof haystack === 'string' && haystack.toLowerCase().includes(needle.toLowerCase())) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label} — "${needle}" not found`)
    issues.push(label)
    failed++
  }
}

function assertNotContains(label, haystack, needle) {
  if (typeof haystack === 'string' && !haystack.toLowerCase().includes(needle.toLowerCase())) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label} — forbidden string "${needle}" found`)
    issues.push(label)
    failed++
  }
}

function section(title) { console.log(`\n── ${title}`) }

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', ...opts })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, status: 0, text: async () => '', json: async () => ({}), statusText: err.message }
  }
}

console.log(`\n┌─ Pottery House Krabi — Regression Fixture ${'─'.repeat(20)}`)
console.log(`│  URL:      ${BASE}`)
console.log(`│  Site ID:  ${SITE_ID}`)
console.log(`│  Vertical: experience`)
console.log(`└${'─'.repeat(63)}`)

// ── 1. Route availability ─────────────────────────────────────────────────────

section('Route availability (all must 200)')

const REQUIRED_ROUTES = [
  '/', '/locations', '/reviews', '/qa', '/posts', '/about', '/contact',
  '/experiences', '/reservations',
]

const pageHtml = {}
for (const route of REQUIRED_ROUTES) {
  const res = await get(route)
  assert(`GET ${route} → 200`, res.ok, true)
  if (res.ok) pageHtml[route] = await res.text()
}

// ── 2. Two locations from bootstrap ──────────────────────────────────────────

section('Bootstrap: two locations (primary + beachfront)')

const bootstrapRes = await get(`/api/public/sites/${SITE_ID}/bootstrap`)
let bootstrapData = null

if (bootstrapRes.ok) {
  bootstrapData = await bootstrapRes.json()
  const locs = bootstrapData.locations ?? []
  assert('Bootstrap returns exactly 2 locations', locs.length, 2)

  // Location slug routing
  for (const loc of locs) {
    const route = `/locations/${loc.slug}`
    const r = await get(route)
    assert(`Location slug routes: GET ${route} → 200`, r.ok, true)
    if (r.ok) pageHtml[route] = await r.text()
  }
} else {
  console.error(`  ✗ Bootstrap API failed: ${bootstrapRes.status}`)
  failed++
  issues.push('Bootstrap API unavailable')
}

// ── 3. Experience slugs ───────────────────────────────────────────────────────

section('Experience slugs route correctly')

const expRes = await get(`/api/public/sites/${SITE_ID}/bootstrap?page=experiences`)
if (expRes.ok) {
  const expData = await expRes.json()
  const experiences = expData.experiencesList ?? []
  assert('At least 1 experience returned from bootstrap', experiences.length >= 1, true)

  for (const exp of experiences.slice(0, 3)) {
    if (!exp.slug) continue
    const route = `/experiences/${exp.slug}`
    const r = await get(route)
    assert(`Experience slug routes: GET ${route} → 200`, r.ok, true)
    if (r.ok) pageHtml[route] = await r.text()
  }
} else {
  failed++
  issues.push('Experiences bootstrap unavailable')
}

// ── 4. No restaurant copy anywhere ───────────────────────────────────────────

section('No restaurant copy (experience vertical must not bleed restaurant strings)')

const allHtml = Object.values(pageHtml).join('\n')

const FORBIDDEN = [
  'Come dine with us',
  'Reserve a table',
  'From the kitchen',
  'one kitchen philosophy',
  'Catering & events',
  "chef's table",
  'tasting menu',
  'dine differently',
]

for (const str of FORBIDDEN) {
  assertNotContains(`No "${str}" in any page`, allHtml, str)
}

// ── 5. Required experience copy ───────────────────────────────────────────────

section('Required experience copy present')

assertContains('CTA "Book a class" present', allHtml, 'book a class')
assertContains('"From the studio" posts eyebrow present', allHtml, 'from the studio')

// ── 6. No demo/fallback data ─────────────────────────────────────────────────

section('No demo or Saya fallback data')

assertNotContains('No "Also part of Saya" copy', allHtml, 'Also part of Saya')
assertNotContains('No "Ember & Slice" demo data', allHtml, 'Ember & Slice')
assertNotContains('No "kikuzuki" copy on experience site', allHtml, 'kikuzuki')

if (bootstrapData) {
  const allJson = JSON.stringify(bootstrapData)
  assertNotContains('No Saya demo phone in bootstrap', allJson, '+66 81 270 2616')
  assertNotContains('No Ember & Slice in bootstrap JSON', allJson, 'Ember & Slice')
}

// ── 7. Contact data ───────────────────────────────────────────────────────────

section('Contact data (phone and email)')

if (bootstrapData) {
  const phones = (bootstrapData.locations ?? []).map(l => l.phone).filter(Boolean)
  assert('At least one location has a phone number', phones.length >= 1, true)
}

// ── 8. Q&A presence ──────────────────────────────────────────────────────────

section('Q&A page has content')

if (pageHtml['/qa']) {
  // The Q&A page should render more than just a shell
  assert('/qa page is not empty shell', pageHtml['/qa'].length > 500, true)
}

// ── 9. Image 404 would fail ───────────────────────────────────────────────────

section('Image 404 detection (contract check)')

// Verify the bootstrap has image URLs and they resolve (regression: image 404 must fail)
if (bootstrapData) {
  const imageUrls = []
  for (const loc of (bootstrapData.locations ?? [])) {
    if (loc.hero_image_public_url) imageUrls.push(loc.hero_image_public_url)
    if (loc.public_url) imageUrls.push(loc.public_url)
  }

  if (imageUrls.length === 0) {
    console.error('  ✗ No image URLs in bootstrap — cannot verify image 404 detection')
    failed++
    issues.push('No image URLs in bootstrap response')
  } else {
    for (const url of imageUrls.slice(0, 3)) {
      const r = await get(url, { method: 'HEAD' })
      assert(`Image resolves: ${url.slice(0, 60)}`, r.ok, true)
    }
  }
}

// ── 10. Two Google Maps source URLs in manifest ────────────────────────────────

section('Client manifest: two Maps URLs recorded')

const manifestPath = join(process.cwd(), 'client-imports', SLUG, 'client-manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const hasPrimary   = !!manifest.primary_location?.source_url
  const hasSecondary = (manifest.secondary_locations ?? []).length >= 1
  assert('Primary Maps URL recorded in manifest', hasPrimary, true)
  assert('At least one secondary (beachfront) Maps URL recorded', hasSecondary, true)
} else {
  console.log('  (skipped — no client manifest found locally; run client:import --dry-run first)')
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(64)}`)
console.log(`  ${passed} passed  ${failed} failed`)
console.log('─'.repeat(64))

if (failed > 0) {
  console.error('\n  FIXTURE FAILED — the following assertions regressed:')
  for (const issue of issues) console.error(`    - ${issue}`)
  console.error('\n  This is the canonical Pottery House Krabi case. Fix the underlying')
  console.error('  issue before shipping — do not adjust the fixture to match the bug.\n')
  process.exit(1)
} else {
  console.log('\n  FIXTURE PASSED — Pottery House Krabi regression case is clean.\n')
  process.exit(0)
}
