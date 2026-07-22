#!/usr/bin/env -S node --experimental-strip-types
// One-time backfill for blog posts (platform and tenant) that predate the
// block-content system: they have blog_posts.body but no content_documents/
// content_revisions/content_blocks rows, so get_platform_blog_post /
// getPublishedPlatformBlogPost / getPublishedSiteBlogPost 500 on read, or the
// editor/MCP surfaces return an empty article. Reuses the canonical
// markdownToContentBlocks() parser and mergeLegacyBlogComponents() merge
// logic from server/utils/content-documents.ts rather than hand-rolling
// block conversion or silently dropping legacy FAQ/How-To component rows.
//
// Also repairs documents already (incorrectly) created by an earlier run of
// this script that inserted content_documents/content_revisions but never
// inserted the live content_blocks rows the editor and MCP reads actually
// use — see BACKFILL_LABEL below, which tags every revision this script
// creates so a partial-repair pass can find them again unambiguously.
//
// Usage: node scripts/backfill-missing-blog-content-documents.mjs --dry-run|--apply
// --apply is a deliberate, separate operator decision — never run
// automatically as part of a deploy or CI step.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { register } from 'node:module'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)
const { markdownToContentBlocks, mergeLegacyBlogComponents } = await import('../server/utils/content-documents.ts')

const BACKFILL_LABEL = 'Backfill: missing content_documents (2026-07-22 incident)'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
if (!apply && !args.includes('--dry-run')) {
  console.error('Usage: node scripts/backfill-missing-blog-content-documents.mjs --dry-run|--apply')
  process.exit(1)
}

// Values are interpolated directly (not via `?` placeholders): the source
// text being escaped here is blog body markdown, which routinely contains
// literal `?` characters, so a naive "replace each `?` in the final SQL
// string" approach would misfire. `q()` escapes single quotes only; every
// value passed through it is treated as a literal string, never as SQL.
const q = value => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`)

function run(sql) {
  const result = spawnSync('node_modules/.bin/wrangler', ['d1', 'execute', 'krabiclaw-db', '--remote', '--json', '--command', sql], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim())
  const parsed = JSON.parse(result.stdout || '[]')
  return parsed.flatMap(entry => entry.results ?? [])
}

function contentBlockInserts(docId, normalizedBlocks, now) {
  return normalizedBlocks.map(block => `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
    VALUES (${q(block.id)}, ${q(docId)}, ${q(block.parent_block_id ?? null)}, ${q(block.type)}, ${block.position}, ${block.level ?? 'NULL'}, ${q(JSON.stringify(block.data))}, ${q(now)}, ${q(now)})`)
}

// --- Pass 1: repair documents this script already created without live content_blocks rows ---
// Identified unambiguously via BACKFILL_LABEL on the revision, not by "any
// document with zero blocks" (a document could legitimately have zero blocks
// mid-edit through another path) — only ever touch rows this script itself
// produced.
const partialDocs = run(`
  SELECT d.id AS document_id, d.owner_id AS post_id, d.owner_type, d.draft_revision_id, d.published_revision_id,
         p.status, p.site_id, r.id AS revision_id, r.snapshot_json
    FROM content_documents d
    JOIN content_revisions r ON r.id = COALESCE(d.draft_revision_id, d.published_revision_id)
    JOIN blog_posts p ON p.id = d.owner_id
   WHERE r.label = ${q(BACKFILL_LABEL)}
     AND NOT EXISTS (SELECT 1 FROM content_blocks cb WHERE cb.document_id = d.id)
`)

// Same identification: a scheduled post's document should only ever have
// draft_revision_id + blog_posts.scheduled_revision_id set, never
// published_revision_id, until the post is actually published. An earlier
// buggy run of this script set published_revision_id for scheduled posts too
// — find and clear those, but only where the revision is this script's own.
const wronglyPublishedScheduled = run(`
  SELECT d.id AS document_id, d.published_revision_id
    FROM content_documents d
    JOIN content_revisions r ON r.id = d.published_revision_id
    JOIN blog_posts p ON p.id = d.owner_id
   WHERE r.label = ${q(BACKFILL_LABEL)}
     AND p.status = 'scheduled'
