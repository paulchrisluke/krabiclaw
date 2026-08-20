import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildStagingReviewAuthSql, buildStagingReviewAuthVerificationSql, STAGING_REVIEW_AUTH } from '../../config/staging-review-auth.ts'
import { E2E_AUTH_FIXTURES } from '../../config/e2e-auth-fixtures.ts'

test('staging-review auth is separate and preserves credentials unless rotation is explicit', async () => {
  const resetScript = await readFile(new URL('../../scripts/reset-e2e-artifacts.ts', import.meta.url), 'utf8')
  const sql = buildStagingReviewAuthSql('hashed-password')
  const rotatedSql = buildStagingReviewAuthSql('new-hash', true)

  assert.equal(E2E_AUTH_FIXTURES.some(fixture => fixture.id === STAGING_REVIEW_AUTH.id), false)
  assert.match(resetScript, /'user-staging-review'/)
  assert.match(sql, /INSERT OR IGNORE INTO account/)
  assert.doesNotMatch(sql, /DELETE FROM session/)
  assert.doesNotMatch(sql, /DELETE FROM account/)
  assert.match(sql, /'editor'/)
  assert.match(sql, /WHERE id = 'site-pottery-house'/)
  assert.match(sql, /WHERE id = 'site-kikuzuki'/)
  assert.match(sql, /WHERE id = 'site-ncls-blawby'/)
  assert.match(rotatedSql, /DELETE FROM account/)
  assert.doesNotMatch(rotatedSql, /DELETE FROM session/)
  assert.match(buildStagingReviewAuthVerificationSql(), /teamMember/)
})
