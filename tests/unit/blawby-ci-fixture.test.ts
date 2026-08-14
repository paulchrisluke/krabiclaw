import assert from 'node:assert/strict'
import test from 'node:test'

import { renderBlawbyCiFixtureSql } from '../../scripts/generate-blawby-ci-seed.ts'

test('Blawby CI fixture seeds the current canonical page model without the retired import path', () => {
  const sql = renderBlawbyCiFixtureSql()

  assert.match(sql, /INSERT INTO tenant_page_variants/)
  assert.match(sql, /INSERT INTO content_documents/)
  assert.match(sql, /INSERT INTO content_revisions/)
  assert.match(sql, /INSERT INTO content_blocks/)
  assert.match(sql, /"section":"hero"/)
  assert.match(sql, /North Carolina Legal Services/)
  assert.equal(sql.match(/INSERT INTO tenant_pages/g)?.length, 5)
  assert.equal(sql.match(/INSERT INTO tenant_page_variants/g)?.length, 5)
  for (const path of ['/', '/about', '/contact', '/pricing', '/services']) {
    assert.ok(sql.includes(`'${path}'`), `missing page path ${path}`)
  }
  assert.match(sql, /'https:\/\/www\.northcarolinalegalservices\.org'/)
  assert.match(sql, /'ncls\.krabiclaw\.com',\s*'subdomain', 'secondary'/)
  assert.match(sql, /'www\.northcarolinalegalservices\.org',\s*'custom', 'canonical'/)
  assert.match(sql, /'northcarolinalegalservices\.org',\s*'custom', 'secondary'/)
  assert.doesNotMatch(sql, /client-imports|ncls-blawby\.mjs|retry|BEGIN|COMMIT/)
})
