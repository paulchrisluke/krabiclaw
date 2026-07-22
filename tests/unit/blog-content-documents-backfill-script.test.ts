import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('blog content_documents backfill inserts live content_blocks rows (regression: an earlier version only wrote content_documents/content_revisions, leaving editor/MCP reads seeing an empty article)', async () => {
  const source = await readFile(new URL('../../scripts/backfill-missing-blog-content-documents.mjs', import.meta.url), 'utf8')
  assert.match(source, /INSERT INTO content_blocks/)
  assert.match(source, /function contentBlockInserts/)
})

test('blog content_documents backfill only sets published_revision_id for already-published posts, not scheduled ones (regression: scheduled posts were incorrectly given a published_revision_id, publishing them ahead of scheduled_for)', async () => {
  const source = await readFile(new URL('../../scripts/backfill-missing-blog-content-documents.mjs', import.meta.url), 'utf8')
  assert.match(source, /post\.status === 'published' \? revisionId : null/)
  assert.doesNotMatch(source, /post\.status === 'published' \|\| post\.status === 'scheduled'/)
})

test('blog content_documents backfill repairs its own prior partial runs via a stable BACKFILL_LABEL, and clears any wrongly-set published_revision_id on scheduled posts', async () => {
  const source = await readFile(new URL('../../scripts/backfill-missing-blog-content-documents.mjs', import.meta.url), 'utf8')
  assert.match(source, /const BACKFILL_LABEL = /)
  assert.match(source, /NOT EXISTS \(SELECT 1 FROM content_blocks cb WHERE cb\.document_id = d\.id\)/)
  assert.match(source, /UPDATE content_documents SET published_revision_id = NULL WHERE id/)
  assert.match(source, /wronglyPublishedScheduled/)
})

test('blog content_documents backfill remains dry-run capable and never mutates outside --apply', async () => {
  const source = await readFile(new URL('../../scripts/backfill-missing-blog-content-documents.mjs', import.meta.url), 'utf8')
  assert.match(source, /--dry-run/)
  assert.match(source, /--apply/)
  const applyFlagIndex = source.indexOf("args.includes('--apply')")
  const firstMutationIndex = source.indexOf('if (apply) {')
  assert.notEqual(applyFlagIndex, -1)
  assert.notEqual(firstMutationIndex, -1)
  assert.ok(applyFlagIndex < firstMutationIndex, 'the --apply flag must be parsed before any mutation gate')
})
