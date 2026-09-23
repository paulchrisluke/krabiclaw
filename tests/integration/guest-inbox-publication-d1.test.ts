import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { publishDashboardInvalidation, publishGuestInboxThreadEvent } from '../../server/cloudflare/guest-inbox-events.ts'

test('inbox transport failures do not reject publication, while configuration, HTTP 4xx and D1 failures do', { timeout: 30_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'inbox-publication-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: `
      export class FaultHub {
        constructor(ctx) { this.ctx = ctx }
        async fetch(request) {
          if (new URL(request.url).pathname === '/observed') return Response.json(await this.ctx.storage.get('observed'))
          const event = await request.json()
          if (request.method !== 'POST' || new URL(request.url).pathname !== '/broadcast'
            || request.headers.get('x-krabiclaw-organization-id') !== event.organizationId) {
            throw new Error('Invalid publisher wire contract')
          }
          await this.ctx.storage.put('observed', event)
          if (event.organizationId === 'throws') throw new Error('Injected DO transport failure')
          if (event.organizationId === 'reset') this.ctx.abort('Injected DO storage reset')
          if (event.organizationId === 'unavailable') return new Response('Unavailable', { status: 503 })
          if (event.organizationId === 'forbidden') return new Response('Forbidden', { status: 403 })
          return new Response(null, { status: 204 })
        }
      }
      export default { fetch() { return new Response('proof') } }
    ` } } },
    exports: { FaultHub: { type: 'durable-object', storage: 'sqlite' } },
    env: {
      GUEST_INBOX_HUBS: { type: 'durable-object', workerName: 'inbox-publication-proof', exportName: 'FaultHub' },
      DB: { type: 'd1' },
    },
  } }] })

  try {
    const env = await runtime.getBindings<{ GUEST_INBOX_HUBS: DurableObjectNamespace }>()
    const namespace = env.GUEST_INBOX_HUBS
    const eventFor = (organizationId: string): Parameters<typeof publishDashboardInvalidation>[1] => ({
      eventId: crypto.randomUUID(), type: 'thread.changed', organizationId,
      locationId: null, threadId: 'proof-thread', occurredAt: new Date().toISOString(),
    })
    for (const mode of ['healthy', 'reset', 'throws', 'unavailable']) {
      const event = eventFor(mode)
      await assert.doesNotReject(() => publishDashboardInvalidation(env, event))
      if (mode === 'healthy') {
        const response = await namespace.get(namespace.idFromName(mode)).fetch('https://guest-inbox.internal/observed')
        assert.deepEqual(await response.json(), event)
      }
    }
    await assert.rejects(() => publishDashboardInvalidation(env, eventFor('forbidden')), /HTTP 403/)
    await assert.rejects(() => publishDashboardInvalidation({}, eventFor('healthy')), /binding is not configured/)
    const db = await runtime.getD1Database('DB')
    await assert.rejects(() => publishGuestInboxThreadEvent(env, db, {
      threadId: 'proof-thread', type: 'thread.changed',
    }), /Failed query/)
  } finally {
    await runtime.dispose()
  }
})
