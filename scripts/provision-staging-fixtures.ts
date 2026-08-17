#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (!process.argv.includes('--staging')) {
  console.error('Usage: node --experimental-strip-types scripts/provision-staging-fixtures.ts --staging')
  process.exit(1)
}

const root = process.cwd()
const wrangler = resolve(root, 'node_modules/.bin/wrangler')
const maxBuffer = 32 * 1024 * 1024

const expectedSiteOwners = new Map([
  ['site-demo', 'org-demo'],
  ['site-mcp-free', 'org-mcp-free'],
  ['site-mcp-growth', 'org-mcp-growth'],
  ['site-mcp-growth-service', 'org-mcp-growth-service'],
  ['site-pottery-house', 'org-pottery-house'],
  ['site-kikuzuki', 'org-kikuzuki'],
  ['site-ncls-blawby', 'org-ncls-blawby'],
])

const protectedOrganizationIds = [
  'org-demo',
  'org_demo',
  'org-mcp-free',
  'org-mcp-growth',
  'org-mcp-growth-service',
  'org-mcp-managed',
  'org-transfer-recipient',
  'org-pottery-house',
  'org-kikuzuki',
  'org-ncls-blawby',
]

type D1Result<T> = Array<{ results: T[] }>

function d1Json<T>(command: string): T[] {
  const output = execFileSync(wrangler, [
    'd1', 'execute', 'DB', '--env', 'staging', '--remote', '--json', '--command', command,
  ], { cwd: root, encoding: 'utf8', maxBuffer })
  const parsed = JSON.parse(output) as D1Result<T>
  return parsed[0]?.results ?? []
}

const quotedOrganizations = protectedOrganizationIds.map(value => `'${value}'`).join(', ')
const protectedRows = d1Json<{ id: string; organization_id: string; subdomain: string | null }>(
  `SELECT id, organization_id, subdomain FROM sites WHERE organization_id IN (${quotedOrganizations}) ORDER BY id`,
)

for (const row of protectedRows) {
  const expectedOwner = expectedSiteOwners.get(row.id)
  if (!expectedOwner || row.organization_id !== expectedOwner) {
    throw new Error(
      `Refusing staging fixture provisioning: protected organization ${row.organization_id} owns unexpected site ${row.id}`,
    )
  }
}

const quotedSiteIds = [...expectedSiteOwners.keys()].map(value => `'${value}'`).join(', ')
const namedRows = d1Json<{ id: string; organization_id: string }>(
  `SELECT id, organization_id FROM sites WHERE id IN (${quotedSiteIds}) ORDER BY id`,
)

for (const row of namedRows) {
  const expectedOwner = expectedSiteOwners.get(row.id)
  if (row.organization_id !== expectedOwner) {
    throw new Error(
      `Refusing staging fixture provisioning: ${row.id} belongs to ${row.organization_id}, expected ${expectedOwner}`,
    )
  }
}

const bookmark = execFileSync(wrangler, [
  'd1', 'time-travel', 'info', 'DB', '--env', 'staging', '--json',
], { cwd: root, encoding: 'utf8', maxBuffer }).trim()
console.log(`[fixtures:staging] Pre-provision restore point: ${bookmark}`)

const generators = [
  ['demo', 'scripts/generate-demo-seed.ts'],
  ['pottery-house', 'scripts/generate-pottery-house-seed.ts'],
  ['kikuzuki', 'scripts/generate-kikuzuki-seed.ts'],
  ['blawby', 'scripts/generate-blawby-ci-seed.ts'],
] as const

const tempDir = mkdtempSync(join(tmpdir(), 'krabiclaw-staging-fixtures-'))

try {
  for (const [label, script] of generators) {
    const sql = execFileSync(process.execPath, [
      '--experimental-strip-types', resolve(root, script), '--stdout',
    ], { cwd: root, encoding: 'utf8', maxBuffer })
    const sqlPath = join(tempDir, `${label}.sql`)
    writeFileSync(sqlPath, sql, 'utf8')
    console.log(`[fixtures:staging] Applying deterministic ${label} fixture`)
    execFileSync(wrangler, [
      'd1', 'execute', 'DB', '--env', 'staging', '--remote', '--file', sqlPath,
    ], { cwd: root, stdio: 'inherit', maxBuffer })
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

const contractRows = d1Json<{
  site_id: string
  organization_id: string
  invalid_menu_json: number
  invalid_experience_slots: number
  missing_article_canonical: number
}>(`
  SELECT s.id AS site_id, s.organization_id,
         (SELECT COUNT(*)
            FROM menu_items mi
            JOIN menus m ON m.id = mi.menu_id
           WHERE m.site_id = s.id
             AND ((mi.allergens IS NOT NULL AND NOT json_valid(mi.allergens))
               OR (mi.ingredients IS NOT NULL AND NOT json_valid(mi.ingredients))
               OR (mi.dietary_notes IS NOT NULL AND NOT json_valid(mi.dietary_notes)))) AS invalid_menu_json,
         (SELECT COUNT(*)
            FROM experiences e
           WHERE e.site_id = s.id
             AND e.time_slots IS NOT NULL
             AND CASE
                   WHEN json_valid(e.time_slots) THEN json_type(e.time_slots) != 'array'
                   ELSE 1
                 END) AS invalid_experience_slots,
         (SELECT COUNT(*)
            FROM blog_posts p
           WHERE p.site_id = s.id AND p.status = 'published'
             AND (p.canonical_url IS NULL OR trim(p.canonical_url) = '')) AS missing_article_canonical
    FROM sites s
   WHERE s.id IN ('site-demo', 'site-pottery-house', 'site-kikuzuki', 'site-ncls-blawby')
   ORDER BY s.id
`)

if (contractRows.length !== 4) {
  throw new Error(`Staging fixture provisioning produced ${contractRows.length} curated sites; expected 4`)
}

for (const row of contractRows) {
  const expectedOwner = expectedSiteOwners.get(row.site_id)
  if (
    row.organization_id !== expectedOwner
    || row.invalid_menu_json !== 0
    || row.invalid_experience_slots !== 0
    || row.missing_article_canonical !== 0
  ) {
    throw new Error(`Staging fixture contract failed for ${row.site_id}: ${JSON.stringify(row)}`)
  }
}

console.log('[fixtures:staging] Deterministic fixture provisioning passed')
