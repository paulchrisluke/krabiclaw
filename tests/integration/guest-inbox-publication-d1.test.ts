import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { publishDashboardInvalidation, publishGuestInboxThreadEvent } from '../../server/cloudflare/guest-inbox-events.ts'
import { createCanonicalNotification } from '../../server/utils/notification-center.ts'

test('every way the inbox hub can fail rejects publication, not just the ones that answered 4xx', { timeout: 30_000 }, async () => {
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
      GUEST_INBOX_HUBS: { type: 'durable-object', worker: 'inbox-publication-proof', exportName: 'FaultHub' },
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
    const healthy = eventFor('healthy')
    await assert.doesNotReject(() => publishDashboardInvalidation(env, healthy))
    const observed = await namespace.get(namespace.idFromName('healthy')).fetch('https://guest-inbox.internal/observed')
    assert.deepEqual(await observed.json(), healthy)

    // This broadcast is how an open dashboard learns a booking arrived, so a hub
    // that could not deliver it must not read as a delivery. Transport throws, a
    // storage reset and a 503 used to resolve here while only the 403 rejected,
    // which meant the failures that indicate the hub is actually broken were the
    // ones the caller never heard about.
    await assert.rejects(() => publishDashboardInvalidation(env, eventFor('throws')), /Injected DO transport failure/)
    await assert.rejects(() => publishDashboardInvalidation(env, eventFor('reset')), /Injected DO storage reset/)
    await assert.rejects(() => publishDashboardInvalidation(env, eventFor('unavailable')), /HTTP 503/)
    await assert.rejects(() => publishDashboardInvalidation(env, eventFor('forbidden')), /HTTP 403/)
    await assert.rejects(() => publishDashboardInvalidation({}, eventFor('healthy')), /binding is not configured/)
    const db = await runtime.getD1Database('DB')
    await assert.rejects(() => publishGuestInboxThreadEvent(env, db, {
      threadId: 'proof-thread', type: 'thread.changed',
    }), /Failed query/)

    await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))).map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization (id,name,slug) VALUES ('healthy','Healthy','healthy')").run()
    const notification = {
      scope: 'organization' as const, organizationId: 'healthy', template: 'payments.usage_invoice_paid',
      title: 'Payments invoice paid', message: '$1.40 USD paid', idempotencyKey: 'native-invoice-paid',
    }
    await assert.rejects(() => createCanonicalNotification(db, { ...notification, publishEnv: {} }), /binding is not configured/)
    const persisted = await db.prepare("SELECT id,scope_kind,organization_id,event_name,body FROM activity_entries WHERE dedupe_key='notification:native-invoice-paid'").first()
    assert(persisted)
    assert.deepEqual(persisted, { id: 'native-invoice-paid', scope_kind: 'organization', organization_id: 'healthy', event_name: 'payments.usage_invoice_paid', body: '$1.40 USD paid' })
    assert.equal((await (await namespace.get(namespace.idFromName('healthy')).fetch('https://guest-inbox.internal/observed')).json()).type, 'thread.changed')

    const replayId = await createCanonicalNotification(db, { ...notification, publishEnv: env })
    assert.equal(replayId, persisted.id)
    const published = await (await namespace.get(namespace.idFromName('healthy')).fetch('https://guest-inbox.internal/observed')).json()
    assert.equal(published.type, 'notification.created')
    assert.equal(published.organizationId, 'healthy')
    assert.equal(published.targetUserId, null)
    assert.equal(await db.prepare("SELECT count(*) n FROM activity_entries WHERE dedupe_key='notification:native-invoice-paid'").first('n'), 1)
    assert.equal(await createCanonicalNotification(db, { ...notification, publishEnv: env }), persisted.id)
    const repeated = await (await namespace.get(namespace.idFromName('healthy')).fetch('https://guest-inbox.internal/observed')).json()
    assert.equal(repeated.type, 'notification.created')
    assert.notEqual(repeated.eventId, published.eventId, 'an idempotent row replay still publishes its invalidation')
    assert.equal(await db.prepare("SELECT count(*) n FROM activity_entries WHERE kind='notification'").first('n'), 1)
  } finally {
    await runtime.dispose()
  }
})
