import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import {
  finalizeTrackedRequestMetrics,
  flushRequestMetrics,
  getRequestDataMetrics,
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