`)

if (partialDocs.length || wronglyPublishedScheduled.length) {
  console.log(`Repair pass: ${partialDocs.length} document(s) missing live content_blocks, ${wronglyPublishedScheduled.length} scheduled document(s) with an incorrectly set published_revision_id.`)
  for (const doc of partialDocs) console.log(`  - repair blocks: post ${doc.post_id} (document ${doc.document_id}, status=${doc.status})`)
  for (const doc of wronglyPublishedScheduled) console.log(`  - clear published_revision_id: document ${doc.document_id}`)

  if (apply) {
    for (const doc of partialDocs) {
      const snapshot = JSON.parse(doc.snapshot_json)
      const now = new Date().toISOString()
      const inserts = contentBlockInserts(doc.document_id, snapshot.blocks, now)
      if (inserts.length) run(inserts.join(';\n'))
      console.log(`  -> repaired blocks for document ${doc.document_id} (${inserts.length} block(s))`)
    }
    for (const doc of wronglyPublishedScheduled) {
      run(`UPDATE content_documents SET published_revision_id = NULL WHERE id = ${q(doc.document_id)}`)
      console.log(`  -> cleared published_revision_id for document ${doc.document_id}`)
    }
  } else {
    console.log('  (dry run — re-run with --apply to write these repairs)')
  }
  console.log('')
}

// --- Pass 2: create documents for posts still missing one entirely ---
const posts = run(`
  SELECT p.id, p.slug, p.site_id, p.body, p.status
    FROM blog_posts p
    LEFT JOIN content_documents d
      ON d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
     AND d.owner_id = p.id
   WHERE d.id IS NULL
