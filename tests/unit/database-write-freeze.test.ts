import assert from 'node:assert/strict'
import test from 'node:test'
import databaseWriteFreezeMiddleware from '../../server/middleware/00.database-write-freeze.ts'
import { isDatabaseWriteFrozen, retryFrozenQueueBatch } from '../../server/utils/database-write-freeze.ts'

test('database write freeze is enabled only by the exact true flag', () => {
  assert.equal(isDatabaseWriteFrozen(undefined), false)
  assert.equal(isDatabaseWriteFrozen({}), false)
  assert.equal(isDatabaseWriteFrozen({ DB_WRITE_FROZEN: 'false' }), false)
  assert.equal(isDatabaseWriteFrozen({ DB_WRITE_FROZEN: 'TRUE' }), false)
  assert.equal(isDatabaseWriteFrozen({ DB_WRITE_FROZEN: 'true' }), true)
})

test('frozen queue batches are retried with a delay instead of being processed', () => {
  const calls: unknown[] = []
  const batch = {
    retryAll(options?: unknown) {
      calls.push(options)
    },
  }

  assert.equal(retryFrozenQueueBatch({}, batch), false)
  assert.deepEqual(calls, [])
  assert.equal(retryFrozenQueueBatch({ DB_WRITE_FROZEN: 'true' }, batch), true)
  assert.deepEqual(calls, [{ delaySeconds: 300 }])
})

test('HTTP requests receive a non-cacheable maintenance response while frozen', async () => {
  const event = {
    req: {
      runtime: {
        cloudflare: {
          env: { DB_WRITE_FROZEN: 'true' },
        },
      },
    },
  }

  const response = await databaseWriteFreezeMiddleware(event as never) as Response
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('retry-after'), '300')
  assert.deepEqual(await response.json(), {
    error: 'Service temporarily unavailable during database maintenance',
  })
})

test('HTTP requests continue normally when the freeze is disabled', async () => {
  const event = {
    req: {
      runtime: {
        cloudflare: {
          env: {},
        },
      },
    },
  }

  assert.equal(await databaseWriteFreezeMiddleware(event as never), undefined)
})
