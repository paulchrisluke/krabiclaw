import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { verifyProductionBaselineProvenance } from '../../scripts/verify-production-baseline-provenance.mjs'

const sourceSha = '0123456789abcdef0123456789abcdef01234567'
const workerVersionId = '01234567-89ab-cdef-0123-456789abcdef'

async function startFixture() {
  let redirect = false
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/api/deployment' })
      response.end()
      return
    }
    if (request.url !== '/api/deployment') {
      response.writeHead(404)
      response.end()
      return
    }
    if (redirect) {
      response.writeHead(302, { location: '/api/deployment?session=unexpected' })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      sourceSha,
      worker: { id: workerVersionId, tag: sourceSha, timestamp: '2026-08-08T00:00:00.000Z' },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    baseUrl,
    setRedirect(value: boolean) { redirect = value },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

async function writeMetadata(root: string) {
  const deploymentFile = join(root, 'deployment.json')
  const versionFile = join(root, 'version.json')
  await writeFile(deploymentFile, JSON.stringify({ latest_deployment: { versions: [{ id: workerVersionId, percentage: 100 }] } }))
  await writeFile(versionFile, JSON.stringify({ id: workerVersionId, tag: sourceSha }))
  return { deploymentFile, versionFile }
}

test('production baseline provenance requires the exact API origin and path', async () => {
  const fixture = await startFixture()
  const root = await mkdtemp(join(tmpdir(), 'krabiclaw-baseline-provenance-'))
  try {
    const files = await writeMetadata(root)
    const evidence = await verifyProductionBaselineProvenance({
      ...files,
      apiUrl: `${fixture.baseUrl}/api/deployment`,
      expectedVersionId: workerVersionId,
      workerName: 'krabiclaw',
    })
    assert.equal(evidence.status, 'verified')
    assert.equal(evidence.api.workerVersionId, workerVersionId)

    await assert.rejects(
      () => verifyProductionBaselineProvenance({
        ...files,
        apiUrl: `${fixture.baseUrl}/redirect`,
        expectedVersionId: workerVersionId,
        workerName: 'krabiclaw',
      }),
      /unexpected redirect/,
    )

    fixture.setRedirect(true)
    await assert.rejects(
      () => verifyProductionBaselineProvenance({
        ...files,
        apiUrl: `${fixture.baseUrl}/api/deployment`,
        expectedVersionId: workerVersionId,
        workerName: 'krabiclaw',
      }),
      /unexpected redirect/,
    )
  } finally {
    await fixture.close()
    await rm(root, { recursive: true, force: true })
  }
})
