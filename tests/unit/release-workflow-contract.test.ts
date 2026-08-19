import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

type WorkflowStep = {
  name?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, string | boolean>
}

type WorkflowJob = {
  if?: string
  needs?: string[]
  env?: Record<string, string>
  steps?: WorkflowStep[]
}

type WorkflowDocument = {
  on?: {
    pull_request?: { branches?: string[] }
    push?: { branches?: string[] }
  }
  env?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

async function workflowDocument(): Promise<WorkflowDocument> {
  return parse(await repoFile('.github/workflows/ci.yml')) as WorkflowDocument
}

async function workflowJobs(): Promise<Record<string, WorkflowJob>> {
  const document = await workflowDocument()
  assert.ok(document.jobs)
  return document.jobs
}

function stepRun(job: WorkflowJob, name: string): string {
  const step = job.steps?.find(candidate => candidate.name === name)
  assert.ok(step?.run, `missing ${name}`)
  return step.run
}

function stepIndex(job: WorkflowJob, name: string): number {
  const index = job.steps?.findIndex(candidate => candidate.name === name) ?? -1
  assert.notEqual(index, -1, `missing ${name}`)
  return index
}

function tomlSection(source: string, name: string): string {
  const header = `[${name}]`
  const start = source.indexOf(header)
  assert.notEqual(start, -1, `missing ${header}`)
  const rest = source.slice(start + header.length)
  const nextHeader = rest.search(/\n\[/)
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader)
}

test('one CI workflow owns preview, staging, release-lane, and production lifecycle gates', async () => {
  const document = await workflowDocument()
  const jobs = await workflowJobs()

  assert.deepEqual(document.on?.pull_request?.branches, ['main', 'staging'])
  assert.deepEqual(document.on?.push?.branches, ['main', 'staging'])
  assert.ok(jobs['e2e-plan'])
  assert.ok(jobs['e2e-representative'])
  assert.ok(jobs['deploy-staging'])
  assert.match(jobs['deploy-staging']?.if || '', /github\.ref == 'refs\/heads\/staging'/)
  assert.match(jobs['e2e-lane-plan']?.if || '', /github\.base_ref == 'main'/)
  assert.match(jobs['e2e-release-qualification']?.if || '', /github\.head_ref == 'staging'/)
  assert.equal(jobs['deploy-production']?.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'")
})

test('staging fixture validation permits absent time slots but rejects malformed stored values', async () => {
  const provisioner = await repoFile('scripts/provision-staging-fixtures.ts')

  assert.match(provisioner, /e\.time_slots IS NOT NULL[\s\S]*json_valid\(e\.time_slots\)[\s\S]*json_type\(e\.time_slots\) != 'array'/)
})

test('each environment uses one normal Worker deploy before contract migrations and browser verification', async () => {
  const jobs = await workflowJobs()

  assert.equal(
    jobs['e2e-representative']?.env?.PLAYWRIGHT_PREVIEW_URL,
    'https://preview.krabiclaw.com',
  )

  assert.equal(
    stepRun(jobs['e2e-representative']!, 'Deploy preview Worker'),
    'npx wrangler deploy --env preview --strict',
  )
  assert.ok(stepIndex(jobs['e2e-representative']!, 'Deploy preview Worker') < stepIndex(jobs['e2e-representative']!, 'Migrate preview database'))
  assert.equal(
    stepRun(jobs['e2e-representative']!, 'Run core and affected preview browser coverage'),
    'yarn test:e2e:preview:selected',
  )

  const stagingMigrations = stepRun(jobs['deploy-staging']!, 'Apply staging migrations')
  assert.equal(stagingMigrations, 'npx wrangler d1 migrations apply DB --env staging --remote')
  assert.equal(
    stepRun(jobs['deploy-staging']!, 'Deploy staging Worker'),
    'npx wrangler deploy --env staging --strict',
  )
  assert.ok(stepIndex(jobs['deploy-staging']!, 'Deploy staging Worker') < stepIndex(jobs['deploy-staging']!, 'Apply staging migrations'))
  assert.equal(
    stepRun(jobs['deploy-staging']!, 'Provision deterministic staging fixtures'),
    'node --experimental-strip-types scripts/provision-staging-fixtures.ts --staging',
  )
  assert.ok(stepIndex(jobs['deploy-staging']!, 'Provision deterministic staging fixtures') < stepIndex(jobs['deploy-staging']!, 'Provision durable staging-review identity'))

  const release = jobs['e2e-release-qualification']!
  assert.equal(release.steps?.find(step => step.name === 'Deploy exact Worker artifact')?.run, 'npx wrangler deploy --env "${{ matrix.lane }}" --strict')
  assert.equal(release.steps?.find(step => step.name === 'Apply lane migrations')?.run, 'npx wrangler d1 migrations apply DB --env "${{ matrix.lane }}" --remote')
  assert.equal(release.steps?.find(step => step.name === 'Sweep lane E2E artifacts')?.run, 'node --experimental-strip-types scripts/reset-e2e-artifacts.ts --env "${{ matrix.lane }}" --older-than-hours=0')
  assert.equal(release.steps?.find(step => step.name === 'Run Playwright release shard')?.run, 'yarn test:e2e:full --shard=${{ matrix.shard }}/${{ matrix.total }} --workers=1')
  assert.equal(release.steps?.find(step => step.name === 'Run full staging release qualification'), undefined)

  const productionMigrations = stepRun(jobs['deploy-production']!, 'Apply production migrations')
  assert.equal(productionMigrations, 'npx wrangler d1 migrations apply DB --remote')
  assert.equal(
    stepRun(jobs['deploy-production']!, 'Deploy production Worker'),
    'npx wrangler deploy --strict',
  )
  assert.ok(stepIndex(jobs['deploy-production']!, 'Deploy production Worker') < stepIndex(jobs['deploy-production']!, 'Apply production migrations'))
  assert.equal(
    stepRun(jobs['deploy-production']!, 'Run read-only production browser smoke'),
    'yarn test:e2e:public-rendering',
  )
})

test('preview and staging route direct first-level tenant aliases to their Workers', async () => {
  const wrangler = await repoFile('wrangler.toml')
  const preview = tomlSection(wrangler, 'env.preview')
  const staging = tomlSection(wrangler, 'env.staging')

  assert.match(preview, /pattern = "\*-preview\.krabiclaw\.com\/\*"/)
  assert.match(staging, /pattern = "\*-staging\.krabiclaw\.com\/\*"/)
})

test('preview core protects authenticated hydration and Pages manager regressions', async () => {
  const packageDocument = JSON.parse(await repoFile('package.json')) as {
    scripts?: Record<string, string>
  }
  const core = packageDocument.scripts?.['test:e2e:preview:core'] || ''

  assert.match(core, /tests\/e2e\/smoke\.spec\.ts/)
  assert.match(core, /tests\/e2e\/dashboard-api\.spec\.ts/)
  assert.match(core, /Pages manager runs one typed-block and custom-page lifecycle tracer journey/)
  assert.match(core, /owner can send a reservation email reply from the deep-linked dashboard inbox/)
  assert.equal(packageDocument.scripts?.['test:e2e:representative'], 'yarn test:e2e:preview:core')
})

test('Cloudflare credentials stay scoped to mutation steps', async () => {
  const document = await workflowDocument()
  assert.equal(document.env?.CLOUDFLARE_API_TOKEN, undefined)
  assert.equal(document.env?.CLOUDFLARE_ACCOUNT_ID, undefined)
  const jobs = await workflowJobs()
  for (const [jobName, job] of Object.entries(jobs)) {
    assert.equal(job.env?.CLOUDFLARE_API_TOKEN, undefined, `${jobName} has a job-level API token`)
    assert.equal(job.env?.CLOUDFLARE_ACCOUNT_ID, undefined, `${jobName} has a job-level account id`)
  }
})

test('Worker egress uses Cloudflare strict-public fetch for CIMD resolution', async () => {
  const wrangler = await repoFile('wrangler.toml')
  assert.match(
    wrangler,
    /^compatibility_flags = \["nodejs_compat_v2", "global_fetch_strictly_public"\]$/m,
  )
})

test('Worker execution is smart-placed near the regional databases', async () => {
  const wrangler = await repoFile('wrangler.toml')
  const placement = tomlSection(wrangler, 'placement')

  assert.match(placement, /^\s*mode = "smart"\s*$/)
})

test('staging OAuth smoke exercises CIMD without restoring dynamic registration', async () => {
  const smoke = await repoFile('scripts/test-mcp-oauth.mjs')
  assert.match(smoke, /client_id_metadata_document_supported === true/)
  assert.match(smoke, /process\.env\.MCP_CIMD_CLIENT_URL/)
  assert.match(smoke, /CIMD \+ PKCE auth flow/)
  assert.doesNotMatch(smoke, /\/api\/auth\/oauth2\/register|Dynamic client registration|DCR \+ PKCE/)
})

test('every deployed Worker environment has its canonical media delivery URL', async () => {
  const wrangler = await repoFile('wrangler.toml')
  assert.match(tomlSection(wrangler, 'vars'), /MEDIA_BASE_URL = "https:\/\/media\.krabiclaw\.com"/)
  assert.match(tomlSection(wrangler, 'env.preview.vars'), /MEDIA_BASE_URL = "https:\/\/preview\.krabiclaw\.com\/__media"/)
  assert.match(tomlSection(wrangler, 'env.staging.vars'), /MEDIA_BASE_URL = "https:\/\/staging\.krabiclaw\.com\/__media"/)
})
