import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../../server/utils/platform-content.ts', import.meta.url), 'utf8')
const start = source.indexOf('export async function updatePlatformBlogLifecycle')
const end = source.indexOf('export async function updatePlatformBlogPost', start)
const lifecycle = source.slice(start, end)

test('blog lifecycle preflights both current concurrency tokens', () => {
  assert.match(lifecycle, /p\.updated_at AS updated_at|SELECT p\.id, p\.updated_at/)
  assert.match(lifecycle, /d\.updated_at AS document_updated_at/)
  assert.match(lifecycle, /source\.updated_at !== input\.expected_updated_at/)
  assert.match(lifecycle, /source\.document_updated_at !== input\.expected_document_updated_at/)
})

test('publish, schedule, and unpublish mutate only lifecycle state', () => {
  assert.match(lifecycle, /status = 'scheduled'/)
  assert.match(lifecycle, /status = '\$\{input\.action === 'publish' \? 'published' : 'draft'\}'/)
  assert.match(lifecycle, /scheduled_for = NULL/)
  assert.match(lifecycle, /first_published_at = COALESCE/)
  assert.doesNotMatch(lifecycle, /content_revisions|draft_revision_id|published_revision_id|UPDATE content_documents/)
})

test('lifecycle writes use one D1 batch with a stale-write guard', () => {
  assert.match(lifecycle, /__blog_lifecycle_concurrency_guard__/)
  assert.match(lifecycle, /await executeBatch\(db, queries\)/)
  assert.doesNotMatch(lifecycle, /\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/)
})

test('scheduled publication requires a future timezone-qualified instant', () => {
  assert.match(lifecycle, /parseScheduledFor\(input\.scheduled_for\)/)
  assert.match(lifecycle, /scheduled_for must be in the future/)
})
