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
  assert.match(source, /p\.scheduled_revision_id = \?/)
  assert.match(source, /scheduled_revision_id = \?`/)
  assert.match(source, /results\[1\]\?\.meta\?\.changes/)
})

test('scheduled_for alone transitions posts to scheduled and pins the current draft revision', async () => {
  const source = await readFile(new URL('../../server/utils/platform-content.ts', import.meta.url), 'utf8')
  assert.match(source, /else if \(input\.scheduled_for !== undefined && !input\.publish\) \{[\s\S]*updates\.push\('scheduled_for = \?', 'published_at = NULL', "status = 'scheduled'"\)/)
  assert.match(source, /if \(!scheduledDocument\?\.document\.draft_revision_id\) badRequest\('Cannot schedule a post without a draft content revision'\)/)
  assert.match(source, /updates\.push\('scheduled_revision_id = \?'\)[\s\S]*params\.push\(scheduledDocument\.document\.draft_revision_id\)/)
  assert.match(source, /if \(scheduledFor && \(input\.publish \|\| input\.scheduled_for !== undefined\)\) \{[\s\S]*UPDATE blog_posts SET scheduled_revision_id = \(/)
})
