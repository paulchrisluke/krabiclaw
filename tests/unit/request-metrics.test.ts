import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import {
  finalizeTrackedRequestMetrics,
  flushRequestMetrics,
  getRequestDataMetrics,
  instrumentD1,
} from '../../server/utils/request-metrics.ts'

function completedRedirectEvent() {
  const headers = new Map<string, string>()
  let setHeaderCalls = 0
  const event = {
    path: '/tenant-icon',
    node: {
      req: { headers: {} },
      res: {
        headersSent: true,
        writableEnded: true,
        statusCode: 302,
        getHeader(name: string) {
          return headers.get(name.toLowerCase())
        },
        setHeader() {
          setHeaderCalls += 1
        },
      },
    },
  } as unknown as H3Event
  return { event, getSetHeaderCalls: () => setHeaderCalls }
}

test('completed redirects remain valid metrics records without late header writes or error logs', () => {
  const { event, getSetHeaderCalls } = completedRedirectEvent()
  const metrics = getRequestDataMetrics(event)
  const errors: unknown[][] = []
  const records: unknown[][] = []
  const originalError = console.error
  const originalInfo = console.info
  console.error = (...args: unknown[]) => errors.push(args)
  console.info = (...args: unknown[]) => records.push(args)

  try {
    finalizeTrackedRequestMetrics(event, '<!DOCTYPE html>')
    flushRequestMetrics(event, '<!DOCTYPE html>')
  } finally {
    console.error = originalError
    console.info = originalInfo
  }

  assert.equal(metrics.finalized, true)
  assert.equal(getSetHeaderCalls(), 0)
  assert.deepEqual(errors, [])
  assert.equal(records.length, 1)
  assert.equal(records[0]?.[0], '[data-request]')
  assert.match(String(records[0]?.[1]), /"status":302/)
})

test('D1 failures retain the nested provider cause without logging bound values', async () => {
  const { event } = completedRedirectEvent()
  event.path = '/api/auth/oauth2/token'
  event.node.req.headers = { 'cf-ray': 'test-ray-SIN' }
  const cause = new Error('D1 DB is overloaded. Requests queued for too long.')
  const failure = new Error('Failed query: SELECT * FROM oauthResource\nparams: customer-secret', { cause })
  const statement = {
    bind() { return this },
    async all() { throw failure },
  }
  const database = {
    prepare() { return statement },
  } as unknown as D1Database
  const records: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => records.push(args)

  try {
    await assert.rejects(
      instrumentD1(event, database)
        .prepare('SELECT * FROM "oauthResource" WHERE "identifier" = ?')
        .bind('customer-secret')
        .all(),
      failure,
    )
  } finally {
    console.error = originalError
  }

  assert.equal(records.length, 1)
  assert.equal(records[0]?.[0], '[d1-query]')
  const payload = JSON.parse(String(records[0]?.[1])) as Record<string, unknown>
  assert.equal(payload.event, 'd1_query_failed')
  assert.equal(payload.table, 'oauthResource')
  assert.equal(payload.ray_id, 'test-ray-SIN')
  assert.match(JSON.stringify(payload.error_chain), /Requests queued for too long/)
  assert.doesNotMatch(JSON.stringify(payload), /customer-secret/)
})
