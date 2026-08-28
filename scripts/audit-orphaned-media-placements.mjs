#!/usr/bin/env node
// media_placements.owner_id is polymorphic with no owner foreign key, so a row
// whose owner was deleted without explicit cleanup never gets caught by SQLite
// itself. This audits every declared owner_type against its real owner table
// and reports any orphaned rows — it should return zero across the board.

import { execFileSync } from 'node:child_process'

const OWNER_TABLES = {
  site: 'sites',
  business_location: 'business_locations',
  product: 'products',
  post: 'posts',
  blog_post: 'blog_posts',
  experience: 'experiences',
  offering: 'offerings',
  content_block: 'content_blocks',
  platform_doc: 'platform_docs',
  review: 'reviews',
  review_request: 'review_requests',
  tenant_compliance: 'tenant_compliance',
  chowbot_message: 'chowbot_messages',
}

const query = `SELECT
  mp.owner_type,
  COUNT(*) AS orphaned_count
FROM media_placements mp
WHERE ${Object.entries(OWNER_TABLES).map(([ownerType, table]) => `
  (mp.owner_type = '${ownerType}' AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.id = mp.owner_id))
`).join(' OR ')}
GROUP BY mp.owner_type
ORDER BY mp.owner_type;`

const declaredOwnerTypes = Object.keys(OWNER_TABLES)
const unknownOwnerTypeQuery = `SELECT DISTINCT owner_type FROM media_placements WHERE owner_type NOT IN (${declaredOwnerTypes.map(t => `'${t}'`).join(',')});`

const targets = process.argv.slice(2)
const selected = targets.length ? targets : ['local']
let failed = false

for (const target of selected) {
  if (!['local', 'preview', 'staging', 'production'].includes(target)) {
    throw new Error(`Unsupported environment: ${target}`)
  }
  const args = ['wrangler', 'd1', 'execute', 'DB']
  if (target === 'local') args.push('--local')
  else {
    if (target !== 'production') args.push('--env', target)
    args.push('--remote')
  }

  const orphanRaw = execFileSync('npx', [...args, '--command', query, '--json'], { encoding: 'utf8' })
  const orphanRows = JSON.parse(orphanRaw)[0]?.results ?? []

  const unknownRaw = execFileSync('npx', [...args, '--command', unknownOwnerTypeQuery, '--json'], { encoding: 'utf8' })
  const unknownRows = JSON.parse(unknownRaw)[0]?.results ?? []

  if (orphanRows.length === 0 && unknownRows.length === 0) {
    console.log(`ok  ${target}: no orphaned media_placements rows`)
    continue
  }

  failed = true
  for (const row of orphanRows) {
    console.error(`not ok  ${target}: ${row.orphaned_count} orphaned media_placements row(s) for owner_type='${row.owner_type}'`)
  }
  for (const row of unknownRows) {
    console.error(`not ok  ${target}: media_placements has undeclared owner_type='${row.owner_type}' (not in shared/media-placement-contract.ts)`)
  }
}

if (failed) process.exit(1)
