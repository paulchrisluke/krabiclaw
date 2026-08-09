import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  runVerifierCli,
  verifyDeployedCandidate,
} from '../../scripts/verify-deployed-candidate.mjs'
import { buildReleaseRouteInventory } from '../../scripts/release-route-inventory.mjs'
import {
  buildLegacyRollbackRouteInventory,
  LEGACY_ROLLBACK_TARGET_SHA,
} from '../../scripts/legacy-rollback-route-inventory-4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9.mjs'

const sourceSha = '0123456789abcdef0123456789abcdef01234567'
const workerVersionId = '01234567-89ab-cdef-0123-456789abcdef'
const buildId = '01234567-89ab-cdef-0123-456789abcdef'

async function startCandidateFixture({ versionId = workerVersionId, buildIdForRoutes = buildId, sourceShaForEndpoint = sourceSha } = {}) {
  const buildDir = await mkdtemp(join(tmpdir(), 'krabiclaw-build-'))
  await mkdir(join(buildDir, '_nuxt', 'builds', 'meta'), { recursive: true })
  await mkdir(join(buildDir, '_nuxt'), { recursive: true })
  await writeFile(join(buildDir, '_nuxt', 'builds', 'meta', `${buildIdForRoutes}.json`), '{}')
  const localAssets = {
    '/_nuxt/app.js': 'console.log("app")',
    '/_nuxt/surface.css': 'body{}',
  }
  await writeFile(join(buildDir, '_nuxt', 'app.js'), localAssets['/_nuxt/app.js'])
  await writeFile(join(buildDir, '_nuxt', 'surface.css'), localAssets['/_nuxt/surface.css'])

  const html = `<html><head><link rel="stylesheet" href="/_nuxt/surface.css"></head><body><main>Your local business Features About Plugin Templates Saya Blawby How can we help KrabiClaw Docs Local AI Growth Notes Privacy Terms Sign in Create your account Forgot password Authorize Third-party notices Ember &amp; Slice Pottery House Kikuzuki Menu Experiences Locations Reviews Questions Photos Contact North Carolina Access to Justice for All About Us Our Services Family law Small business Employment Tenant rights Probate and estate Special education Affordable, for everyone Contact Us Message received Request a Legal Consultation Our Blog Support Equal Access to Justice Privacy Policy Terms of Use Third-Party Notices Getting a Divorce in North Carolina Preparing for Your Consultation Property Division Writing Your Own Will Shape something beautiful Friday nights Throw on the wheel creative base Getting started with KrabiClaw Deploy your site Set a brand color Invite your team Set up notifications Connect KrabiClaw to ChatGPT</main><script>buildId:"${buildIdForRoutes}"</script><script src="/_nuxt/app.js"></script></body></html>`
  const redirects = new Map([
    ['/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', '/article/divorce-and-children-in-north-carolina'],
    ['/article/preparing-for-your-consultation', '/article/preparing-for-your-consultation-with-north-carolina-legal-services'],
    ['/article/property-division-in-north-carolina-divorce', '/article/property-division-in-north-carolina-divorce-protecting-whats-yours'],
    ['/article/writing-your-own-will-how-it-works-in-north-carolina', '/article/writing-your-own-will-how-it-works'],
  ])
  const seenVersionOverrideHeaders = []
  const seenRequestUrls = []
  const server = createServer((request, response) => {
    seenRequestUrls.push(request.url ?? '')
    seenVersionOverrideHeaders.push(request.headers['cloudflare-workers-version-overrides'] ?? null)
    if (new URL(request.url ?? '/', 'http://fixture.invalid').pathname === '/api/deployment') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        sourceSha: sourceShaForEndpoint,
        worker: { id: versionId, tag: sourceShaForEndpoint, timestamp: '2026-08-08T00:00:00.000Z' },
      }))
      return
    }
    if (request.url === `/_nuxt/builds/meta/${buildIdForRoutes}.json`) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{}')
      return
    }
    if (request.url === '/_nuxt/app.js' || request.url === '/_nuxt/surface.css') {
      response.writeHead(200)
      response.end(localAssets[request.url])
      return
    }
    if (request.url === '/reservations' && request.headers['x-preview-tenant'] === 'pottery-house') {
      response.writeHead(302, { location: '/experiences' })
      response.end()
      return
    }
    if (redirects.has(request.url)) {
      response.writeHead(301, { location: redirects.get(request.url)! })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(html)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  return {
    buildDir,
    baseUrl: `http://127.0.0.1:${address.port}`,
    seenVersionOverrideHeaders,
    seenRequestUrls,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

test('verifyDeployedCandidate proves endpoint provenance, one Nuxt build, metadata, and local assets', async () => {
  const fixture = await startCandidateFixture()

  try {
    const evidence = await verifyDeployedCandidate({
      baseUrl: fixture.baseUrl,
      expectedSha: sourceSha,
      expectedWorkerVersionId: workerVersionId,
      routes: ['/', '/dashboard'],
      buildDir: fixture.buildDir,
    })

    assert.equal(evidence.sourceSha, sourceSha)
    assert.equal(evidence.workerVersionId, workerVersionId)
    assert.equal(evidence.nuxtBuildId, buildId)
    assert.deepEqual(evidence.routes, ['/', '/dashboard'])
    assert.ok(fixture.seenRequestUrls.some(url => url.startsWith('/api/deployment?deployment-verification=')))
    assert.match(evidence.buildMetaSha256, /^[0-9a-f]{64}$/)
    assert.deepEqual(evidence.referencedAssetSha256.map((asset) => asset.path), ['/_nuxt/surface.css', '/_nuxt/app.js'])
    assert.ok(evidence.referencedAssetSha256.every((asset) => /^[0-9a-f]{64}$/.test(asset.sha256)))
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate applies the Cloudflare version override header and checks the expected Worker version', async () => {
  const fixture = await startCandidateFixture()

  try {
    await verifyDeployedCandidate({
      baseUrl: fixture.baseUrl,
      expectedSha: sourceSha,
      expectedWorkerVersionId: workerVersionId,
      workerName: 'krabiclaw',
      versionOverride: workerVersionId,
      buildDir: fixture.buildDir,
    })

    assert.ok(fixture.seenVersionOverrideHeaders.length > 0)
    assert.ok(fixture.seenVersionOverrideHeaders.every((value) => value === `krabiclaw="${workerVersionId}"`))
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate requires and verifies the platform, Saya, and Blawby route inventory', async () => {
  const fixture = await startCandidateFixture()

  try {
    const inventory = buildReleaseRouteInventory(fixture.baseUrl)
    const evidence = await verifyDeployedCandidate({
      baseUrl: fixture.baseUrl,
      expectedSha: sourceSha,
      expectedWorkerVersionId: workerVersionId,
      routeInventory: inventory,
      buildDir: fixture.buildDir,
    })

    assert.deepEqual(evidence.routeInventory.requiredSurfaces, ['platform', 'saya', 'blawby'])
    assert.deepEqual(
      [...new Set(evidence.routeEvidence.map((route) => route.surface))].sort(),
      ['blawby', 'platform', 'saya', 'saya/kikuzuki', 'saya/pottery-house'],
    )
    assert.equal(evidence.routeEvidence.length, inventory.surfaces.reduce((sum, surface) => sum + surface.routes.length + (surface.variants ?? []).reduce((variantSum, variant) => variantSum + variant.routes.length, 0), 0))
    assert.ok(evidence.routeEvidence.some((route) => route.redirects.length === 1))
    assert.ok(fixture.seenVersionOverrideHeaders.every((value) => value === null))
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate rejects an incomplete release route inventory', async () => {
  const fixture = await startCandidateFixture()

  try {
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routeInventory: {
          schemaVersion: 1,
          surfaces: [{ name: 'platform', baseUrl: fixture.baseUrl, routes: ['/'] }],
        },
        buildDir: fixture.buildDir,
      }),
      /missing required saya surface/,
    )
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate accepts the one-time legacy rollback inventory with normalized origin contracts', async () => {
  const fixture = await startCandidateFixture({ sourceShaForEndpoint: LEGACY_ROLLBACK_TARGET_SHA })

  try {
    const inventory = buildLegacyRollbackRouteInventory(fixture.baseUrl)
    const evidence = await verifyDeployedCandidate({
      baseUrl: fixture.baseUrl,
      expectedSha: LEGACY_ROLLBACK_TARGET_SHA,
      expectedWorkerVersionId: workerVersionId,
      routeInventory: inventory,
      buildDir: fixture.buildDir,
    })
    assert.equal(evidence.routeInventory?.inventoryKind, 'legacy-rollback-reviewed')
    assert.ok(inventory.surfaces.every(surface => surface.routes.every(route => route.expectedOrigin === new URL(surface.baseUrl).origin)))
    assert.ok(evidence.routeEvidence.every(route => route.expectedOrigin === new URL(route.baseUrl).origin))
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate rejects a route inventory for another origin or a weakened route set', async () => {
  const fixture = await startCandidateFixture()

  try {
    const wrongOrigin = buildReleaseRouteInventory('https://staging.example.com')
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routeInventory: wrongOrigin,
        buildDir: fixture.buildDir,
      }),
      /does not match the exact release route and origin contract/,
    )

    const weakened = buildReleaseRouteInventory(fixture.baseUrl)
    weakened.surfaces.find((surface) => surface.name === 'blawby')?.routes.pop()
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routeInventory: weakened,
        buildDir: fixture.buildDir,
      }),
      /does not match the exact release route and origin contract/,
    )
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate rejects route and redirect contracts containing query/hash components', async () => {
  const fixture = await startCandidateFixture()

  try {
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routes: ['/dashboard?session=1'],
        buildDir: fixture.buildDir,
      }),
      /may not contain a query or hash/,
    )

    const inventory = buildReleaseRouteInventory(fixture.baseUrl)
    const route = inventory.surfaces.find(surface => surface.name === 'blawby')?.routes.find(route => route.path === '/article/preparing-for-your-consultation')
    assert.ok(route)
    route.expectedPath = '/article/preparing-for-your-consultation?utm=1'
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routeInventory: inventory,
        buildDir: fixture.buildDir,
      }),
      /may not contain a query or hash|does not match the exact release route and origin contract/,
    )

    const redirectInventory = JSON.parse(JSON.stringify(buildReleaseRouteInventory(fixture.baseUrl))) as ReturnType<typeof buildReleaseRouteInventory>
    const redirectRoute = redirectInventory.surfaces.find(surface => surface.name === 'blawby')?.routes.find(route => route.allowRedirects.length > 0)
    assert.ok(redirectRoute)
    redirectRoute.allowRedirects[0].path = `${redirectRoute.allowRedirects[0].path}?utm=1`
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        routeInventory: redirectInventory,
        buildDir: fixture.buildDir,
      }),
      /may not contain a query or hash|does not match the exact release route and origin contract/,
    )
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate preserves an already-structured Cloudflare version override header', async () => {
  const fixture = await startCandidateFixture()

  try {
    await verifyDeployedCandidate({
      baseUrl: fixture.baseUrl,
      expectedSha: sourceSha,
      expectedWorkerVersionId: workerVersionId,
      versionOverrideHeader: `custom-worker="${workerVersionId}"`,
      buildDir: fixture.buildDir,
    })

    assert.ok(fixture.seenVersionOverrideHeaders.every((value) => value === `custom-worker="${workerVersionId}"`))
  } finally {
    await fixture.close()
  }
})

