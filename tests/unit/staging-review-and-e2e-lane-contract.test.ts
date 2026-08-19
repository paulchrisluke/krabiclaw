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

test('E2E lane resources are unique and explicitly non-production', async () => {
  const lanes = JSON.parse(await repoFile('config/e2e-lanes.json')) as Array<Record<string, string>>
  const wrangler = await repoFile('wrangler.toml')

  assert.equal(lanes.length, 4)
  for (const field of ['name', 'databaseId', 'kvNamespaceId', 'bucketName', 'queueName', 'searchInstanceId']) {
    assert.equal(new Set(lanes.map(lane => lane[field])).size, lanes.length, `${field} must be unique per lane`)
  }
  for (const lane of lanes) {
    assert.match(wrangler, new RegExp(`\\[env\\."${lane.name}"\\]`))
    const start = wrangler.indexOf(`[env."${lane.name}"]`)
    const end = wrangler.indexOf(`[env."${lanes[lanes.indexOf(lane) + 1]?.name ?? 'missing'}"]`, start + 1)
    assert.ok(start >= 0)
    const block = wrangler.slice(start, end >= 0 ? end : wrangler.indexOf('# END GENERATED E2E LANE ENVIRONMENTS'))
    assert.ok(block.includes(`AI_SEARCH_INSTANCE_ID = "${lane.searchInstanceId}"`))
    assert.ok(block.includes(`AI_SEARCH_NAMESPACE = "${lane.searchInstanceId}"`))
    assert.ok(block.includes(`namespace = "${lane.searchInstanceId}"`))
    assert.ok(block.includes(`database_id = "${lane.databaseId}"`))
    assert.ok(block.includes(`pattern = "*-${lane.name}.krabiclaw.com/*"`))
    assert.ok(block.includes('crons = []'))
  }
  const generatedStart = wrangler.indexOf('# BEGIN GENERATED E2E LANE ENVIRONMENTS')
  assert.ok(generatedStart >= 0)
  assert.doesNotMatch(wrangler.slice(generatedStart), /database_id = "0d0cd133-1914-48b1-b010-8fe574fede0c"/)
})
