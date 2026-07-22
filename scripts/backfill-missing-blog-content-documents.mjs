#!/usr/bin/env -S node --experimental-strip-types
// One-time backfill for blog posts (platform and tenant) that predate the
// block-content system: they have blog_posts.body but no content_documents/
// content_revisions row, so get_platform_blog_post / getPublishedPlatformBlogPost
// / getPublishedSiteBlogPost 500 on read. Reuses the canonical
// markdownToContentBlocks() parser and mergeLegacyBlogComponents() merge
// logic from server/utils/content-documents.ts rather than hand-rolling
// block conversion or silently dropping legacy FAQ/How-To component rows.
//
// Usage: node scripts/backfill-missing-blog-content-documents.mjs --dry-run|--apply
// --apply is a deliberate, separate operator decision — never run
// automatically as part of a deploy or CI step.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { register } from 'node:module'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)
const { markdownToContentBlocks, mergeLegacyBlogComponents } = await import('../server/utils/content-documents.ts')

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

const posts = run(`
  SELECT p.id, p.slug, p.site_id, p.body, p.status
    FROM blog_posts p
    LEFT JOIN content_documents d
      ON d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
     AND d.owner_id = p.id
   WHERE d.id IS NULL
`)

if (!posts.length) {
  console.log('No blog posts are missing a content_documents row. Nothing to do.')
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

  const publishedRevisionId = post.status === 'published' || post.status === 'scheduled' ? revisionId : null

  // Batched into one wrangler invocation (one D1 HTTP request, all-or-nothing)
  // so a mid-post failure can't leave a content_documents row with no revision
  // — the discovery query's `d.id IS NULL` filter would otherwise skip that
  // post forever on rerun. D1 rejects raw BEGIN/COMMIT, so this relies on
  // wrangler's single --command batching rather than an explicit transaction.
  const statements = [
    `INSERT INTO content_documents (id, owner_type, owner_id, created_at, updated_at) VALUES (${q(docId)}, ${q(ownerType)}, ${q(post.id)}, ${q(now)}, ${q(now)})`,
    `INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, created_by, label, created_at) VALUES (${q(revisionId)}, ${q(docId)}, ${q(snapshotJson)}, ${q(post.body)}, NULL, ${q('Backfill: missing content_documents (2026-07-22 incident)')}, ${q(now)})`,
    // draft_revision_id is always set; published_revision_id only for a post
    // that was already published/scheduled — never silently publish a draft.
    `UPDATE content_documents SET draft_revision_id = ${q(revisionId)}, published_revision_id = ${q(publishedRevisionId)}, updated_at = ${q(now)} WHERE id = ${q(docId)}`,
  ]
  if (post.status === 'scheduled') {
    statements.push(`UPDATE blog_posts SET scheduled_revision_id = ${q(revisionId)} WHERE id = ${q(post.id)}`)
  }
  run(statements.join(';\n'))
  console.log(`  -> applied: content_documents=${docId} content_revisions=${revisionId}`)
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
  console.log(`\nVerification: ${remainingCount} blog post(s) still missing a content_documents row (expected: equal to the skipped count above).`)
}