test('verify-deployed-candidate CLI writes machine-readable evidence', async () => {
  const fixture = await startCandidateFixture()
  const outputPath = join(await mkdtemp(join(tmpdir(), 'krabiclaw-evidence-')), 'candidate.json')

  try {
    await runVerifierCli([
      '--base-url', fixture.baseUrl,
      '--expected-source-sha', sourceSha,
      '--expected-version-id', workerVersionId,
      '--worker-name', 'krabiclaw',
      '--version-override', workerVersionId,
      '--routes', '/,/dashboard',
      '--local-build-dir', fixture.buildDir,
      '--output-json', outputPath,
    ])

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(evidence.ok, true)
    assert.equal(evidence.sourceSha, sourceSha)
    assert.equal(evidence.workerVersionId, workerVersionId)
    assert.ok(fixture.seenVersionOverrideHeaders.every((value) => value === `krabiclaw="${workerVersionId}"`))
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate fails when the expected Worker version is not serving', async () => {
  const fixture = await startCandidateFixture()

  try {
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        expectedWorkerVersionId: 'fedcba98-7654-3210-fedc-ba9876543210',
        buildDir: fixture.buildDir,
      }),
      /Expected Worker version fedcba98-7654-3210-fedc-ba9876543210/,
    )
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate fails when the local production build lacks a referenced asset', async () => {
  const fixture = await startCandidateFixture()

  try {
    await unlink(join(fixture.buildDir, '_nuxt', 'app.js'))
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        buildDir: fixture.buildDir,
      }),
      /Local production build is missing referenced asset \/_nuxt\/app.js/,
    )
  } finally {
    await fixture.close()
  }
})

test('verifyDeployedCandidate fails when deployed and local asset bytes differ', async () => {
  const fixture = await startCandidateFixture()

  try {
    await writeFile(join(fixture.buildDir, '_nuxt', 'app.js'), 'different bytes')
    await assert.rejects(
      () => verifyDeployedCandidate({
        baseUrl: fixture.baseUrl,
        expectedSha: sourceSha,
        buildDir: fixture.buildDir,
      }),
      /differs between the deployed Worker and local production build/,
    )
  } finally {
    await fixture.close()
  }
})
