import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildStagingReviewAuthSql, buildStagingReviewAuthVerificationSql } from '../../config/staging-review-auth.ts'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('staging-review identity is separate from ephemeral E2E auth and preserves credentials', async () => {
  const workflow = await repoFile('.github/workflows/ci.yml')
  const sql = buildStagingReviewAuthSql('hashed-password')
  const rotatedSql = buildStagingReviewAuthSql('new-hash', true)

  assert.match(sql, /INSERT OR IGNORE INTO account/)
  assert.doesNotMatch(sql, /DELETE FROM session/)
  assert.doesNotMatch(sql, /DELETE FROM account/)
  assert.match(sql, /'editor'/)
  assert.match(sql, /WHERE id = 'site-pottery-house'/)
  assert.match(sql, /WHERE id = 'site-kikuzuki'/)
  assert.match(sql, /WHERE id = 'site-ncls-blawby'/)
  assert.match(rotatedSql, /DELETE FROM account/)
  assert.doesNotMatch(rotatedSql, /DELETE FROM session/)
  assert.ok(buildStagingReviewAuthVerificationSql().includes('teamMember'))
  assert.match(workflow, /environment: staging/)
  assert.match(workflow, /Verify durable staging-review provisioning is idempotent/)
})