`)

if (!posts.length) {
  console.log('No blog posts are missing a content_documents row. Nothing else to do.')
  process.exit(0)
}

console.log(`${posts.length} blog post(s) missing content_documents:`)
for (const post of posts) console.log(`  - ${post.slug} (${post.id}, ${post.site_id ? `tenant site ${post.site_id}` : 'platform'}, status=${post.status})`)

const skipped = []
const applied = []

for (const post of posts) {
  const ownerType = post.site_id ? 'tenant_blog' : 'platform_blog'

  if (!['draft', 'published', 'scheduled'].includes(post.status)) {
    skipped.push({ post, reason: `unknown/invalid status "${post.status}" — report and skip, do not guess` })
    continue
  }

  const legacyComponents = run(`
    SELECT id AS component_id, type, position, data_json
      FROM platform_content_components
     WHERE content_type = 'blog_post' AND content_id = ${q(post.id)}
       AND type IN ('faq', 'how_to')
  `)

  let blocks = markdownToContentBlocks(post.body)
  if (legacyComponents.length) {
    const validComponents = []
    let malformed = false
    for (const component of legacyComponents) {
      let data
      try {
        data = JSON.parse(component.data_json)
      } catch {
        malformed = true
        break
      }
      const required = component.type === 'faq' ? data.items : data.steps
      if (!Array.isArray(required) || required.length === 0) {
        malformed = true
        break
      }
      validComponents.push({ component_id: component.component_id, type: component.type, position: component.position, data })
    }
    if (malformed) {
      skipped.push({ post, reason: 'has malformed legacy FAQ/How-To component rows — requires manual review, not a body-only conversion that would silently drop them' })
      continue
    }
    const merged = mergeLegacyBlogComponents(blocks, validComponents)
    const badFinding = merged.findings.find(f => f.action === 'malformed' || f.action === 'unmatched_placeholder')
    if (badFinding) {
      skipped.push({ post, reason: `legacy component merge reported "${badFinding.action}" (${badFinding.detail ?? 'no detail'}) — requires manual review` })
      continue
    }
    blocks = merged.blocks
  }

  const normalizedBlocks = blocks.map((block, index) => ({
    id: randomUUID(),
    ...block,
    position: index,
  }))
  const now = new Date().toISOString()
  const docId = randomUUID()
  const revisionId = randomUUID()
  const snapshotJson = JSON.stringify({ blocks: normalizedBlocks.map(block => ({ ...block, updated_at: now })) })

  console.log(`\n${post.slug}: ${normalizedBlocks.length} block(s) parsed (${normalizedBlocks.map(b => b.type).join(', ')})${legacyComponents.length ? `, merged ${legacyComponents.length} legacy component row(s)` : ''}`)

  applied.push({ post, docId, revisionId })
  if (!apply) continue

  // Only a genuinely already-published post gets published_revision_id.
  // Scheduled posts get a draft revision plus blog_posts.scheduled_revision_id
  // — exactly like the live createPlatformBlogPost path (see
  // server/utils/platform-content.ts) — never a populated published_revision_id
  // before the post is actually published.
  const publishedRevisionId = post.status === 'published' ? revisionId : null

  // Batched into one wrangler invocation (one D1 HTTP request, all-or-nothing)
  // so a mid-post failure can't leave a content_documents row with no
  // revision/blocks — the discovery query's `d.id IS NULL` filter would
  // otherwise skip that post forever on rerun. D1 rejects raw BEGIN/COMMIT,
  // so this relies on wrangler's single --command batching rather than an
  // explicit transaction.
  const statements = [
    `INSERT INTO content_documents (id, owner_type, owner_id, created_at, updated_at) VALUES (${q(docId)}, ${q(ownerType)}, ${q(post.id)}, ${q(now)}, ${q(now)})`,
    `INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, created_by, label, created_at) VALUES (${q(revisionId)}, ${q(docId)}, ${q(snapshotJson)}, ${q(post.body)}, NULL, ${q(BACKFILL_LABEL)}, ${q(now)})`,
    ...contentBlockInserts(docId, normalizedBlocks, now),
    // draft_revision_id is always set; published_revision_id only for a post
    // that was already published — never silently publish a draft or a
    // scheduled post ahead of its scheduled_for time.
    `UPDATE content_documents SET draft_revision_id = ${q(revisionId)}, published_revision_id = ${q(publishedRevisionId)}, updated_at = ${q(now)} WHERE id = ${q(docId)}`,
  ]
  if (post.status === 'scheduled') {
    statements.push(`UPDATE blog_posts SET scheduled_revision_id = ${q(revisionId)} WHERE id = ${q(post.id)}`)
  }
  run(statements.join(';\n'))
  console.log(`  -> applied: content_documents=${docId} content_revisions=${revisionId} content_blocks=${normalizedBlocks.length}`)
}

console.log(`\n${applied.length} post(s) ${apply ? 'backfilled' : 'would be backfilled'}, ${skipped.length} skipped for manual review.`)
if (skipped.length) {
  console.log('\nSkipped (requires manual review):')
  for (const { post, reason } of skipped) console.log(`  - ${post.slug} (${post.id}): ${reason}`)
}

if (!apply) {
  console.log('\nDry run only — re-run with --apply to write these rows.')
} else {
  const remaining = run(`
    SELECT COUNT(*) AS count FROM blog_posts p
      LEFT JOIN content_documents d
        ON d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
       AND d.owner_id = p.id
     WHERE d.id IS NULL
  `)
  const remainingCount = remaining[0]?.count ?? 'unknown'
  const remainingPartial = run(`
    SELECT COUNT(*) AS count FROM content_documents d
      JOIN content_revisions r ON r.id = COALESCE(d.draft_revision_id, d.published_revision_id)
     WHERE r.label = ${q(BACKFILL_LABEL)}
       AND NOT EXISTS (SELECT 1 FROM content_blocks cb WHERE cb.document_id = d.id)
  `)
  const remainingPartialCount = remainingPartial[0]?.count ?? 'unknown'
  console.log(`\nVerification: ${remainingCount} blog post(s) still missing a content_documents row (expected: equal to the skipped count above), ${remainingPartialCount} backfilled document(s) still missing live content_blocks (expected: 0).`)
}
