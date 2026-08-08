import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

type WorkflowJob = {
  if?: string
  needs?: string | string[]
  environment?: { name?: string } | string
  permissions?: Record<string, string>
  steps?: Array<{ name?: string; run?: string }>
}

async function workflowJobs(path: string): Promise<Record<string, WorkflowJob>> {
  const document = parse(await repoFile(path)) as { jobs?: Record<string, WorkflowJob> }
  assert.ok(document.jobs && typeof document.jobs === 'object', `${path} must define jobs`)
  return document.jobs
}

function runScript(job: WorkflowJob, label: string): string {
  const step = job.steps?.find(candidate => candidate.name === label)
  assert.ok(step?.run, `missing run step: ${label}`)
  return step.run
}

function shellFunction(script: string, name: string): string {
  const start = script.indexOf(`${name}() {`)
  assert.ok(start >= 0, `missing shell function: ${name}`)
  const end = script.indexOf('\n}', start)
  assert.ok(end > start, `unterminated shell function: ${name}`)
  return script.slice(start, end)
}

function assertRestoreOrdering(script: string, originPattern: RegExp, label: string): void {
  const restore = shellFunction(script, 'restore_baseline')
  const deploy = restore.indexOf('versions deploy')
  const status = restore.indexOf('wrangler deployments status')
  const verify = restore.indexOf('active.length!==1')
  const purge = restore.indexOf('purge-deployment-cache.ts')
  const markRestored = restore.indexOf('RESTORED_BASELINE="true"')
  assert.ok(deploy >= 0, `${label}: restore must deploy the baseline first`)
  assert.ok(status > deploy, `${label}: deployment status must follow baseline deploy`)
  assert.ok(verify > status, `${label}: baseline/candidate traffic must be verified after status capture`)
  assert.ok(purge > verify, `${label}: cache purge must follow deployment verification`)
  assert.ok(markRestored > purge, `${label}: restored state must follow cache purge`)
  assert.match(restore, /candidate&&traffic\(candidate\)!==0/)
  assert.match(restore, /if ! npx wrangler versions deploy/)
  assert.match(restore, /if ! npx wrangler deployments status/)
  assert.match(restore, /if ! node -e/)
  assert.match(restore, new RegExp(`if ! DEPLOYMENT_CACHE_ORIGIN=${originPattern.source} node --experimental-strip-types scripts/purge-deployment-cache\\.ts`))
  assert.match(restore, /RESTORE_INTERVENTION_REQUIRED="true"[\s\S]*return 1/)
  assert.match(restore, /RESTORED_BASELINE="true"[\s\S]*SPLIT_ACTIVE="false"/)
}

test('required CI checks out the immutable event SHA and never mutates shared staging or production', async () => {
  const source = await repoFile('.github/workflows/ci.yml')
  const checkoutCount = (source.match(/uses: actions\/checkout@/g) ?? []).length
  const exactShaCount = (source.match(/ref: \$\{\{ github\.sha \}\}/g) ?? []).length

  assert.ok(checkoutCount > 0, 'CI must have at least one checkout')
  assert.equal(exactShaCount, checkoutCount, 'every CI checkout must pin github.sha')
  assert.doesNotMatch(source, /ref:\s*staging/)
  assert.doesNotMatch(source, /shared-staging-deployment/)
  assert.doesNotMatch(source, /migrate:staging|deploy:staging:worker/)
  assert.doesNotMatch(source, /prod-deploy|migrate:prod|deploy:prod:worker/)
  for (const coverage of [
    'test:e2e:dashboard:smoke',
    'test:e2e:blawby-cms:smoke',
    'test:e2e:smoke:billing',
    'test:e2e:links-page',
  ]) assert.ok(source.includes(coverage), `missing required coverage: ${coverage}`)
  assert.match(source, /production-build-\$\{\{ github\.sha \}\}[\s\S]*include-hidden-files:\s*true/)
  assert.match(source, /playwright install --with-deps chromium/)
})

