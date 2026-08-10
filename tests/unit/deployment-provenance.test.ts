import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DeploymentProvenanceError,
  readDeploymentProvenance,
} from '../../server/utils/deployment-provenance.ts'

const sourceSha = '0123456789abcdef0123456789abcdef01234567'
const workerVersionId = '01234567-89ab-cdef-0123-456789abcdef'

function endpointEvent(context: Record<string, unknown>) {
  const headers = new Map<string, string | number | readonly string[]>()
  return {
    event: {
      context,
      node: {
        res: {
          setHeader(name: string, value: string | number | readonly string[]) {
            headers.set(name, value)
          },
        },
      },
    },
    headers,
  }
}

test('readDeploymentProvenance returns the exact source SHA and Worker metadata', () => {
  const result = readDeploymentProvenance({
    id: workerVersionId,
    tag: sourceSha,
    timestamp: '2026-08-08T00:00:00.000Z',
  })

  assert.deepEqual(result, {
    sourceSha,
    worker: {
      id: workerVersionId,
      tag: sourceSha,
      timestamp: '2026-08-08T00:00:00.000Z',
    },
  })
})

test('readDeploymentProvenance canonicalizes an uppercase Worker tag to lowercase', () => {
  const result = readDeploymentProvenance({
    id: workerVersionId,
    tag: sourceSha.toUpperCase(),
    timestamp: '2026-08-08T00:00:00.000Z',
  })

  assert.equal(result.sourceSha, sourceSha)
  assert.equal(result.worker.tag, sourceSha)
})

test('readDeploymentProvenance rejects missing or malformed version metadata', () => {
  for (const metadata of [
    undefined,
    { id: 'not-a-version-id', tag: sourceSha, timestamp: '2026-08-08T00:00:00.000Z' },
    { id: workerVersionId, tag: 'staging', timestamp: '2026-08-08T00:00:00.000Z' },
    { id: workerVersionId, tag: sourceSha, timestamp: 'not-a-timestamp' },
  ]) {
    assert.throws(
      () => readDeploymentProvenance(metadata),
      (error: unknown) => error instanceof DeploymentProvenanceError,
    )
  }
})

test('GET /api/deployment returns an explicit 503 when metadata is unavailable', async () => {
  const previousDefineEventHandler = globalThis.defineEventHandler
  globalThis.defineEventHandler = (handler: unknown) => handler

  try {
    const { default: handler } = await import(`../../server/api/deployment.get.ts?missing=${Date.now()}`)
    const { event } = endpointEvent({})
    await assert.rejects(
      async () => handler(event),
      (error: unknown) => {
        const candidate = error as { statusCode?: number }
        return candidate.statusCode === 503
      },
    )
  } finally {
    globalThis.defineEventHandler = previousDefineEventHandler
  }
})

test('GET /api/deployment succeeds from version metadata without a DB binding', async () => {
  const previousDefineEventHandler = globalThis.defineEventHandler
  globalThis.defineEventHandler = (handler: unknown) => handler

  try {
    const { default: handler } = await import(`../../server/api/deployment.get.ts?valid=${Date.now()}`)
    const { event, headers } = endpointEvent({
      cloudflare: {
        env: {
          CF_VERSION_METADATA: {
            id: workerVersionId,
            tag: sourceSha,
            timestamp: '2026-08-08T00:00:00.000Z',
          },
        },
      },
    })
    const result = await handler(event)

    assert.deepEqual(result, {
      sourceSha,
      worker: {
        id: workerVersionId,
        tag: sourceSha,
        timestamp: '2026-08-08T00:00:00.000Z',
      },
    })
    assert.equal(headers.get('cache-control'), 'no-store')
  } finally {
    globalThis.defineEventHandler = previousDefineEventHandler
  }
})

test('GET /api/deployment returns an explicit 503 for malformed version metadata', async () => {
  const previousDefineEventHandler = globalThis.defineEventHandler
  globalThis.defineEventHandler = (handler: unknown) => handler

  try {
    const { default: handler } = await import(`../../server/api/deployment.get.ts?malformed=${Date.now()}`)
    const { event } = endpointEvent({
      cloudflare: {
        env: {
          CF_VERSION_METADATA: {
            id: workerVersionId,
            tag: 'not-a-source-sha',
            timestamp: '2026-08-08T00:00:00.000Z',
          },
        },
      },
    })
    await assert.rejects(
      async () => handler(event),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 503,
    )
  } finally {
    globalThis.defineEventHandler = previousDefineEventHandler
  }
})
