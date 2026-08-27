#!/usr/bin/env node
/**
 * One-time backup of the kikuzuki org from prod remote D1.
 * Outputs a self-contained SQL restore file with FK-safe insert order.
 *
 * Usage: node scripts/backup-kikuzuki.mjs
 */

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

const ORG  = 'org-IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO-1778576822253'
const USER = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'

function query(sql) {
  const raw = execSync(
    `yarn --silent wrangler d1 execute DB --remote --command ${JSON.stringify(sql)} 2>/dev/null`,
    { encoding: 'utf8' }
  )
  const start = raw.indexOf('[')
  const end   = raw.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  const parsed = JSON.parse(raw.slice(start, end + 1))
  return parsed[0]?.results ?? []
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return `'${String(val).replace(/'/g, "''")}'`
}

function inserts(table, rows, nullify = []) {
  if (!rows.length) return `-- ${table}: (empty)\n`
  return rows.map(row => {
    const cols = Object.keys(row)
    const vals = cols.map(c => nullify.includes(c) ? 'NULL' : esc(row[c]))
    return `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`
  }).join('\n') + '\n'
}

const out = [
  `-- Kikuzuki prod backup`,
  `-- Generated: ${new Date().toISOString()}`,
  `-- Org: ${ORG}`,
  `-- User: ${USER}`,
  ``,
  `PRAGMA foreign_keys = OFF;`,
  ``,
]

// --- Auth / Identity ---
console.log('Fetching organization...')
out.push('-- organization')
out.push(inserts('organization', query(`SELECT * FROM organization WHERE id = '${ORG}'`)))

console.log('Fetching user...')
out.push('-- user')
out.push(inserts('user', query(`SELECT * FROM user WHERE id = '${USER}'`)))

console.log('Fetching account...')
out.push('-- account')
out.push(inserts('account', query(`SELECT * FROM account WHERE userId = '${USER}'`)))

console.log('Fetching member...')
out.push('-- member')
out.push(inserts('member', query(`SELECT * FROM member WHERE organizationId = '${ORG}'`)))

console.log('Fetching sites...')
const siteRows = query(`SELECT * FROM sites WHERE organization_id = '${ORG}'`)
out.push('-- sites')
out.push(inserts('sites', siteRows))

console.log('Fetching site_domains...')
out.push('-- site_domains')
out.push(inserts('site_domains', query(`SELECT * FROM site_domains WHERE organization_id = '${ORG}'`)))

console.log('Fetching business_locations...')
const locRows = query(`SELECT * FROM business_locations WHERE organization_id = '${ORG}'`)
out.push('-- business_locations')
out.push(inserts('business_locations', locRows))

console.log('Fetching media_assets...')
out.push('-- media_assets')
out.push(inserts('media_assets', query(`SELECT * FROM media_assets WHERE organization_id = '${ORG}'`)))

console.log('Fetching media_placements...')
out.push('-- media_placements')
out.push(inserts('media_placements', query(`SELECT * FROM media_placements WHERE organization_id = '${ORG}'`)))

// --- Menus ---
console.log('Fetching menus...')
out.push('-- menus')
out.push(inserts('menus', query(`SELECT * FROM menus WHERE organization_id = '${ORG}'`)))

console.log('Fetching menu_items...')
out.push('-- menu_items')
out.push(inserts('menu_items', query(
  `SELECT * FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE organization_id = '${ORG}')`
)))

// --- Canonical tenant pages ---
console.log('Fetching tenant pages...')
out.push('-- tenant_pages')
out.push(inserts('tenant_pages', query(`SELECT * FROM tenant_pages WHERE organization_id = '${ORG}'`)))
out.push('-- tenant_page_variants')
out.push(inserts('tenant_page_variants', query(`SELECT * FROM tenant_page_variants WHERE organization_id = '${ORG}'`)))

// --- Credits + booking ---
console.log('Fetching ai_credits...')
out.push('-- ai_credits')
out.push(inserts('ai_credits', query(`SELECT * FROM ai_credits WHERE organization_id = '${ORG}'`)))

console.log('Fetching reservation_submissions...')
out.push('-- reservation_submissions')
out.push(inserts('reservation_submissions', query(`SELECT * FROM reservation_submissions WHERE organization_id = '${ORG}'`)))

out.push(`PRAGMA foreign_keys = ON;`)
out.push(``)
out.push(`-- Verify`)
out.push(`SELECT 'user'       , COUNT(*) FROM user               WHERE id             = '${USER}';`)
out.push(`SELECT 'sites'      , COUNT(*) FROM sites              WHERE organization_id = '${ORG}';`)
out.push(`SELECT 'locations'  , COUNT(*) FROM business_locations WHERE organization_id = '${ORG}';`)
out.push(`SELECT 'media'      , COUNT(*) FROM media_assets       WHERE organization_id = '${ORG}';`)
out.push(`SELECT 'tenant_pages', COUNT(*) FROM tenant_pages      WHERE organization_id = '${ORG}';`)
out.push(`SELECT 'menu_items' , COUNT(*) FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE organization_id = '${ORG}');`)

const filename = `prod-backup-kikuzuki-${new Date().toISOString().slice(0, 10)}.sql`
writeFileSync(filename, out.join('\n'))
console.log(`\nDone. Written to ${filename}`)
