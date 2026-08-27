#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// One-time production fix for the 2026-08-27 media-placement migration outage.
//
// Migration 0129_cooing_salo.sql's __media_migration_guard aborted on production
// (correctly - see incident notes) because platform_content_components had rows
// with content_type = 'blog_post'. 0129's own migration logic only ever migrates
// content_type = 'platform_doc' rows into content_blocks, so it has no code path
// for these. This script generalizes that same migration pattern to blog_post
// rows, then clears the table of anything the real migration can't handle so
// 0129 (and everything after it) can be re-run and succeed.
//
// This is deliberately NOT a new migration file: 0129 already succeeded on
// staging, which means platform_content_components no longer exists there (or
// on preview, or any future fresh environment) - a migration file that queries
// that table would hard-fail everywhere except production. This condition only
// exists on production, once, right now.
//
// Delete this script once it's been run against production and confirmed clean.
// It has no ongoing purpose.

const isApply = process.argv.includes('--apply')

function d1Json(command) {
  const cmd = `npx wrangler d1 execute DB --remote --command "${command.replace(/"/g, '\\"')}" --json`
  const output = execSync(cmd, { encoding: 'utf8' })
  return JSON.parse(output)[0].results
}

console.log(isApply ? '[fix-platform-content-components-drift] Running against production (--apply)' : '[fix-platform-content-components-drift] Dry run (pass --apply to write)')

const driftRows = d1Json(
  "SELECT id, content_type, content_id, type, position, data_json, created_at, updated_at FROM platform_content_components WHERE content_type <> 'doc' OR type NOT IN ('faq', 'how_to', 'ai_assistance')"
)

if (driftRows.length === 0) {
  console.log('No drift found - platform_content_components already satisfies the 0129 guard. Nothing to do.')
  process.exit(0)
}

console.log(`Found ${driftRows.length} row(s) outside 0129's expected shape:`)
for (const row of driftRows) console.log(`  ${row.id}  content_type=${row.content_type}  content_id=${row.content_id}  type=${row.type}`)

const statements = []
for (const row of driftRows) {
  if (row.content_type !== 'blog_post') {
    console.log(`  -> ${row.id}: unrecognized content_type "${row.content_type}", no migration path known. Refusing to guess - handle this one by hand.`)
    process.exit(1)
  }

  const [blogPost] = d1Json(`SELECT id, site_id, organization_id, created_at, updated_at FROM blog_posts WHERE id = '${row.content_id}'`)

  if (!blogPost) {
    console.log(`  -> ${row.id}: content_id ${row.content_id} matches no blog_posts row (and it's the only owner type this content_type can have). Orphaned - will be deleted, nothing to preserve.`)
    statements.push(`DELETE FROM platform_content_components WHERE id = '${row.id}';`)
    continue
  }

  const ownerType = blogPost.site_id === null ? 'platform_blog' : 'tenant_blog'
  const docId = `migration-doc-blog-${blogPost.id}`
  const bodyBlockId = `migration-block-blog-${blogPost.id}`
  const blockId = `migration-component-${row.id}`

  console.log(`  -> ${row.id}: real FAQ/component on blog_posts.id=${blogPost.id} (${ownerType}). Will migrate the post body + this component into content_documents/content_blocks as ${bodyBlockId} and ${blockId}.`)

  // Document creation, then the position-0 markdown body block, mirroring 0129's
  // own blog_posts migration exactly (lines 70-80) - including its idempotency
  // condition (skip the body block if this document already has ANY block).
  // This MUST run before the component insert below: 0129 will see this same
  // document already has a block and skip re-inserting the body, so if the
  // component block landed first, the real post body would never migrate.
  statements.push(`
INSERT INTO content_documents (id, owner_type, owner_id, created_at, updated_at)
SELECT '${docId}', '${ownerType}', '${blogPost.id}', '${blogPost.created_at}', '${blogPost.updated_at}'
 WHERE NOT EXISTS (SELECT 1 FROM content_documents WHERE owner_type = '${ownerType}' AND owner_id = '${blogPost.id}');`)

  statements.push(`
INSERT INTO content_blocks (id, document_id, type, position, data_json, created_at, updated_at)
SELECT '${bodyBlockId}', d.id, 'markdown', 0, json_object('markdown', b.body, 'editor_mode', 'source'), b.created_at, b.updated_at
  FROM blog_posts b JOIN content_documents d ON d.owner_type = '${ownerType}' AND d.owner_id = b.id
 WHERE b.id = '${blogPost.id}' AND NOT EXISTS (SELECT 1 FROM content_blocks cb WHERE cb.document_id = d.id);`)

  statements.push(`
INSERT INTO content_blocks (id, document_id, type, position, data_json, created_at, updated_at)
SELECT '${blockId}', d.id, '${row.type}', ${row.position} + 1, '${row.data_json.replace(/'/g, "''")}', '${row.created_at}', '${row.updated_at}'
  FROM content_documents d WHERE d.owner_type = '${ownerType}' AND d.owner_id = '${blogPost.id}'
   AND NOT EXISTS (SELECT 1 FROM content_blocks WHERE id = '${blockId}');`)

  // Only drop the source row once both inserts above are in the same statement
  // list ahead of it - if either insert were to fail, this DELETE never runs.
  statements.push(`DELETE FROM platform_content_components WHERE id = '${row.id}';`)
}

if (!isApply) {
  console.log('\n--- SQL that --apply would run ---')
  console.log(statements.join('\n'))
  console.log('\nDry run only - no changes made. Re-run with --apply to execute.')
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-fix-platform-content-components-'))
const sqlPath = join(dir, 'fix.sql')
writeFileSync(sqlPath, statements.join('\n'))
execSync(`npx wrangler d1 execute DB --remote --file "${sqlPath}"`, { stdio: 'inherit' })
rmSync(dir, { recursive: true, force: true })

const [{ unresolved }] = d1Json(
  "SELECT COUNT(*) as unresolved FROM platform_content_components WHERE content_type <> 'doc' OR type NOT IN ('faq', 'how_to', 'ai_assistance')"
)

if (Number(unresolved) !== 0) {
  console.error(`Guard still unresolved after fix: ${unresolved} row(s) remain. Migration 0129 will still fail. Do not proceed.`)
  process.exit(1)
}

console.log('Fixed. 0129\'s guard condition now resolves to 0 - safe to re-run `wrangler d1 migrations apply DB --remote` against production.')
