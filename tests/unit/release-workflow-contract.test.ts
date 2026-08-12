import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

type WorkflowStep = {
  name?: string
  run?: string
  env?: Record<string, string>
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

test('one CI workflow owns preview, staging, and production lifecycle gates', async () => {
  const document = await workflowDocument()
  const jobs = await workflowJobs()

  assert.deepEqual(document.on?.pull_request?.branches, ['main', 'staging'])
  assert.deepEqual(document.on?.push?.branches, ['main', 'staging'])
  assert.ok(jobs['e2e-representative'])
  assert.equal(jobs['e2e-staging']?.if, "github.event_name == 'push' && github.ref == 'refs/heads/staging'")
  assert.equal(jobs['deploy-production']?.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'")
})

test('each environment uses one normal Worker deploy followed by its browser gate', async () => {
  const jobs = await workflowJobs()

  assert.equal(
    stepRun(jobs['e2e-representative']!, 'Deploy preview Worker'),
    'npx wrangler deploy --env preview --old-asset-ttl 600 --strict',
  )
  assert.equal(
    stepRun(jobs['e2e-representative']!, 'Run required representative browser coverage'),
    'yarn test:e2e:representative',
  )

  const stagingMigrations = stepRun(jobs['e2e-staging']!, 'Apply staging migrations')
  assert.equal(stagingMigrations, 'npx wrangler d1 migrations apply DB --env staging --remote')
  assert.equal(
    stepRun(jobs['e2e-staging']!, 'Deploy staging Worker'),
    'npx wrangler deploy --env staging --old-asset-ttl 600 --strict',
  )
  assert.equal(stepRun(jobs['e2e-staging']!, 'Run full staging E2E suite'), 'yarn test:e2e:full')

  const productionMigrations = stepRun(jobs['deploy-production']!, 'Apply production migrations')
  assert.equal(productionMigrations, 'npx wrangler d1 migrations apply DB --remote')
  assert.equal(
    stepRun(jobs['deploy-production']!, 'Deploy production Worker'),
    'npx wrangler deploy --old-asset-ttl 600 --strict',
  )
  assert.equal(
    stepRun(jobs['deploy-production']!, 'Run read-only production browser smoke'),
    'yarn test:e2e:public-rendering',
  )
})

test('custom candidate and nightly release machinery is absent', async () => {
  const workflow = await repoFile('.github/workflows/ci.yml')
  const playwright = await repoFile('playwright.config.ts')
  const combined = `${workflow}\n${playwright}`

  for (const forbidden of [
    'wrangler versions upload',
    'wrangler versions deploy',
    'Cloudflare-Workers-Version-Overrides',
    'WORKER_VERSION_OVERRIDE',
    'candidate-manifest',
    'baseline_source_sha',
    'worker_version_id',
  ]) {
    assert.ok(!combined.includes(forbidden), `found obsolete release mechanism: ${forbidden}`)
  }

  for (const deleted of [
    '.github/workflows/ci-full.yml',
    '.github/workflows/e2e-full.yml',
    '.github/workflows/fixture.yml',
    '.github/workflows/preview-verify.yml',
    '.github/workflows/release-production.yml',
    '.github/workflows/rollback-production.yml',
    '.github/workflows/zaraz-ga-backfill.yml',
    'scripts/backfill-missing-blog-content-documents.mjs',
    'scripts/check-migration-safety.mjs',
    'scripts/verify-migration-state.mjs',
    'scripts/release-command-blocked.mjs',
    'scripts/rollback-prod.mjs',
    'scripts/wrangler-retry.ts',
    'scripts/zaraz-ga-backfill.mjs',
  ]) {
    await assert.rejects(access(new URL(`../../${deleted}`, import.meta.url)))
  }
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
