import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { NCLS_ARTICLE_SLUGS } from '../../scripts/blawby-parity-config.mjs'

const repoFile = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

type WorkflowJob = {
  if?: string
  needs?: string | string[]
  environment?: { name?: string } | string
  permissions?: Record<string, string>
  steps?: Array<{ name?: string; id?: string; if?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }>
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
  assert.match(restore, /candidate&&candidate\.traffic!==0/)
  assert.match(restore, /uuid=\/\^\[0-9a-f\]/)
  assert.match(restore, /Math\.abs\(total-100\)>0\.001/)
  assert.match(restore, /if ! npx wrangler versions deploy/)
  assert.match(restore, /if ! npx wrangler deployments status/)
  assert.match(restore, /if ! node -e/)
  assert.match(restore, new RegExp(`if ! DEPLOYMENT_CACHE_ORIGIN=${originPattern.source} node --experimental-strip-types scripts/purge-deployment-cache\\.ts`))
  assert.match(restore, /RESTORE_INTERVENTION_REQUIRED="true"[\s\S]*return 1/)
  assert.match(restore, /RESTORED_BASELINE="true"[\s\S]*SPLIT_ACTIVE="false"/)
}

function assertFailClosedStatusDetection(script: string, label: string): void {
  const detect = shellFunction(script, 'detect_candidate_deployment')
  assert.match(detect, /if ! npx wrangler deployments status/)
  assert.match(detect, /rows\.filter\(v=>v\.traffic>0\)\.length!==1/)
  assert.match(detect, /SPLIT_ACTIVE="true"[\s\S]*RESTORE_INTERVENTION_REQUIRED="true"/)
  assert.match(detect, /status did not prove the candidate state[\s\S]*SPLIT_ACTIVE="true"/)
  assert.match(detect, /if \[\[ -z "\$BASELINE_VERSION_ID" \]\][\s\S]*RESTORE_INTERVENTION_REQUIRED="true"/)
  assert.match(script, /detect_candidate_deployment \|\| true[\s\S]*restore_baseline \|\| true/)
  assert.match(script, /traffic state is unknown; forcing baseline restoration|traffic state is unknown; forcing baseline restoration/i, label)
}

function assertManifestFailureRestoresAfterTrafficMutation(script: string, label: string): void {
  const onExit = shellFunction(script, 'on_exit')
  const manifestFailure = onExit.indexOf('manifest generation failed')
  const restoreGate = onExit.indexOf('TRAFFIC_MUTATION_ATTEMPTED" == "true" && "$ROLLBACK_HANDLED" != "true"')
  const detect = onExit.indexOf('detect_candidate_deployment || true', restoreGate)
  const restore = onExit.indexOf('restore_baseline || true', detect)
  const rewrite = onExit.indexOf('if ! write_manifest "$exit_status"', restore)
  assert.ok(manifestFailure >= 0, `${label}: manifest serialization failure must be explicit`)
  assert.ok(restoreGate > manifestFailure, `${label}: manifest failure must gate restoration on traffic mutation`)
  assert.ok(detect > restoreGate, `${label}: manifest failure must detect traffic before restoring`)
  assert.ok(restore > detect, `${label}: manifest failure must restore exact baseline after detection`)
  assert.ok(rewrite > restore, `${label}: failed manifest must be rewritten after restoration`)
  assert.match(onExit, /ROLLBACK_HANDLED="true"/)
}

function assertCandidateOverrideReadiness(script: string, label: string): void {
  const split = script.indexOf('BASELINE_VERSION_ID@100" "$CANDIDATE_VERSION_ID@0')
  const splitStatus = script.indexOf('"$split_status" "$BASELINE_VERSION_ID" "$CANDIDATE_VERSION_ID"', split)
  const override = script.indexOf('export WORKER_VERSION_OVERRIDE="$CANDIDATE_VERSION_ID"', splitStatus)
  const readiness = script.indexOf('node scripts/wait-for-deployed-assets.mjs', override)
  const verifier = script.indexOf('node scripts/verify-deployed-candidate.mjs', readiness)
  const promotion = script.indexOf('"$CANDIDATE_VERSION_ID@100"', verifier)

  assert.ok(split >= 0, `${label}: candidate split deployment must be present`)
  assert.ok(splitStatus > split, `${label}: split traffic must be proven before readiness checks`)
  assert.ok(override > splitStatus, `${label}: candidate override must be exported after split proof`)
  assert.ok(readiness > override, `${label}: bounded candidate readiness must use the version override`)
  assert.ok(verifier > readiness, `${label}: strict candidate verification must follow readiness`)
  assert.ok(promotion > verifier, `${label}: candidate promotion must follow strict verification`)
}

function assertPromotedCandidateReadiness(script: string, label: string): void {
  const promotion = script.indexOf('"$CANDIDATE_VERSION_ID@100"')
  const promotedStatus = script.indexOf('"$deployed_status" "$CANDIDATE_VERSION_ID"', promotion)
  const unpin = script.indexOf('unset WORKER_VERSION_OVERRIDE', promotedStatus)
  const expectedVersion = script.indexOf('DEPLOYMENT_EXPECTED_WORKER_VERSION="$CANDIDATE_VERSION_ID"', unpin)
  const readiness = script.indexOf('node scripts/wait-for-deployed-assets.mjs', expectedVersion)
  const verifier = script.indexOf('node scripts/verify-deployed-candidate.mjs', readiness)

  assert.ok(promotion >= 0, `${label}: candidate promotion must be present`)
  assert.ok(promotedStatus > promotion, `${label}: promoted traffic must be proven before readiness checks`)
  assert.ok(unpin > promotedStatus, `${label}: promoted readiness must not use a version override`)
  assert.ok(expectedVersion > unpin, `${label}: promoted readiness must require the candidate version`)
  assert.ok(readiness > expectedVersion, `${label}: promoted route propagation must be bounded`)
  assert.ok(verifier > readiness, `${label}: deployed verification must follow promoted readiness`)
}

