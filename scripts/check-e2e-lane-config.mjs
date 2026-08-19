#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const lanes = JSON.parse(readFileSync(resolve(root, 'config/e2e-lanes.json'), 'utf8'))
const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const authFixtures = readFileSync(resolve(root, 'config/e2e-auth-fixtures.ts'), 'utf8')
const resetScript = readFileSync(resolve(root, 'scripts/reset-e2e-artifacts.ts'), 'utf8')
const reviewProvisioner = readFileSync(resolve(root, 'scripts/provision-staging-review-auth.ts'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(lanes.length === 4, `Expected four E2E lanes, found ${lanes.length}`)
const names = new Set(lanes.map(lane => lane.name))
const hostnames = new Set(lanes.map(lane => lane.hostname))
const databaseIds = new Set(lanes.map(lane => lane.databaseId))
const kvIds = new Set(lanes.map(lane => lane.kvNamespaceId))
const searchIds = new Set(lanes.map(lane => lane.searchInstanceId))
const searchNamespaces = new Set(lanes.map(lane => lane.searchInstanceId))
assert(names.size === lanes.length, 'E2E lane names must be unique')
assert(hostnames.size === lanes.length, 'E2E lane hostnames must be unique')
assert(databaseIds.size === lanes.length, 'E2E D1 IDs must be unique')
assert(kvIds.size === lanes.length, 'E2E KV IDs must be unique')
assert(searchIds.size === lanes.length, 'E2E AI Search instance IDs must be unique')
assert(searchNamespaces.size === lanes.length, 'E2E AI Search namespaces must be unique')

const generatedStart = wrangler.indexOf('# BEGIN GENERATED E2E LANE ENVIRONMENTS')
const generatedEnd = wrangler.indexOf('# END GENERATED E2E LANE ENVIRONMENTS')
assert(generatedStart >= 0 && generatedEnd > generatedStart, 'Generated E2E lane markers are required')
const generated = wrangler.slice(generatedStart, generatedEnd)

for (const lane of lanes) {
  assert(/^e2e-[1-4]$/.test(lane.name), `Unexpected E2E lane name: ${lane.name}`)
  assert(lane.hostname === `${lane.name}.krabiclaw.com`, `Unexpected hostname for ${lane.name}`)
  assert(/^[a-z0-9](?:[a-z0-9-]{0,26}[a-z0-9])?$/.test(lane.searchInstanceId), `AI Search namespace for ${lane.name} must be 1-28 lowercase alphanumeric or hyphen characters`)
  assert(!wrangler.includes(`[env.${lane.name}]`), `Lane ${lane.name} must use a quoted Wrangler environment key`)
  assert(wrangler.includes(`[env."${lane.name}"]`), `Missing Wrangler environment ${lane.name}`)
  for (const required of [
    `database_name = "${lane.databaseName}"`,
    `database_id = "${lane.databaseId}"`,
    `queue = "${lane.queueName}"`,
    `dead_letter_queue = "${lane.deadLetterQueueName}"`,
    `bucket_name = "${lane.bucketName}"`,
    `id = "${lane.kvNamespaceId}"`,
    `AI_SEARCH_NAMESPACE = "${lane.searchInstanceId}"`,
    `AI_SEARCH_INSTANCE_ID = "${lane.searchInstanceId}"`,
    `namespace = "${lane.searchInstanceId}"`,
    `*-${lane.name}.krabiclaw.com/*`,
    'crons = []',
  ]) assert(wrangler.includes(required), `Missing ${required} for ${lane.name}`)
}

for (const forbidden of [
  '0d0cd133-1914-48b1-b010-8fe574fede0c',
  'abda2264-f84f-4cc7-8483-930fe9fc288d',
  'b6e29548-155d-43ce-81ba-f6f6c5473069',
  '7fadf142e35745d6bec16b260eaab2f2',
  '69252567b9cd4becbd486a337ab1e589',
  '9e829557fd2b46dba4148f2ed27a5c0b',
]) {
  assert(!generated.includes(forbidden), `E2E lane configuration reuses protected resource ${forbidden}`)
}
for (const forbiddenLine of [
  'database_name = "krabiclaw-db"',
  'database_name = "krabiclaw-db-preview"',
  'database_name = "krabiclaw-db-staging"',
  'bucket_name = "krabiclaw-media"',
  'bucket_name = "krabiclaw-media-preview"',
  'bucket_name = "krabiclaw-media-staging"',
]) {
  const generatedLines = generated.split('\n').map(line => line.trim())
  assert(!generatedLines.includes(forbiddenLine), `E2E lane configuration reuses protected resource ${forbiddenLine}`)
}

assert(workflow.includes('fromJSON(needs.e2e-lane-plan.outputs.matrix)'), 'Release qualification must use the canonical lane matrix')
assert(workflow.includes('--shard=${{ matrix.shard }}/${{ matrix.total }}'), 'Release qualification must use Playwright sharding')
assert(workflow.includes('--workers=1'), 'Each E2E shard must run one Playwright worker')
assert(workflow.includes('release-qualification-e2e-${{ matrix.lane }}'), 'Each E2E lane must have a lane-specific concurrency lock')
assert(workflow.includes('queue: max'), 'E2E lane concurrency must retain queued required checks')
assert(workflow.includes('e2e-lane-smoke'), 'Pull requests to staging must run the two-lane E2E smoke')
assert(!authFixtures.includes('user-staging-review'), 'Durable staging-review identity must not be an E2E fixture')
assert(resetScript.includes("'user-staging-review'"), 'E2E artifact reset must explicitly protect the staging-review identity')
assert(reviewProvisioner.includes("process.argv.includes('--staging')"), 'Staging-review provisioning must require --staging')
assert(reviewProvisioner.includes('STAGING_REVIEW_PASSWORD'), 'Staging-review provisioning must use the shared secret input')

execFileSync(process.execPath, ['scripts/generate-e2e-wrangler-config.mjs', '--check'], { cwd: root, stdio: 'inherit' })
console.log(`E2E lane configuration passed for ${lanes.length} isolated environments.`)
