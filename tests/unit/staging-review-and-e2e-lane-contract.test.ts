import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildStagingReviewAuthSql, STAGING_REVIEW_AUTH } from '../../config/staging-review-auth.ts'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('staging-review identity is separate from ephemeral E2E auth and preserves credentials', async () => {
  const fixtures = await repoFile('config/e2e-auth-fixtures.ts')
  const provisioner = await repoFile('scripts/provision-staging-review-auth.ts')
  const reset = await repoFile('scripts/reset-e2e-artifacts.ts')
  const sql = buildStagingReviewAuthSql('hashed-password')
  const rotatedSql = buildStagingReviewAuthSql('new-hash', true)

  assert.doesNotMatch(fixtures, new RegExp(STAGING_REVIEW_AUTH.id))
  assert.doesNotMatch(fixtures, new RegExp(STAGING_REVIEW_AUTH.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(provisioner, /process\.argv\.includes\('--staging'\)/)
  assert.match(provisioner, /STAGING_REVIEW_PASSWORD/)
  assert.match(provisioner, /--rotate-password/)
  assert.match(reset, new RegExp(`['"]${STAGING_REVIEW_AUTH.id}['"]`))
  assert.match(sql, /INSERT OR IGNORE INTO account/)
  assert.doesNotMatch(sql, /DELETE FROM session/)
  assert.doesNotMatch(sql, /DELETE FROM account/)
  assert.match(sql, /'editor'/)
  assert.match(sql, /WHERE id = 'site-pottery-house'/)
  assert.match(sql, /WHERE id = 'site-kikuzuki'/)
  assert.match(sql, /WHERE id = 'site-ncls-blawby'/)
  assert.match(rotatedSql, /DELETE FROM account/)
  assert.doesNotMatch(rotatedSql, /DELETE FROM session/)
})

test('E2E lane resources are unique and explicitly non-production', async () => {
  const lanes = JSON.parse(await repoFile('config/e2e-lanes.json')) as Array<Record<string, string>>
  const wrangler = await repoFile('wrangler.toml')

  assert.equal(lanes.length, 4)
  for (const field of ['name', 'databaseId', 'kvNamespaceId', 'bucketName', 'queueName', 'searchInstanceId']) {
    assert.equal(new Set(lanes.map(lane => lane[field])).size, lanes.length, `${field} must be unique per lane`)
  }
  for (const lane of lanes) {
    assert.match(wrangler, new RegExp(`\\[env\\."${lane.name}"\\]`))
    assert.match(wrangler, new RegExp(`AI_SEARCH_INSTANCE_ID = "${lane.searchInstanceId}"`))
    assert.match(wrangler, new RegExp(`database_id = "${lane.databaseId}"`))
    assert.ok(wrangler.includes('crons = []'))
  }
  assert.doesNotMatch(wrangler.slice(wrangler.indexOf('# BEGIN GENERATED E2E LANE ENVIRONMENTS')), /database_id = "0d0cd133-1914-48b1-b010-8fe574fede0c"/)
})