test('required CI checks out the immutable event SHA and never mutates shared staging or production', async () => {
  const source = await repoFile('.github/workflows/ci.yml')
  const deployedAssetWait = await repoFile('scripts/wait-for-deployed-assets.mjs')
  const packageJson = JSON.parse(await repoFile('package.json')) as { scripts?: Record<string, string> }
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
  ]) {
    assert.ok(source.includes(coverage), `missing required coverage: ${coverage}`)
    assert.ok(packageJson.scripts?.[coverage], `required CI coverage script is undefined: ${coverage}`)
  }
  assert.match(source, /production-build-\$\{\{ github\.sha \}\}[\s\S]*include-hidden-files:\s*true/)
  assert.match(source, /playwright install --with-deps chromium/)
  assert.match(source, /WORKER_NAME:\s*krabiclaw-preview/)
  assert.match(source, /DEPLOYMENT_IDENTITY_ORIGIN:\s*https:\/\/preview\.krabiclaw\.com/)
  assert.match(source, /WORKER_VERSION_OVERRIDE=\$PREVIEW_VERSION_ID/)
  assert.match(source, /--version-override "\$PREVIEW_VERSION_ID"/)
  const previewMigrationStep = source.indexOf('name: Migrate preview database')
  const migrationHistoryRead = source.indexOf('SELECT id, name, applied_at FROM d1_migrations ORDER BY id', previewMigrationStep)
  const migrationPrefixCheck = source.indexOf('scripts/verify-migration-state.mjs', migrationHistoryRead)
  const pendingMigrationRead = source.indexOf('wrangler d1 migrations list DB --env preview --remote', migrationPrefixCheck)
  const compatibilityCheck = source.indexOf('scripts/check-migration-safety.mjs --backward-compatible', pendingMigrationRead)
  const migrationApply = source.indexOf('wrangler d1 migrations apply DB --env preview --remote', compatibilityCheck)
  assert.ok(previewMigrationStep >= 0, 'required CI must define a preview migration step')
  assert.ok(migrationHistoryRead > previewMigrationStep, 'preview migration history must be captured before mutation')
  assert.ok(migrationPrefixCheck > migrationHistoryRead, 'preview migration history must be an exact local prefix')
  assert.match(source.slice(migrationPrefixCheck, pendingMigrationRead), /--lineage-marker 0108_reconcile_drizzle_migration_history\.sql/)
  assert.ok(pendingMigrationRead > migrationPrefixCheck, 'pending preview migrations must be listed after history validation')
  assert.ok(compatibilityCheck > pendingMigrationRead, 'pending preview migrations must be checked for backward compatibility')
  assert.ok(migrationApply > compatibilityCheck, 'preview migration apply must follow every read-only migration guard')
  assert.match(deployedAssetWait, /createWorkerVersionOverrideHeaders/)
  assert.match(deployedAssetWait, /WORKER_VERSION_OVERRIDE/)
  assert.match(deployedAssetWait, /DEPLOYMENT_EXPECTED_SOURCE_SHA/)
  assert.match(deployedAssetWait, /DEPLOYMENT_EXPECTED_WORKER_VERSION/)
  assert.match(deployedAssetWait, /WORKER_NAME/)
  assert.match(deployedAssetWait, /DEPLOYMENT_IDENTITY_ORIGIN/)
  assert.match(deployedAssetWait, /GITHUB_SHA/)
  assert.match(deployedAssetWait, /\/api\/deployment/)
  assert.match(deployedAssetWait, /MAX_WAIT_MS = 180_000/)
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
  assert.match(source, /RELEASE_ROUTE_INVENTORY_PATH=\"\$route_inventory\"/)
  assert.match(source, /--samples 25[\s\S]*--run-label baseline/)
  assert.match(source, /--samples 25[\s\S]*--run-label candidate/)
  assert.match(source, /compare-performance-recovery\.mjs/)
  assert.match(source, /test:e2e:full/)
  assert.match(source, /status: operationCount === 0 \? 'passed' : 'blocked_drift'/)
  assert.match(source, /if \(operationCount !== 0\) throw new Error\([\s\S]*separate reviewed test-mode apply approval/)
  assert.ok(source.indexOf('if (operationCount !== 0) throw') < source.indexOf('Capturing current staging deployment before any mutation'))
  assert.match(source, /detect_candidate_deployment/)
  assert.match(source, /restore_baseline/)
  assert.match(source, /DEPLOYMENT_CACHE_ORIGIN=\"\$STAGING_BASE_URL\"/)
  assert.match(source, /candidate-playwright-report\/index\.html/)
  assert.match(source, /deployed-playwright-report\/index\.html/)
  assert.match(source, /if:\s*always\(\)/)
  assert.match(source, /upload-artifact@[\w-]+[\s\S]*candidate-manifest\.json/)
  assert.match(source, /include-hidden-files:\s*true/)
  assertCandidateOverrideReadiness(source, 'staging')
  assertPromotedCandidateReadiness(source, 'staging')

  const restoreStart = source.indexOf('restore: {')
  const restoreEnd = source.indexOf('\n            },', restoreStart)
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'full-lane manifest restore object must be present')
  const restoreObject = source.slice(restoreStart, restoreEnd)
  assert.equal((restoreObject.match(/^\s*status:/gm) ?? []).length, 1, 'full-lane restore manifest must define status exactly once')
})

test('candidate evidence upload failure restores only the manifest-declared staging baseline', async () => {
  const jobs = await workflowJobs('.github/workflows/ci-full.yml')
  const steps = jobs.candidate?.steps ?? []
  const upload = steps.find(step => step.name === 'Upload candidate evidence')
  const recovery = steps.find(step => step.name === 'Restore exact staging baseline after evidence upload failure')
  assert.equal(upload?.id, 'upload-candidate-evidence')
  assert.equal(upload?.with?.['if-no-files-found'], 'error')
  assert.equal(upload?.if, 'always()')
  assert.equal(recovery?.if, "always() && steps.upload-candidate-evidence.outcome != 'success'")
  assert.ok(upload && recovery, 'candidate evidence upload recovery gate must be present')
  const uploadIndex = steps.indexOf(upload!)
  const recoveryIndex = steps.indexOf(recovery!)
  assert.ok(recoveryIndex > uploadIndex, 'baseline recovery must follow the evidence upload')

  const script = recovery?.run ?? ''
  const manifest = script.indexOf('candidate-manifest.json')
  const noMutation = script.indexOf('traffic_mutation_attempted')
  const alreadyRestored = script.indexOf('restored_baseline')
  const deploy = script.indexOf('wrangler versions deploy')
  const status = script.indexOf('wrangler deployments status')
  const verify = script.indexOf('staging traffic does not prove the exact baseline at 100%')
  const purge = script.indexOf('purge-deployment-cache.ts')
  assert.ok(manifest >= 0, 'recovery must read the local candidate manifest')
  assert.ok(noMutation > manifest, 'recovery must inspect the traffic mutation marker before deployment')
  assert.ok(alreadyRestored > noMutation, 'recovery must skip deployment when the manifest proves baseline restoration')
  assert.ok(deploy > alreadyRestored, 'recovery must deploy only after manifest no-op guards')
  assert.ok(status > deploy && verify > status && purge > verify, 'recovery must verify traffic and purge cache after baseline deployment')
  assert.match(script, /candidate-upload-failure-recovery\.json/)
  assert.match(script, /\$baseline_version@100/)
  assert.match(script, /candidate version remains active after baseline restoration/)
  assert.match(script, /operator intervention is required/)
  assert.match(script, /exit 1/)
})

