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

const sourceSha = '0123456789abcdef0123456789abcdef01234567'
const workerVersionId = '01234567-89ab-cdef-0123-456789abcdef'
const buildId = '01234567-89ab-cdef-0123-456789abcdef'

async function startCandidateFixture({ versionId = workerVersionId, buildIdForRoutes = buildId } = {}) {
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

  const html = `<html><head><link rel="stylesheet" href="/_nuxt/surface.css"></head><body><script>buildId:"${buildIdForRoutes}"</script><script src="/_nuxt/app.js"></script></body></html>`
  const seenVersionOverrideHeaders = []
  const server = createServer((request, response) => {
    seenVersionOverrideHeaders.push(request.headers['cloudflare-workers-version-overrides'] ?? null)
    if (request.url === '/api/deployment') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        sourceSha,
        worker: { id: versionId, tag: sourceSha, timestamp: '2026-08-08T00:00:00.000Z' },
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
