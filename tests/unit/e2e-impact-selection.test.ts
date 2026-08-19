import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { IMPACT_GROUPS } from '../../config/e2e-impact-map.mjs'
import {
  changedFilesBetween,
  listE2eSpecs,
  selectPreviewE2e
} from '../../scripts/select-preview-e2e.mjs'

const allSpecs = listE2eSpecs()

test('documentation-only changes do not deploy a preview Worker', () => {
  const plan = selectPreviewE2e([
    'README.md',
    'docs/testing-strategy.md'
  ], allSpecs)

  assert.equal(plan.runPreview, false)
  assert.equal(plan.scope, 'none')
  assert.deepEqual(plan.specs, [])
})

test('staging-review auth changes do not enter ordinary preview coverage', () => {
  const plan = selectPreviewE2e(['tests/e2e/staging-review-auth.spec.ts'], allSpecs)

  assert.equal(plan.runPreview, false)
  assert.equal(plan.scope, 'none')
  assert.deepEqual(plan.specs, [])
  assert.equal(allSpecs.includes('tests/e2e/staging-review-auth.spec.ts'), false)
})

test('a Saya presentation change runs only the relevant public tenant specs', () => {
  const plan = selectPreviewE2e([
    'components/saya/SayaHeader.vue'
  ], allSpecs)

  assert.equal(plan.runPreview, true)
  assert.equal(plan.scope, 'affected')
  assert.deepEqual(plan.groups, ['saya-public'])
  assert.deepEqual(plan.specs, [
    'tests/e2e/pottery-house.spec.ts',
    'tests/e2e/tenant-client-navigation.spec.ts'
  ])
  assert.equal(plan.specs.includes('tests/e2e/mcp-owner-tools.spec.ts'), false)
  assert.equal(plan.specs.includes('tests/e2e/billing-webhook-signed.spec.ts'), false)
})

test('dashboard changes restore the authenticated Pages lifecycle to preview coverage', () => {
  const plan = selectPreviewE2e([
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/pages.vue'
  ], allSpecs)

  assert.equal(plan.scope, 'affected')
  assert.ok(plan.groups.includes('dashboard'))
  assert.ok(plan.specs.includes('tests/e2e/dashboard.spec.ts'))
  assert.ok(plan.specs.includes('tests/e2e/dashboard-workflows.spec.ts'))
})

test('changing an E2E spec always selects that exact deployed-preview spec', () => {
  const plan = selectPreviewE2e([
    'tests/e2e/site-creation.spec.ts'
  ], allSpecs)

  assert.equal(plan.scope, 'affected')
  assert.deepEqual(plan.specs, ['tests/e2e/site-creation.spec.ts'])
})

test('schema, migration, Worker, and test-harness changes receive full coverage', () => {
  for (const path of [
    'server/db/schema.ts',
    'migrations/0121_example.sql',
    'scripts/reset-e2e-artifacts.ts',
    'workers/app-entry.ts',
    'tests/e2e/helpers/auth.ts'
  ]) {
    const plan = selectPreviewE2e([path], allSpecs)
    assert.equal(plan.scope, 'full', path)
    assert.deepEqual(plan.specs, allSpecs, path)
  }
})

test('an unclassified application source file fails safe to full coverage', () => {
  const plan = selectPreviewE2e([
    'server/utils/new-cross-cutting-runtime.ts'
  ], allSpecs)

  assert.equal(plan.scope, 'full')
  assert.deepEqual(plan.groups, ['unclassified-runtime'])
  assert.deepEqual(plan.unclassifiedFiles, ['server/utils/new-cross-cutting-runtime.ts'])
})

test('an unclassified root runtime file fails safe to full coverage', () => {
  const plan = selectPreviewE2e(['app.config.ts'], allSpecs)

  assert.equal(plan.scope, 'full')
  assert.deepEqual(plan.groups, ['unclassified-runtime'])
  assert.deepEqual(plan.unclassifiedFiles, ['app.config.ts'])
  assert.deepEqual(plan.specs, allSpecs)
})

test('deleting a mapped runtime file still selects its preview coverage', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'krabiclaw-e2e-impact-'))
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8'
  }).trim()

  try {
    git('init')
    git('config', 'user.name', 'E2E Impact Test')
    git('config', 'user.email', 'e2e-impact@playwright.example')
    await mkdir(join(repository, 'components/saya'), { recursive: true })
    await writeFile(join(repository, 'components/saya/RemovedBanner.vue'), '<template />\n')
    git('add', '.')
    git('commit', '-m', 'add mapped runtime file')
    const base = git('rev-parse', 'HEAD')
    await rm(join(repository, 'components/saya/RemovedBanner.vue'))
    git('add', '-A')
    git('commit', '-m', 'delete mapped runtime file')
    const head = git('rev-parse', 'HEAD')

    const changedFiles = changedFilesBetween(base, head, repository)
    assert.deepEqual(changedFiles, ['components/saya/RemovedBanner.vue'])

    const plan = selectPreviewE2e(changedFiles, allSpecs)
    assert.equal(plan.scope, 'affected')
    assert.deepEqual(plan.groups, ['saya-public'])
    assert.deepEqual(plan.specs, [
      'tests/e2e/pottery-house.spec.ts',
      'tests/e2e/tenant-client-navigation.spec.ts'
    ])
  } finally {
    await rm(repository, { recursive: true, force: true })
  }
})

test('every configured impact spec exists in the Playwright inventory', () => {
  const missing = IMPACT_GROUPS.flatMap(group => group.specs)
    .filter(spec => !allSpecs.includes(spec))

  assert.deepEqual(missing, [])
})
