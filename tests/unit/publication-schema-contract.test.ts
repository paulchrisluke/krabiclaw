import assert from 'node:assert/strict'
import test from 'node:test'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { blog_posts, posts } from '../../server/db/schema.ts'

function checkSql(table: SQLiteTable, name: string) {
  const configured = getTableConfig(table).checks.find(check => check.name === name)
  assert.ok(configured, `${name} is missing`)
  return configured.value.queryChunks.map(chunk => 'value' in chunk ? chunk.value : '').join('')
}

test('current Drizzle schema exposes only final post and article states', () => {
  assert.equal(checkSql(posts, 'posts_status_check'), "status IN ('published', 'scheduled')")
  assert.equal(checkSql(blog_posts, 'blog_posts_status_check'), "status IN ('published', 'scheduled')")
})
