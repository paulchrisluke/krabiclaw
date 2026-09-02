import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { parseMerchantCommand, type MerchantCommandType } from '../../server/domain/merchant-handoff/contract.ts'
import {
  executeMerchantHandoffCommand,
  notifyMerchantHandoffOrder,
  readMerchantHandoffOrder,
} from '../../server/utils/merchant-handoff.ts'

const scope = {
  organizationId: 'org-contract',
  siteId: 'site-contract',
  locationId: 'location-contract',
}
const providerMappings = {
  provider: 'contract-receiver',
  location_id: 'provider-location-contract',
  order_id: 'provider-order-contract',
}

async function migratedDatabase() {
  const runtime = new Miniflare({
    compatibilityDate: '2026-07-28',
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: { DB: crypto.randomUUID() },
  })
  const database = await runtime.getD1Database('DB')
  const migrationFiles = (await readdir('migrations')).filter(file => file.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    const statements = (await readFile(`migrations/${file}`, 'utf8'))
      .split('--> statement-breakpoint')
      .map(statement => statement.trim())
      .filter(Boolean)
    for (const statement of statements) await database.prepare(statement).run()
  }
  await database.exec(`
    INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya');
    INSERT INTO user (id, name, email, emailVerified) VALUES ('user-contract', 'Contract owner', 'contract@example.com', 1);
    INSERT INTO organization (id, name, slug) VALUES ('org-contract', 'Contract organization', 'contract-organization');
    INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site-contract', 'org-contract', 'contract-site', 'contract-site');
    INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location-contract', 'org-contract', 'site-contract', 'contract-location', 'Contract location');
  `)
  return { runtime, database }
}

function snapshot(orderId: string) {
  return {
    id: orderId,
    version: 1,
    currency: 'THB',
    total_minor: 34700,
    line_items: [{ id: `${orderId}-line-1`, product_id: 'product-1', price_id: 'price-1', name: 'Green curry', quantity: 1, amount_minor: 34700 }],
  }
}

function command(
  orderId: string,
  type: MerchantCommandType,
  stateVersion: number,
  commandSnapshot: Record<string, string | null>,
  suffix = type,
) {
  return parseMerchantCommand({
    id: `${orderId}-command-${suffix}`,
    version: 1,
    type,
    resource: { id: orderId, version: 1 },
    expected_state_version: stateVersion,
    provider_mappings: { ...providerMappings, order_id: `provider-${orderId}` },
    idempotency_key: `${orderId}:${suffix}`,
    snapshot: commandSnapshot,
  })
}

