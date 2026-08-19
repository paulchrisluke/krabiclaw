import assert from 'node:assert/strict'
import test from 'node:test'

import { renderNclsFixtureSql } from '../../scripts/generate-ncls-seed.ts'

test('NCLS fixture seeds the production public dataset through the canonical page model', () => {
  const sql = renderNclsFixtureSql()

  assert.match(sql, /INSERT INTO tenant_page_variants/)
  assert.match(sql, /INSERT INTO content_documents/)
  assert.doesNotMatch(sql, /content_revisions|draft_revision_id|published_revision_id/)
  assert.doesNotMatch(sql, /tenant_navigation_items/)
  assert.match(sql, /INSERT INTO content_blocks/)
  assert.match(sql, /Access to Justice for All/)
  assert.match(sql, /North Carolina Legal Services/)
  assert.equal(sql.match(/INSERT INTO tenant_pages/g)?.length, 11)
  assert.equal(sql.match(/INSERT INTO tenant_page_variants/g)?.length, 11)
  assert.equal(sql.match(/INSERT INTO offerings/g)?.length, 6)
  assert.equal(sql.match(/INSERT INTO media_assets/g)?.length, 142)
  for (const path of ['/', '/about', '/contact', '/pricing', '/services']) {
    assert.ok(sql.includes(`'${path}'`), `missing page path ${path}`)
  }
  assert.match(sql, /'https:\/\/www\.northcarolinalegalservices\.org'/)
  assert.match(sql, /'ncls\.krabiclaw\.com'/)
  assert.match(sql, /'www\.northcarolinalegalservices\.org'/)
  assert.match(sql, /'northcarolinalegalservices\.org'/)
  assert.doesNotMatch(sql, /0762ea49-0bd2-4cc8-1044-d6c9b1f00100|ci_fixture|NCLS CI Owner|BEGIN|COMMIT/)
})