test('staging rollback verifies baseline traffic and purges cache before claiming restoration', async () => {
  const jobs = await workflowJobs('.github/workflows/ci-full.yml')
  const source = runScript(jobs.candidate!, 'Prepare, verify, benchmark, and promote candidate')
  assertRestoreOrdering(source, /"\$STAGING_BASE_URL"/, 'staging')
  assertFailClosedStatusDetection(source, 'staging')
  assertManifestFailureRestoresAfterTrafficMutation(source, 'staging')
  assert.match(source, /const restoreStatus = [\s\S]*intervention_required/)
  assert.match(source, /restore:\s*\{[\s\S]*status: restoreStatus/)
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

test('immutable route inventory enumerates every reviewed fixture target and browser gate checks full first-party content', async () => {
  const inventorySource = await repoFile('scripts/release-route-inventory.mjs')
  const verifierSource = await repoFile('scripts/verify-deployed-candidate.mjs')
  const browserSource = await repoFile('tests/e2e/public-surfaces-release.spec.ts')
  const legacySource = await repoFile('scripts/legacy-rollback-route-inventory-4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9.mjs')
  const generated = spawnSync('node', ['scripts/release-route-inventory.mjs', '--base-url', 'https://krabiclaw.com'], { encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stderr)
  const inventory = JSON.parse(generated.stdout) as {
    surfaces: Array<{
      name: string
      routes: Array<{ path: string; content: string; expectedPath: string; allowRedirects: Array<{ status: number; path: string }> }>
      variants?: Array<{ name: string; routes: Array<{ path: string; content: string; expectedPath: string; allowRedirects: Array<{ status: number; path: string }> }> }>
    }>
  }
  const surface = (name: string) => {
    const value = inventory.surfaces.find(item => item.name === name)
    assert.ok(value, `missing ${name} surface`)
    return value
  }
  const paths = (value: { routes: Array<{ path: string }> }) => new Set(value.routes.map(route => route.path))
  const saya = surface('saya')
  const pottery = saya.variants?.find(item => item.name === 'pottery-house')
  const kikuzuki = saya.variants?.find(item => item.name === 'kikuzuki')
  assert.ok(pottery && kikuzuki)
  for (const target of [saya, pottery, kikuzuki]) {
    const targetPaths = paths(target)
    for (const suffix of ['/locations', '/locations/kikuzuki-japanese-robatayaki-izakaya/menu']) {
      if (target === kikuzuki || suffix === '/locations') assert.ok(targetPaths.has(suffix), `${target === kikuzuki ? 'Kikuzuki' : 'Saya'} missing ${suffix}`)
    }
    assert.ok(targetPaths.has('/reservations'), 'Saya fixture missing canonical site-wide reservations route')
    assert.ok([...targetPaths].every(path => !/^\/locations\/[^/]+\/reservations$/.test(path)), 'Saya fixture must not claim a location-level reservations route')
  }
  assert.ok(paths(pottery).has('/experiences/pottery-wheel-class'))
  assert.ok(paths(pottery).has('/posts/post-ph-1'))
  assert.ok(!paths(pottery).has('/blog/post-ph-1'))
  assert.ok(paths(pottery).has('/locations/krabi/reviews/gplaces-ph-1772088302'))
  assert.ok(paths(kikuzuki).has('/menu/tuna-sushi'))
  assert.ok(paths(kikuzuki).has('/experiences/teppanyaki-experience'))
  assert.ok(paths(kikuzuki).has('/locations/kikuzuki-japanese-robatayaki-izakaya/reviews/review-kiku-1'))
  const ncls = paths(surface('blawby'))
  const platformSurface = surface('platform')
  const platform = paths(platformSurface)
  for (const legalPath of ['/policies/privacy', '/policies/terms', '/third-party-notices']) {
    assert.ok(!platform.has(legalPath), `platform must not claim Blawby-only route ${legalPath}`)
    assert.ok(ncls.has(legalPath), `NCLS missing legal route ${legalPath}`)
  }
  const platformRoute = (path: string) => platformSurface.routes.find(route => route.path === path)
  assert.equal(platformRoute('/forgot-password')?.content, 'Reset your password')
  assert.equal(platformRoute('/reset-password')?.content, 'Choose a new password')
  assert.equal(platformRoute('/oauth/consent')?.content, 'This app wants to access your KrabiClaw Account.')
  const potteryReservations = pottery.routes.find(route => route.path === '/reservations')
  assert.equal(potteryReservations?.expectedPath, '/experiences')
  assert.deepEqual(potteryReservations?.allowRedirects, [{ status: 302, origin: 'https://pottery-house.krabiclaw.com', path: '/experiences' }])
  for (const service of ['family', 'small-business-and-nonprofits', 'employment', 'tenant-rights', 'probate-and-estate', 'special-education-and-iep-advocacy']) {
    assert.ok(ncls.has(`/services/${service}`), `NCLS missing service ${service}`)
  }
  for (const slug of NCLS_ARTICLE_SLUGS) assert.ok(ncls.has(`/article/${slug}`), `NCLS missing article ${slug}`)
  assert.match(inventorySource, /variants:/)
  assert.match(inventorySource, /PLATFORM_DOC_ROUTES/)
  assert.match(verifierSource, /surface\.variants/)
  assert.match(verifierSource, /location\.search === ''[\s\S]*location\.hash === ''/)
  assert.match(browserSource, /status >= 400/)
  assert.match(browserSource, /expectedMediaType/)
  assert.match(browserSource, /media\.krabiclaw\.com/)
  assert.match(browserSource, /imagedelivery\.net/)
  assert.match(browserSource, /window\.scrollTo\(0, y\)/)
  assert.match(browserSource, /blankSections/)
  assert.match(legacySource, /expectedOrigin/)
  assert.match(legacySource, /targetSourceSha/)
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
  assert.match(source, /verify-production-baseline-provenance\.mjs/)
  assert.match(source, /production-baseline-provenance\.json/)
  assert.match(source, /production-baseline-deployment\.json/)
  assert.match(source, /api\.workerVersionId == \.versionId/)
  assert.match(source, /treeSha256/)
  assert.match(source, /\.migrations\.after\.files \| length/)
  assert.match(source, /wrangler d1 migrations apply DB --remote/)
  assert.doesNotMatch(source, /inputs\.staging_base_url/)
  assert.match(source, /STAGING_BASE_URL: https:\/\/staging\.krabiclaw\.com/)
  assert.match(source, /stripeWebhookPreflight\.status == \"passed\"/)
  assert.match(source, /production-stripe-webhook-preflight-\$\{\{ github\.sha \}\}/)
  assert.match(source, /STRIPE_SECRET_KEY_LIVE/)
  assert.match(source, /STRIPE_WEBHOOK_EXPECTED_MODE: live/)
  assert.match(source, /\.accountMode == \"live\"/)
  assert.match(source, /\.effectiveApiVersion == \$expected_api_version/)
  assert.match(source, /\.apiVersionSource == \"endpoint\"/)
  assert.match(source, /\.apiVersionSource == \"account_default\"/)
  assert.match(source, /\.accountDefaultApiVersions == \[\$expected_api_version\]/)
  assert.match(source, /\.accountDefaultMissingResponseCount == 0/)
  assert.match(source, /gh run download[\s\S]*production-stripe-webhook-preflight-\$SOURCE_SHA/)
  assert.match(source, /stripeCatalogPreflight\.status == \"passed\"/)
  assert.match(source, /stripeCatalogPreflight\.accountId \| test/)
  assert.match(source, /stripeCatalogPreflight\.providerSnapshotSha256 \| test/)
  assert.match(source, /stripeCanary\.status == \"passed\"/)
  assert.match(source, /routeInventory\.requiredSurfaces/)
  assert.match(source, /pottery-house.*kikuzuki|kikuzuki.*pottery-house/)
  assert.match(source, /wrangler versions upload --tag \"\$SOURCE_SHA\"/)
  assert.match(source, /RELEASE_ROUTE_INVENTORY_PATH=\"\$route_inventory\"/)
  assert.equal((source.match(/wrangler versions upload/g) ?? []).length, 1)
  assert.match(source, /detect_candidate_deployment/)
  assert.match(source, /DEPLOYMENT_CACHE_ORIGIN=https:\/\/krabiclaw\.com/)
  assert.ok((source.match(/public-surfaces-release\.spec\.ts/g) ?? []).length >= 2)
  assert.match(source, /include-hidden-files:\s*true/)
  assert.doesNotMatch(source, /E2E_ALLOW_DEV_ROUTES|E2E_DEV_ROUTE_SECRET|STRIPE_SECRET_KEY_TEST|BETTER_AUTH_SECRET/)
  assert.doesNotMatch(source, /wrangler secret put|--no-bundle/)
  assert.ok(source.indexOf('verify-production-baseline-provenance.mjs') < source.indexOf('npx wrangler d1 migrations apply DB --remote'))
})

test('production deploy attests explicit and inherited webhook versions without accepting loose evidence', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const deploy = jobs['deploy-production']
  assert.ok(deploy)
  const attestation = runScript(deploy, 'Attest and download the separately reviewed preflight')
  const filter = attestation.match(/\n\s+'(\.status == "passed"[\s\S]*?)' \\\n\s+"\$PRODUCTION_WEBHOOK_PREFLIGHT_PATH"/)?.[1]
  assert.ok(filter, 'production webhook evidence jq filter must be present')

  const sourceSha = 'a'.repeat(40)
  const expectedUrl = 'https://krabiclaw.com/api/billing/webhook'
  const expectedApiVersion = '2025-11-17.clover'
  const expectedEvents = ['invoice.paid']
  const evaluate = (evidence: Record<string, unknown>) => spawnSync(
    'jq',
    [
      '-e',
      '--arg', 'sha', sourceSha,
      '--arg', 'expected_url', expectedUrl,
      '--arg', 'expected_api_version', expectedApiVersion,
      '--argjson', 'expected_events', JSON.stringify(expectedEvents),
      filter,
    ],
    { input: JSON.stringify(evidence), encoding: 'utf8' },
  ).status
  const base = {
    status: 'passed',
    accountMode: 'live',
    testMode: false,
    sourceSha,
    expectedUrl,
    expectedApiVersion,
    effectiveApiVersion: expectedApiVersion,
    enabledEvents: expectedEvents,
    expectedEvents,
    endpointId: 'we_deadbeef',
  }
  const explicit = {
    ...base,
    apiVersionSource: 'endpoint',
    apiVersion: expectedApiVersion,
  }
  const inherited = {
    ...base,
    apiVersionSource: 'account_default',
    apiVersion: null,
    accountDefaultApiVersions: [expectedApiVersion],
    accountDefaultApiVersionsTruncated: false,
    accountDefaultResponseCount: 1,
    accountDefaultMissingResponseCount: 0,
  }

  assert.equal(evaluate(explicit), 0)
  assert.equal(evaluate(inherited), 0)
  assert.notEqual(evaluate({ ...inherited, apiVersion: undefined }), 0)
  assert.notEqual(evaluate({ ...inherited, accountDefaultResponseCount: '1' }), 0)
  assert.notEqual(evaluate({ ...inherited, accountDefaultResponseCount: {} }), 0)
  assert.notEqual(evaluate({ ...inherited, endpointId: 'we_1TiXCPEm0pkzLQDbSYMeElNc_deadbeef' }), 0)
  assert.notEqual(evaluate({ ...inherited, effectiveApiVersion: '2026-04-22.dahlia' }), 0)
})

test('production release checks the exact protected Environment before every mutation', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const environmentPreflight = jobs['production-environment-preflight']
  assert.ok(environmentPreflight)
  assert.equal(environmentPreflight.environment, undefined)
  assert.equal(environmentPreflight.permissions?.actions, 'read')
  assert.equal(environmentPreflight.permissions?.contents, 'read')
  assert.match(environmentPreflight.if ?? '', /inputs\.operation == 'deploy'/)
  assert.doesNotMatch(environmentPreflight.if ?? '', /inputs\.operation == 'preflight'/)
  const protectionScript = runScript(environmentPreflight, 'Require the protected production Environment')
  assert.match(protectionScript, /\/environments\/production/)
  assert.match(protectionScript, /http_status/)
  assert.match(protectionScript, /http_status.*200/)
  assert.match(protectionScript, /--connect-timeout 10/)
  assert.match(protectionScript, /--max-time 20/)
  assert.match(protectionScript, /--retry 0/)
  assert.match(protectionScript, /protection_rules/)
  assert.match(protectionScript, /required_reviewers/)
  assert.match(protectionScript, /prevent_self_review == true/)
  assert.match(protectionScript, /reviewers/)
  assert.doesNotMatch(protectionScript, /\b(?:POST|PUT|PATCH|DELETE)\b/)

  assert.equal(jobs.preflight?.needs, undefined)
  const productionWebhookPreflight = jobs['production-stripe-webhook-preflight']
  assert.ok(productionWebhookPreflight)
  assert.match(productionWebhookPreflight.if ?? '', /inputs\.operation == 'preflight'/)
  assert.equal((productionWebhookPreflight.environment as { name?: string })?.name, 'production')
  const webhookRead = runScript(productionWebhookPreflight, 'Read production webhook endpoint with the live Stripe key')
  assert.match(webhookRead, /scripts\/preflight-stripe-webhook-endpoint\.mjs/)
  assert.doesNotMatch(webhookRead, /wrangler (?:deploy|versions|d1)|curl .* -X (?:POST|PUT|PATCH|DELETE)/)
  assert.deepEqual(jobs['deploy-production']?.needs, ['production-environment-preflight'])
  assert.equal((jobs['deploy-production']?.environment as { name?: string })?.name, 'production')
  assert.match(jobs['deploy-production']?.if ?? '', /needs\.production-environment-preflight\.result == 'success'/)

  const jqFilter = protectionScript.match(/if ! jq -e '([\s\S]*?)' "\$response"/)?.[1]
  assert.ok(jqFilter, 'Environment protection jq filter must be present')
  const evaluate = (protectionRules: unknown[]) => spawnSync(
    'jq',
    ['-e', jqFilter],
    {
      input: JSON.stringify({ name: 'production', protection_rules: protectionRules }),
      encoding: 'utf8',
    },
  )
  const reviewer = { reviewer: { login: 'release-reviewer' } }
  assert.equal(evaluate([{ type: 'required_reviewers', prevent_self_review: true, reviewers: [reviewer] }]).status, 0)
  assert.notEqual(evaluate([{ type: 'required_reviewers', prevent_self_review: false, reviewers: [reviewer] }]).status, 0)
  assert.notEqual(evaluate([{ type: 'required_reviewers', reviewers: [reviewer] }]).status, 0)
})

test('production rollback verifies baseline traffic and purges cache before claiming restoration', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const source = runScript(jobs['deploy-production']!, 'Capture baseline, migrate, roll out, verify, and promote')
  assert.match(source, /verify-production-baseline-provenance\.mjs/)
  assert.match(source, /approved_baseline_provenance="\$\{APPROVED_BASELINE_PROVENANCE_PATH:\?/)
  assert.doesNotMatch(source, /approved_baseline_provenance="\$BASELINE_PROVENANCE_PATH"/)
  assert.ok(source.indexOf('approved_baseline_provenance="${APPROVED_BASELINE_PROVENANCE_PATH:?') < source.indexOf('BASELINE_PROVENANCE_PATH="$baseline_provenance"'))
  assert.ok(source.indexOf('verify-production-baseline-provenance.mjs') < source.indexOf('npx wrangler d1 migrations apply DB --remote'))
  assertRestoreOrdering(source, /https:\/\/krabiclaw\.com/, 'production')
  assertFailClosedStatusDetection(source, 'production')
  assertManifestFailureRestoresAfterTrafficMutation(source, 'production')
  assert.match(source, /restore:\{[\s\S]*status:[\s\S]*intervention_required/)
  assert.match(source, /splitActive:process\.env\.SPLIT_ACTIVE==='true'/)
  assertCandidateOverrideReadiness(source, 'production')
  assertPromotedCandidateReadiness(source, 'production')
})

test('production evidence upload failure restores only the manifest-declared baseline', async () => {
  const jobs = await workflowJobs('.github/workflows/release-production.yml')
  const steps = jobs['deploy-production']?.steps ?? []
  const upload = steps.find(step => step.name === 'Upload production release evidence')
  const recovery = steps.find(step => step.name === 'Restore exact production baseline after evidence upload failure')
  assert.equal(upload?.id, 'upload-production-evidence')
  assert.equal(upload?.with?.['if-no-files-found'], 'error')
  assert.equal(upload?.if, 'always()')
  assert.equal(recovery?.if, "always() && steps.upload-production-evidence.outcome != 'success'")
  assert.ok(upload && recovery, 'production evidence upload recovery gate must be present')
  assert.ok(steps.indexOf(recovery!) > steps.indexOf(upload!), 'production baseline recovery must follow evidence upload')

  const script = recovery?.run ?? ''
  const manifest = script.indexOf('production-release-manifest.json')
  const noMutation = script.indexOf('traffic_mutation_attempted')
  const alreadyRestored = script.indexOf('restored_baseline')
  const deploy = script.indexOf('wrangler versions deploy')
  const status = script.indexOf('wrangler deployments status')
  const verify = script.indexOf('production traffic does not prove the exact baseline at 100%')
  const purge = script.indexOf('purge-deployment-cache.ts')
  assert.ok(manifest >= 0, 'recovery must read the local production release manifest')
  assert.ok(noMutation > manifest, 'recovery must inspect the production traffic mutation marker before deployment')
  assert.ok(alreadyRestored > noMutation, 'recovery must skip deployment when the manifest proves baseline restoration')
  assert.ok(deploy > alreadyRestored, 'recovery must deploy only after manifest no-op guards')
  assert.ok(status > deploy && verify > status && purge > verify, 'recovery must verify production traffic and purge cache after baseline deployment')
  assert.match(script, /production-upload-failure-recovery\.json/)
  assert.match(script, /\$baseline_version@100/)
  assert.match(script, /candidate version remains active after production baseline restoration/)
  assert.match(script, /operator intervention is required/)
  assert.match(script, /exit 1/)
})

test('candidate and production restoration are gated by an attempted traffic mutation', async () => {
  const stagingJobs = await workflowJobs('.github/workflows/ci-full.yml')
  const productionJobs = await workflowJobs('.github/workflows/release-production.yml')
  const staging = runScript(stagingJobs.candidate!, 'Prepare, verify, benchmark, and promote candidate')
  const production = runScript(productionJobs['deploy-production']!, 'Capture baseline, migrate, roll out, verify, and promote')

  for (const [label, source, splitMarker] of [
    ['staging', staging, 'BASELINE_VERSION_ID@100" "$CANDIDATE_VERSION_ID@0'],
    ['production', production, 'BASELINE_VERSION_ID@100" "$CANDIDATE_VERSION_ID@0'],
  ] as const) {
    assert.match(source, /TRAFFIC_MUTATION_ATTEMPTED="false"/)
    assert.match(source, /traffic_mutation_flag=/)
    assert.match(source, /printf '%s\\n' "true" > "\$traffic_mutation_flag"/)
    assert.match(source, /TRAFFIC_MUTATION_ATTEMPTED="true"[\s\S]*printf '%s\\n' "true" > "\$traffic_mutation_flag"[\s\S]*versions deploy/)
    const restore = shellFunction(source, 'restore_baseline')
    assert.match(restore, /TRAFFIC_MUTATION_ATTEMPTED.*!=.*true/)
    assert.match(restore, /no compensating deployment will be created/)
    const onExit = shellFunction(source, 'on_exit')
    assert.match(onExit, /TRAFFIC_MUTATION_ATTEMPTED.*==.*true/)
    assert.match(onExit, /detect_candidate_deployment \|\| true[\s\S]*restore_baseline \|\| true/)
    const split = source.indexOf(splitMarker)
    const marker = source.lastIndexOf('TRAFFIC_MUTATION_ATTEMPTED="true"', split)
    assert.ok(marker >= 0 && marker < split, `${label}: traffic mutation marker must precede split deploy`)
  }
})

test('exact-target production rollback is read-only until protected mutation and cannot guess a previous version', async () => {
  const source = await repoFile('.github/workflows/rollback-production.yml')
  const jobs = await workflowJobs('.github/workflows/rollback-production.yml')
  const document = parse(source) as { concurrency?: { group?: string; 'cancel-in-progress'?: boolean } }

  for (const input of [
    'expected_current_worker_version_id',
    'target_worker_version_id',
    'target_source_sha',
    'incident_reason',
  ]) {
    assert.match(source, new RegExp(`${input}:[\\s\\S]*required:\\s*true`), `${input} must be required`)
  }
  assert.equal(document.concurrency?.group, 'production-release')
  assert.equal(document.concurrency?.['cancel-in-progress'], false)
  assert.equal(jobs.preflight?.environment, undefined)
  assert.equal((jobs['rollback-production']?.environment as { name?: string })?.name, 'production')
  assert.equal(jobs.preflight?.needs, undefined)
  assert.equal(jobs.preflight?.if, undefined)
  assert.deepEqual(jobs['rollback-production']?.needs, ['production-environment-preflight', 'preflight'])

  assert.match(source, /production-rollback-preflight-/)
  assert.match(source, /ref: \$\{\{ github\.sha \}\}/)
  assert.match(source, /path: target-source/)
  assert.match(source, /working-directory: target-source/)
  assert.match(source, /sourceIdentities/)
  assert.match(source, /cd target-source\/\.output && find \. -type f/)
  assert.match(source, /cd \.output && find \. -type f/)
  assert.match(source, /versions view "\$TARGET_WORKER_VERSION_ID"/)
  assert.match(source, /release-route-inventory\.mjs/)
  const preflightScript = (jobs.preflight?.steps ?? []).map(step => step.run ?? '').join('\n')
  assert.doesNotMatch(preflightScript, /verify-deployed-candidate\.mjs|playwright test|WORKER_VERSION_OVERRIDE|--version-override/)
  assert.doesNotMatch(preflightScript, /versions view "\$EXPECTED_CURRENT_WORKER_VERSION_ID"|Current Worker version .* tagged/)
  assert.match(preflightScript, /status:\s*'attested'/)
  assert.doesNotMatch(preflightScript, /targetVerification|candidateBrowser/)
  assert.match(source, /LEGACY_TARGET_SOURCE_SHA:\s*4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9/)
  assert.match(source, /LEGACY_TARGET_WORKER_VERSION_ID:\s*6254de48-c029-418b-b82f-a4811fb04814/)
  assert.match(source, /LEGACY_TARGET_RELEASE_RUN_ID:\s*"31142677520"/)
  assert.match(preflightScript, /gh run view "\$LEGACY_TARGET_RELEASE_RUN_ID" --json conclusion,event,headSha,workflowName,jobs/)
  assert.match(preflightScript, /workflowName !== 'CI \(Required PR Lane\)'/)
  assert.match(preflightScript, /job\.startedAt !== '2026-08-07T02:54:23Z'/)
  assert.match(preflightScript, /job\.completedAt !== '2026-08-07T03:01:44Z'/)
  assert.match(preflightScript, /createdOn !== '2026-08-07T02:59:37\.401932Z'/)
  assert.match(preflightScript, /targetCreatedOn !== '2026-08-07T02:59:37\.401Z'/)
  assert.match(preflightScript, /historical-actions-run-window-and-provider-created-on/)
  assert.match(preflightScript, /Modern target Worker version .* is not tagged with source SHA/)
  assert.match(source, /TRAFFIC_MUTATION_ATTEMPTED|rollback-traffic-mutation-attempted/)
  assert.match(source, /uuid_pattern='\^\[0-9a-f\]\{8\}/)
  assert.match(source, /EXPECTED_CURRENT_WORKER_VERSION_ID" != "\$TARGET_WORKER_VERSION_ID/)
  assert.match(source, /if: failure\(\)/)
  assert.match(source, /versions deploy "\$EXPECTED_CURRENT_WORKER_VERSION_ID@100"/)
  assert.match(source, /rollback-intervention-required\.json/)
  assert.match(source, /public-surfaces-desktop[\s\S]*public-surfaces-mobile/)
  const rollbackSteps = jobs['rollback-production']?.steps ?? []
  assert.equal(jobs['rollback-production']?.env?.PLAYWRIGHT_PREVIEW_URL, 'https://krabiclaw.com')
  const splitStep = rollbackSteps.find(step => step.name === 'Place exact target at zero traffic and prove split')
  const overrideVerifyStep = rollbackSteps.find(step => step.name === 'Wait for and strictly verify zero-traffic target with override')
  const overrideBrowserStep = rollbackSteps.find(step => step.name === 'Verify zero-traffic target Saya and Blawby with override')
  const promotionStep = rollbackSteps.find(step => step.name === 'Promote exact target and wait for unoverridden readiness')
  const finalVerifyStep = rollbackSteps.find(step => step.name === 'Verify deployed target assets and source provenance')
  const finalBrowserStep = rollbackSteps.find(step => step.name === 'Verify Saya and Blawby on desktop and mobile browsers')
  for (const [label, step] of [
    ['split', splitStep],
    ['override verifier', overrideVerifyStep],
    ['override browser', overrideBrowserStep],
    ['promotion', promotionStep],
    ['final verifier', finalVerifyStep],
    ['final browser', finalBrowserStep],
  ] as const) assert.ok(step, `missing protected rollback ${label} step`)
  assert.ok(
    rollbackSteps.indexOf(splitStep!) < rollbackSteps.indexOf(overrideVerifyStep!)
    && rollbackSteps.indexOf(overrideVerifyStep!) < rollbackSteps.indexOf(overrideBrowserStep!)
    && rollbackSteps.indexOf(overrideBrowserStep!) < rollbackSteps.indexOf(promotionStep!)
    && rollbackSteps.indexOf(promotionStep!) < rollbackSteps.indexOf(finalVerifyStep!)
    && rollbackSteps.indexOf(finalVerifyStep!) < rollbackSteps.indexOf(finalBrowserStep!),
    'target must be placed at 0%, override-verified, promoted, and then verified unoverridden in order',
  )
  const splitRun = splitStep?.run ?? ''
  const marker = splitRun.indexOf("printf '%s\\n' \"true\" > \"$flag\"")
  const splitDeploy = splitRun.indexOf('versions deploy "$EXPECTED_CURRENT_WORKER_VERSION_ID@100" "$TARGET_WORKER_VERSION_ID@0"')
  assert.ok(marker >= 0 && splitDeploy > marker, 'durable traffic marker must precede the current@100 + target@0 deployment')
  assert.match(splitRun, /current\.traffic !== 100 \|\| target\.traffic !== 0/)
  const overrideVerifyRun = overrideVerifyStep?.run ?? ''
  assert.match(overrideVerifyRun, /export WORKER_VERSION_OVERRIDE="\$TARGET_WORKER_VERSION_ID"/)
  assert.match(overrideVerifyRun, /DEPLOYMENT_EXPECTED_SOURCE_SHA="\$TARGET_SOURCE_SHA"/)
  assert.match(overrideVerifyRun, /DEPLOYMENT_EXPECTED_WORKER_VERSION="\$TARGET_WORKER_VERSION_ID"/)
  assert.ok(overrideVerifyRun.indexOf('wait-for-deployed-assets.mjs') < overrideVerifyRun.indexOf('verify-deployed-candidate.mjs'))
  assert.match(overrideVerifyRun, /--version-override "\$TARGET_WORKER_VERSION_ID"/)
  assert.match(overrideVerifyRun, /TARGET_SOURCE_SHA" == "\$LEGACY_TARGET_SOURCE_SHA" && "\$TARGET_WORKER_VERSION_ID" == "\$LEGACY_TARGET_WORKER_VERSION_ID"/)
  assert.match(overrideVerifyRun, /DEPLOYMENT_EXPECTED_SOURCE_SHA=""[\s\S]*DEPLOYMENT_EXPECTED_WORKER_VERSION=""[\s\S]*wait-for-deployed-assets\.mjs/)
  assert.match(overrideVerifyRun, /manifest\.workerState\?\.target\?\.attestation\?\.type !== 'historical-actions-run-window-and-provider-created-on'/)
  assert.match(overrideVerifyRun, /manifest\.workerState\?\.target\?\.attestation\?\.runId !== 31142677520/)
  assert.match(overrideVerifyRun, /provenanceKind: 'legacy-release-window-and-exact-assets'/)
  assert.match(overrideVerifyRun, /differs from the attested target build/)
  assert.equal(overrideBrowserStep?.env?.WORKER_VERSION_OVERRIDE, '${{ inputs.target_worker_version_id }}')
  const overrideBrowserRun = overrideBrowserStep?.run ?? ''
  assert.match(overrideBrowserRun, /else\s+cd target-source\s+test -f "\$browser_spec"/)
  assert.match(overrideBrowserRun, /npx playwright test "\$browser_spec"/)
  assert.equal(overrideBrowserStep?.env?.PLAYWRIGHT_HTML_OUTPUT_DIR, '${{ runner.temp }}/rollback-target-override-playwright-report')
  assert.match(overrideBrowserRun, /--output "\$RUNNER_TEMP\/rollback-target-override-test-results"/)
  const promotionRun = promotionStep?.run ?? ''
  assert.match(promotionRun, /versions deploy "\$TARGET_WORKER_VERSION_ID@100"/)
  assert.match(promotionRun, /unset WORKER_VERSION_OVERRIDE/)
  assert.match(promotionRun, /DEPLOYMENT_EXPECTED_SOURCE_SHA="\$TARGET_SOURCE_SHA"/)
  assert.match(promotionRun, /DEPLOYMENT_EXPECTED_WORKER_VERSION="\$TARGET_WORKER_VERSION_ID"/)
  assert.ok(promotionRun.indexOf('unset WORKER_VERSION_OVERRIDE') < promotionRun.indexOf('wait-for-deployed-assets.mjs'))
  const finalVerifyRun = finalVerifyStep?.run ?? ''
  assert.doesNotMatch(finalVerifyRun, /--version-override/)
  assert.match(finalVerifyRun, /phase: 'promoted-unoverridden'/)
  assert.match(finalVerifyRun, /Promoted legacy asset \$\{pathname\} differs from the attested target build/)
  assert.equal(finalBrowserStep?.env?.WORKER_VERSION_OVERRIDE, undefined)
  const finalBrowserRun = finalBrowserStep?.run ?? ''
  assert.match(finalBrowserRun, /else\s+cd target-source\s+test -f "\$browser_spec"/)
  assert.match(finalBrowserRun, /npx playwright test "\$browser_spec"/)
  assert.equal(finalBrowserStep?.env?.PLAYWRIGHT_HTML_OUTPUT_DIR, '${{ runner.temp }}/rollback-promoted-playwright-report')
  assert.match(finalBrowserRun, /--output "\$RUNNER_TEMP\/rollback-promoted-test-results"/)
  assert.match(source, /rollback-target-override-playwright-report\/[\s\S]*rollback-target-override-test-results\/[\s\S]*rollback-promoted-playwright-report\/[\s\S]*rollback-promoted-test-results\//)
  const resultStep = rollbackSteps.find(step => step.name === 'Write rollback result evidence')
  assert.equal(resultStep?.id, 'write-result')
  const resultRestoreStep = rollbackSteps.find(step => step.name === 'Restore exact baseline after rollback result serialization failure')
  assert.equal(resultRestoreStep?.if, "always() && steps.write-result.outcome == 'failure'")
  assert.ok(resultStep && resultRestoreStep, 'rollback result serialization failure gate must be present')
  const resultIndex = rollbackSteps.indexOf(resultStep!)
  const resultRestoreIndex = rollbackSteps.indexOf(resultRestoreStep!)
  const uploadStep = rollbackSteps.find(step => step.name === 'Upload rollback result evidence')
  const uploadFailureStep = rollbackSteps.find(step => step.name === 'Stop and re-prove rollback target after evidence upload failure')
  const uploadIndex = rollbackSteps.indexOf(uploadStep!)
  assert.ok(resultRestoreIndex > resultIndex && uploadIndex > resultRestoreIndex, 'result restoration must follow serialization and precede evidence upload')
  assert.equal(uploadStep?.id, 'upload-rollback-result')
  assert.equal(uploadStep?.with?.['if-no-files-found'], 'error')
  assert.equal(uploadFailureStep?.if, "always() && steps.upload-rollback-result.outcome != 'success'")
  assert.ok(rollbackSteps.indexOf(uploadFailureStep!) > uploadIndex, 'upload failure proof must follow the rollback evidence upload')
  assert.match(uploadFailureStep?.run ?? '', /\.status == "verified"[\s\S]*\.trafficMutationAttempted == true[\s\S]*\.intervention == null/)
  assert.match(uploadFailureStep?.run ?? '', /\.overrideBrowser\.status == "passed"[\s\S]*\.browser\.status == "passed"/)
  assert.match(uploadFailureStep?.run ?? '', /keep-target transport exception is unavailable/)
  assert.match(uploadFailureStep?.run ?? '', /exact rollback target is no longer proven at 100%/)
  assert.doesNotMatch(uploadFailureStep?.run ?? '', /wrangler versions deploy/)
  assert.match(uploadFailureStep?.run ?? '', /exactTargetStillServing:true/)
  assert.match(uploadFailureStep?.run ?? '', /Traffic was not restored to the incident baseline[\s\S]*reintroduce the incident/)
  assert.match(resultRestoreStep?.run ?? '', /rollback-traffic-mutation-attempted/)
  assert.match(resultRestoreStep?.run ?? '', /versions deploy "\$EXPECTED_CURRENT_WORKER_VERSION_ID@100"/)
  assert.match(resultRestoreStep?.run ?? '', /rollback-baseline-restored\.json/)
  assert.match(resultRestoreStep?.run ?? '', /wrangler deployments status/)
  assert.match(resultRestoreStep?.run ?? '', /purge-deployment-cache\.ts/)
  const resultRestoreRun = resultRestoreStep?.run ?? ''
  const restoreDeploy = resultRestoreRun.indexOf('versions deploy "$EXPECTED_CURRENT_WORKER_VERSION_ID@100"')
  const restoreStatus = resultRestoreRun.indexOf('wrangler deployments status')
  const restoreVerify = resultRestoreRun.indexOf('Exact baseline restoration traffic is unknown or ambiguous')
  const restorePurge = resultRestoreRun.indexOf('purge-deployment-cache.ts')
  const restoredEvidence = resultRestoreRun.indexOf('restored:true')
  assert.ok(restoreDeploy >= 0 && restoreStatus > restoreDeploy && restoreVerify > restoreStatus && restorePurge > restoreVerify && restoredEvidence > restorePurge, 'result serialization failure restoration must verify traffic and purge cache before marking restored')
  assert.doesNotMatch(source, /wrangler d1|seed:|migrate:/)
  assert.doesNotMatch(source, /previous|latest deployment|last deployment/i)

  const cloudflareJobEnv = Object.values(jobs).flatMap(job => Object.keys((job as WorkflowJob & { env?: Record<string, string> }).env ?? {}))
  assert.ok(!cloudflareJobEnv.includes('CLOUDFLARE_API_TOKEN'))
  assert.ok(!cloudflareJobEnv.includes('CLOUDFLARE_ACCOUNT_ID'))
})

test('nightly browser telemetry proves the configured version is serving without an override and cannot mutate an environment', async () => {
  const source = await repoFile('.github/workflows/e2e-full.yml')

  assert.match(source, /ref: \$\{\{ inputs\.source_sha \|\| vars\.NIGHTLY_SOURCE_SHA \}\}/)
  assert.match(source, /NIGHTLY_ARTIFACT_RUN_ID/)
  assert.match(source, /gh run view[\s\S]*conclusion,event,headSha,workflowName/)
  assert.match(source, /\.event == "workflow_dispatch"/)
  assert.match(source, /\.workflowName == "CI \(Full Validation Lane\)"/)
  assert.match(source, /\.headSha == \$sha/)
  assert.match(source, /gh run download[\s\S]*production-build-\$NIGHTLY_SOURCE_SHA/)
  assert.match(source, /DEPLOYMENT_EXPECTED_SOURCE_SHA:\s*\$\{\{ inputs\.source_sha \|\| vars\.NIGHTLY_SOURCE_SHA \}\}/)
  assert.match(source, /DEPLOYMENT_EXPECTED_WORKER_VERSION:\s*\$\{\{ inputs\.worker_version_id \|\| vars\.NIGHTLY_WORKER_VERSION_ID \}\}/)
  const readiness = source.indexOf('node scripts/wait-for-deployed-assets.mjs')
  const verifier = source.indexOf('node scripts/verify-deployed-candidate.mjs', readiness)
  const browser = source.indexOf('npx playwright test tests/e2e/public-surfaces-release.spec.ts', verifier)
  const postBrowserReadiness = source.indexOf('node scripts/wait-for-deployed-assets.mjs', browser)
  const postBrowserVerifier = source.indexOf('node scripts/verify-deployed-candidate.mjs', postBrowserReadiness)
  assert.ok(readiness >= 0, 'nightly must wait for the configured unoverridden deployment identity')
  assert.ok(verifier > readiness, 'strict unoverridden verification must follow bounded readiness')
  assert.ok(browser > verifier, 'the unoverridden browser matrix must follow strict verification')
  assert.ok(postBrowserReadiness > browser, 'nightly must re-check unoverridden readiness after browser coverage')
  assert.ok(postBrowserVerifier > postBrowserReadiness, 'nightly must strictly re-prove the configured identity after browser coverage')
  assert.match(source, /nightly-post-browser-deployment-verification\.json/)
  assert.doesNotMatch(source, /WORKER_VERSION_OVERRIDE|--version-override/)
  assert.match(source, /release-route-inventory\.mjs/)
  assert.match(source, /--route-inventory/)
  assert.match(source, /public-surfaces-desktop[\s\S]*public-surfaces-mobile/)
  assert.doesNotMatch(source, /canary:status|migrate:(?:prod|staging)|wrangler d1|wrangler (?:deploy|versions)|yarn seed/)
})

test('release workflows hard-bind route and origin evidence and block direct remote writes', async () => {
  const required = await repoFile('.github/workflows/ci.yml')
  const full = await repoFile('.github/workflows/ci-full.yml')
  const production = await repoFile('.github/workflows/release-production.yml')
  const nightly = await repoFile('.github/workflows/e2e-full.yml')
  const zaraz = await repoFile('.github/workflows/zaraz-ga-backfill.yml')
  const packageSource = await repoFile('package.json')
  const rollback = await repoFile('scripts/rollback-prod.mjs')
  const zarazScript = await repoFile('scripts/zaraz-ga-backfill.mjs')
  const commandBlocker = await repoFile('scripts/release-command-blocked.mjs')

  for (const source of [required, full, production]) {
    assert.match(source, /wrangler secret list[^\n]*--format json/)
    assert.doesNotMatch(source, /wrangler secret list[^\n]*--json/)
  }

  assert.doesNotMatch(full, /inputs\.staging_base_url/)
  assert.match(full, /STAGING_BASE_URL: https:\/\/staging\.krabiclaw\.com/)
  assert.match(full, /release-route-inventory\.mjs[\s\S]*--route-inventory/)
  assert.match(production, /STAGING_BASE_URL: https:\/\/staging\.krabiclaw\.com/)
  assert.match(production, /\.browser\.baseUrl == \"https:\/\/staging\.krabiclaw\.com\"/)
  assert.match(production, /stripeWebhookPreflight\.status == \"passed\"/)
  assert.match(production, /stripeCatalogPreflight\.status == \"passed\"/)
  assert.match(production, /stripeCatalogPreflight\.accountId \| test/)
  assert.match(production, /stripeCatalogPreflight\.providerSnapshotSha256 \| test/)
  assert.match(production, /stripeCanary\.status == \"passed\"/)
  assert.match(nightly, /--route-inventory/)
  assert.match(nightly, /RELEASE_ROUTE_INVENTORY_PATH=\$RUNNER_TEMP\/nightly-route-inventory\.json/)
  assert.match(zaraz, /name: Zaraz GA4 Backfill Plan/)
  assert.match(zaraz, /default: staging/)
  assert.match(zaraz, /- staging[\s\S]*- preview/)
  assert.doesNotMatch(zaraz, /dry_run:/)
  assert.match(zaraz, /Production Zaraz configuration has no operator apply or plan path/)
  assert.match(zaraz, /node scripts\/zaraz-ga-backfill\.mjs "\$target_flag" --dry-run/)
  assert.doesNotMatch(zaraz, /yarn zaraz:ga:backfill/)
  assert.match(zarazScript, /targets = \['--preview', '--staging'\]/)
  assert.match(zarazScript, /const dryRun = process\.argv\.includes\('--dry-run'\)/)
  assert.match(zarazScript, /status: 'plan_only'/)
  assert.match(zarazScript, /writes: \{ d1: false, zaraz: false \}/)
  assert.doesNotMatch(zarazScript, /method:\s*['"]PUT['"]|putResponse|Zaraz PUT/)
  assert.match(packageSource, /"zaraz:ga:backfill":\s*"node scripts\/release-command-blocked\.mjs production zaraz-ga4-backfill"/)
  assert.match(commandBlocker, /operation === 'rollback'[\s\S]*Production rollback \(exact-target, manifest-gated\)/)
  assert.match(commandBlocker, /operation === 'zaraz-ga4-backfill'/)
  assert.match(commandBlocker, /Direct Zaraz GA4 backfill apply is disabled/)
  assert.match(commandBlocker, /Zaraz GA4 Backfill Plan/)
  for (const command of [
    'migrate:staging', 'migrate:prod', 'schema:remote', 'schema:staging',
    'seed:staging', 'seed:demo:staging', 'seed:pottery-staging', 'seed:kikuzuki:staging',
    'seed:docs:staging', 'seed:remote', 'seed:pottery-remote', 'seed:kikuzuki:remote',
  ]) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(packageSource, new RegExp(`"${escaped}":\\s*"node scripts/release-command-blocked\\.mjs`), `${command} must be blocked`)
  }
  assert.match(packageSource, /"rollback:prod":\s*"node scripts\/release-command-blocked\.mjs production/)
  assert.match(rollback, /Direct production rollback is disabled/)
  assert.match(rollback, /Production rollback \(exact-target, manifest-gated\)/)
  assert.doesNotMatch(rollback, /Production release \(manifest-gated\)/)
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
    'durable traffic',
    'restore baseline',
    'landed',
    'deployed',
    'verified',
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase)
  }
})