test('contract receiver follows notification, authoritative fetch, command, and status with replay safety', async () => {
  const { runtime, database } = await migratedDatabase()
  const notifications: Array<Record<string, unknown>> = []
  const receiverFailures: Error[] = []
  const receiver = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const notification = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      notifications.push(notification)
      const resource = notification.resource as { id: string; version: number }
      assert.deepEqual(notification.snapshot, { order_id: resource.id, order_version: resource.version })
      assert.equal(JSON.stringify(notification).includes('Green curry'), false)

      const fetched = await readMerchantHandoffOrder(database, resource.id)
      assert.ok(fetched)
      assert.equal(fetched.snapshot.line_items instanceof Array, true)
      assert.equal(fetched.integration_delivery.status, 'pending')

      if (resource.id === 'order-provider-error') {
        response.writeHead(503).end()
        return
      }
      if (resource.id === 'order-denied') {
        const denied = await executeMerchantHandoffCommand(database, command(resource.id, 'deny', 1, {
          denied_at: '2026-09-02T12:01:00.000Z',
          reason_code: 'merchant_closed',
          reason: 'Kitchen closed early',
        }))
        assert.equal(denied.ok && denied.status, 'denied')
      } else if (resource.id === 'order-cancelled') {
        assert.equal((await executeMerchantHandoffCommand(database, command(resource.id, 'accept', 1, { accepted_at: '2026-09-02T12:01:00.000Z' }))).ok, true)
        assert.equal((await executeMerchantHandoffCommand(database, command(resource.id, 'cancel', 2, {
          cancelled_at: '2026-09-02T12:02:00.000Z',
          reason_code: 'merchant_cancelled',
          reason: null,
        }))).ok, true)
      } else {
        const acceptedCommand = command(resource.id, 'accept', 1, { accepted_at: '2026-09-02T12:01:00.000Z' })
        const accepted = await executeMerchantHandoffCommand(database, acceptedCommand)
        assert.equal(accepted.ok && accepted.status, 'applied')
        const replay = await executeMerchantHandoffCommand(database, acceptedCommand)
        assert.equal(replay.ok, true)
        assert.equal(replay.replayed, true)
        const conflictingCommand = parseMerchantCommand({
          ...acceptedCommand,
          id: `${resource.id}-command-accept-conflict`,
          snapshot: { accepted_at: '2026-09-02T12:02:00.000Z' },
        })
        await assert.rejects(
          executeMerchantHandoffCommand(database, conflictingCommand),
          /idempotency key/i,
        )
        assert.equal((await executeMerchantHandoffCommand(database, command(resource.id, 'ready_time_update', 2, { ready_at: '2026-09-02T12:20:00.000Z' }))).ok, true)
        assert.equal((await executeMerchantHandoffCommand(database, command(resource.id, 'ready', 3, { ready_at: '2026-09-02T12:18:00.000Z' }))).ok, true)
        assert.equal((await executeMerchantHandoffCommand(database, command(resource.id, 'complete', 4, { completed_at: '2026-09-02T12:25:00.000Z' }))).ok, true)
      }

      const status = await readMerchantHandoffOrder(database, resource.id)
      assert.ok(status)
      assert.notEqual(status.merchant.merchant_state, 'pending')
      response.writeHead(204).end()
    } catch (error) {
      receiverFailures.push(error instanceof Error ? error : new Error(String(error)))
      response.writeHead(500).end()
    }
  })

  await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve))
  const address = receiver.address()
  assert.ok(address && typeof address === 'object')
  const endpoint = `http://127.0.0.1:${address.port}/notifications`
  const capabilities = ['order_notification', 'order_fetch', 'order_accept', 'order_deny', 'ready_time_update', 'order_ready', 'order_cancel', 'order_complete']
  await database.prepare(`INSERT INTO merchant_handoff_destinations
    (id, organization_id, site_id, location_id, version, status, endpoint_url, oauth_client_id, provider, provider_location_id, capabilities_json, created_by)
    VALUES (?, ?, ?, ?, 1, 'active', ?, 'oauth-client-contract', ?, ?, ?, 'user-contract')`).bind(
    'destination-contract', scope.organizationId, scope.siteId, scope.locationId, endpoint,
    providerMappings.provider, providerMappings.location_id, JSON.stringify(capabilities),
  ).run()

  try {
    const notify = async (orderId: string) => await notifyMerchantHandoffOrder(database, {
      ...scope,
      orderId,
      orderVersion: 1,
      providerOrderId: `provider-${orderId}`,
      orderSnapshot: snapshot(orderId),
      idempotencyKey: `${orderId}:notification:1`,
      resourceBaseUrl: 'https://krabiclaw.test',
      allowLocalEndpoint: true,
      fetcher: (request, init) => fetch(request, { ...init, signal: AbortSignal.timeout(30_000) }),
    })

    const completed = await notify('order-completed')
    assert.equal(completed.ok, true, JSON.stringify({ completed, receiverFailures: receiverFailures.map(error => error.message) }))
    assert.equal(completed.order.integration_delivery.status, 'delivered')
    assert.equal(completed.order.merchant.fulfillment_state, 'completed')
    const replay = await notify('order-completed')
    assert.equal(replay.ok, true)
    assert.equal(replay.replayed, true)
    assert.equal(notifications.filter(item => (item.resource as { id: string }).id === 'order-completed').length, 1)

    const denied = await notify('order-denied')
    assert.equal(denied.ok, true)
    assert.equal(denied.order.merchant.merchant_state, 'denied')

    const cancelled = await notify('order-cancelled')
    assert.equal(cancelled.ok, true)
    assert.equal(cancelled.order.merchant.merchant_state, 'cancelled')

    const providerError = await notify('order-provider-error')
    assert.equal(providerError.ok, false)
    if (!providerError.ok) assert.equal(providerError.code, 'provider_http_error')
    assert.equal(providerError.order.integration_delivery.status, 'failed')
    assert.equal(providerError.order.merchant.merchant_state, 'pending')
    const providerErrorReplay = await notify('order-provider-error')
    assert.equal(providerErrorReplay.ok, false)
    assert.equal(providerErrorReplay.replayed, true)
    assert.equal(notifications.filter(item => (item.resource as { id: string }).id === 'order-provider-error').length, 1)

    await assert.rejects(
      database.prepare(`INSERT INTO merchant_handoff_destinations
        (id, organization_id, site_id, location_id, version, status, endpoint_url, oauth_client_id, provider, provider_location_id, capabilities_json, created_by)
        VALUES ('destination-second', 'org-contract', 'site-contract', 'location-contract', 2, 'active', ?, 'oauth-client-second', 'second', 'second-location', ?, 'user-contract')`).bind(endpoint, JSON.stringify(capabilities)).run(),
      /UNIQUE constraint failed/,
    )
    assert.deepEqual(receiverFailures, [])
    const foreignKeys = await database.prepare('PRAGMA foreign_key_check').all()
    assert.equal(foreignKeys.results.length, 0)
  } finally {
    await new Promise<void>((resolve, reject) => receiver.close(error => error ? reject(error) : resolve()))
    await runtime.dispose()
  }
})
