import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('0054 pins existing scheduled posts to their canonical draft and rejects unresolved rows', async () => {
  const sql = await readFile(new URL('../../migrations/0054_amusing_speed.sql', import.meta.url), 'utf8')
  assert.match(sql, /WHEN "status" = 'scheduled' THEN \(SELECT r\."id"/)
  assert.match(sql, /JOIN "content_revisions" r ON r\."id" = d\."draft_revision_id"/)
  assert.match(sql, /d\."owner_type" = CASE WHEN "blog_posts"\."site_id" IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END/)
  assert.match(sql, /WHERE "status" = 'scheduled' AND "scheduled_revision_id" IS NULL/)
})

test('scheduled publishing reports missing or dangling pinned revisions', async () => {
  const source = await readFile(new URL('../../server/utils/blog-publishing.ts', import.meta.url), 'utf8')
  assert.match(source, /p\.scheduled_revision_id IS NULL OR r\.id IS NULL/)
  assert.match(source, /scheduled_revision_issues/)
})