test('full lane keeps one uninterrupted staging candidate lock and gates candidate promotion', async () => {
  const source = await repoFile('.github/workflows/ci-full.yml')

  assert.match(source, /workflow_dispatch:[\s\S]*baseline_source_sha:/)
  assert.match(source, /shared-staging-candidate/)
  assert.match(source, /candidate:[\s\S]*if:\s*github\.event_name == ['"]workflow_dispatch['"]/)
  assert.match(source, /candidate:[\s\S]*needs:\s*\[typecheck-full, test-full, build-production\]/)
  assert.match(source, /candidate:[\s\S]*ref: \$\{\{ github\.sha \}\}/)
  assert.doesNotMatch(source, /ref:\s*staging/)

  assert.match(source, /versions deploy[\s\S]*@100[\s\S]*@0/)
  assert.match(source, /versions upload[\s\S]*--tag \"\$GITHUB_SHA\"/)
  assert.equal((source.match(/wrangler versions upload/g) ?? []).length, 1)
  assert.doesNotMatch(source, /wrangler secret put|--no-bundle/)
  assert.match(source, /--version-override \"\$CANDIDATE_VERSION_ID\"/)
  assert.match(source, /--samples 25[\s\S]*--run-label baseline/)
  assert.match(source, /--samples 25[\s\S]*--run-label candidate/)
  assert.match(source, /compare-performance-recovery\.mjs/)
  assert.match(source, /test:e2e:full/)
  assert.match(source, /detect_candidate_deployment/)
  assert.match(source, /restore_baseline/)
  assert.match(source, /DEPLOYMENT_CACHE_ORIGIN=\"\$STAGING_BASE_URL\"/)
  assert.match(source, /candidate-playwright-report\/index\.html/)
  assert.match(source, /deployed-playwright-report\/index\.html/)
  assert.match(source, /if:\s*always\(\)/)
  assert.match(source, /upload-artifact@[\w-]+[\s\S]*candidate-manifest\.json/)
  assert.match(source, /include-hidden-files:\s*true/)
})

test('staging rollback verifies baseline traffic and purges cache before claiming restoration', async () => {
  const jobs = await workflowJobs('.github/workflows/ci-full.yml')
  const source = runScript(jobs.candidate!, 'Prepare, verify, benchmark, and promote candidate')
  assertRestoreOrdering(source, /"\$STAGING_BASE_URL"/, 'staging')
  assert.match(source, /restore:\s*\{[\s\S]*status:[\s\S]*intervention_required/)
  assert.match(source, /splitActive: process\.env\.SPLIT_ACTIVE === 'true'/)
})

test('direct shared-environment deploys fail closed and comparative validation is explicit', async () => {
  const packageSource = await repoFile('package.json')

  assert.doesNotMatch(packageSource, /Deploy failed, retrying once/)
  assert.match(packageSource, /"deploy:preview:worker":\s*"wrangler deploy[^"\n]*--strict/)
  for (const command of ['deploy', 'deploy:staging', 'deploy:staging:worker', 'deploy:prod:worker']) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(packageSource, new RegExp(`"${escaped}":\\s*"node scripts/release-command-blocked\\.mjs`))
  }
  assert.match(packageSource, /"benchmark:performance:recovery":\s*"node scripts\/benchmark-performance-recovery\.mjs/)
  assert.match(packageSource, /"compare:performance:recovery":\s*"node scripts\/compare-performance-recovery\.mjs/)
})

test('production release requires a separate attested dispatch after read-only preflight', async () => {
  const source = await repoFile('.github/workflows/release-production.yml')

  assert.match(source, /^on:\n {2}workflow_dispatch:/m)
  assert.doesNotMatch(source, /^ {2}push:/m)
  assert.match(source, /candidate-manifest/)
  assert.match(source, /verify-deployed-candidate\.mjs/)
  assert.match(source, /wrangler deploy --dry-run|migrate:check/)
  assert.match(source, /environment:\s*\n\s+name:\s*production/)
  assert.match(source, /operation:[\s\S]*preflight[\s\S]*deploy/)
  assert.match(source, /preflight:[\s\S]*if:\s*inputs\.operation == 'preflight'/)
  assert.match(source, /deploy-production:[\s\S]*if:\s*inputs\.operation == 'deploy'/)
  assert.doesNotMatch(source, /deploy-production:[\s\S]{0,200}needs:\s*\[preflight\]/)
  assert.match(source, /PREFLIGHT_RUN_ID/)
  assert.match(source, /gh run view[\s\S]*\.workflowName == "Production release \(manifest-gated\)"/)
  assert.match(source, /gh run download[\s\S]*approved-staging-evidence-\$SOURCE_SHA/)
  assert.match(source, /GITHUB_STEP_SUMMARY/)
  assert.match(source, /production-migrations-before/)
  assert.match(source, /treeSha256/)
  assert.match(source, /\.migrations\.after\.files \| length/)
  assert.match(source, /migrate:prod/)
  assert.match(source, /wrangler versions upload --tag \"\$SOURCE_SHA\"/)
  assert.equal((source.match(/wrangler versions upload/g) ?? []).length, 1)
  assert.match(source, /detect_candidate_deployment/)
  assert.match(source, /DEPLOYMENT_CACHE_ORIGIN=https:\/\/krabiclaw\.com/)
  assert.ok((source.match(/public-surfaces-release\.spec\.ts/g) ?? []).length >= 2)
  assert.match(source, /include-hidden-files:\s*true/)
  assert.doesNotMatch(source, /E2E_ALLOW_DEV_ROUTES|E2E_DEV_ROUTE_SECRET|STRIPE_SECRET_KEY_TEST|BETTER_AUTH_SECRET/)
  assert.doesNotMatch(source, /wrangler secret put|--no-bundle/)
})

test('production release checks the exact protected Environment before every mutation', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const environmentPreflight = jobs['production-environment-preflight']
  assert.ok(environmentPreflight)
  assert.equal(environmentPreflight.environment, undefined)
  assert.equal(environmentPreflight.permissions?.actions, 'read')
  assert.equal(environmentPreflight.permissions?.contents, 'read')
  assert.match(environmentPreflight.if ?? '', /inputs\.operation == 'preflight'/)
  assert.match(environmentPreflight.if ?? '', /inputs\.operation == 'deploy'/)
  const protectionScript = runScript(environmentPreflight, 'Require the protected production Environment')
  assert.match(protectionScript, /\/environments\/production/)
  assert.match(protectionScript, /http_status/)
  assert.match(protectionScript, /http_status.*200/)
  assert.match(protectionScript, /protection_rules/)
  assert.match(protectionScript, /required_reviewers/)
  assert.match(protectionScript, /reviewers/)
  assert.doesNotMatch(protectionScript, /\b(?:POST|PUT|PATCH|DELETE)\b/)

  assert.deepEqual(jobs.preflight?.needs, ['production-environment-preflight'])
  assert.deepEqual(jobs['deploy-production']?.needs, ['production-environment-preflight'])
  assert.equal((jobs['deploy-production']?.environment as { name?: string })?.name, 'production')
  assert.match(jobs['deploy-production']?.if ?? '', /needs\.production-environment-preflight\.result == 'success'/)
})

test('production rollback verifies baseline traffic and purges cache before claiming restoration', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const source = runScript(jobs['deploy-production']!, 'Capture baseline, migrate, roll out, verify, and promote')
  assertRestoreOrdering(source, /https:\/\/krabiclaw\.com/, 'production')
  assert.match(source, /restore:\{[\s\S]*status:[\s\S]*intervention_required/)
  assert.match(source, /splitActive:process\.env\.SPLIT_ACTIVE==='true'/)
})

test('nightly browser telemetry is pinned to one retained build and cannot mutate an environment', async () => {
  const source = await repoFile('.github/workflows/e2e-full.yml')

  assert.match(source, /ref: \$\{\{ inputs\.source_sha \|\| vars\.NIGHTLY_SOURCE_SHA \}\}/)
  assert.match(source, /NIGHTLY_ARTIFACT_RUN_ID/)
  assert.match(source, /gh run view[\s\S]*\.headSha == \$sha/)
  assert.match(source, /gh run download[\s\S]*production-build-\$NIGHTLY_SOURCE_SHA/)
  assert.match(source, /verify-deployed-candidate\.mjs[\s\S]*--version-override \"\$NIGHTLY_WORKER_VERSION_ID\"/)
  assert.match(source, /public-surfaces-desktop[\s\S]*public-surfaces-mobile/)
  assert.doesNotMatch(source, /canary:status|migrate:(?:prod|staging)|wrangler d1|wrangler (?:deploy|versions)|yarn seed/)
})

test('candidate contract documents separate landed, deployed, and verified states', async () => {
  const source = await repoFile('docs/operations/release-candidate-contract.md')

  for (const phrase of [
    'immutable source SHA',
    'Worker version',
    'applied and pending migrations',
    'candidate-manifest.json',
    'browser evidence',
    'baseline 100%',
    'candidate 0%',
    'restore baseline',
    'landed',
    'deployed',
    'verified',
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase)
  }
})
