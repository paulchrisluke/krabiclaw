import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import {
  buildStripeConnectOnboardingUrls,
  deriveStripeConnectStatus,
  ensureStripeConnectedAccount,
  getStripeConnectedAccount,
  projectStripeConnectedAccount,
  reserveStripeConnectedAccount,
} from '../../server/utils/stripe-connect.ts'
import { processStripeWebhookEvent } from '../../server/utils/stripe-webhook-events.ts'

async function withD1(run: (db: D1Database) => Promise<void>) {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'stripe-connect-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': {
      type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
    } } }, env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization(id,name,slug) VALUES('org','Org','org')").run()
    await run(db)
  } finally {
    await runtime.dispose()
  }
}

test('connected account reservation is organization-scoped and retry-stable', async () => {
  await withD1(async (db) => {
    const [first, second] = await Promise.all([
      reserveStripeConnectedAccount(db, { organizationId: 'org', country: 'US', livemode: false }),
      reserveStripeConnectedAccount(db, { organizationId: 'org', country: 'US', livemode: false }),
    ])
    assert.equal(first.id, second.id)
    assert.equal(first.status, 'creating')
    assert.equal(await db.prepare("SELECT count(*) FROM stripe_connected_accounts WHERE organization_id='org'").first('count(*)'), 1)
    await assert.rejects(
      reserveStripeConnectedAccount(db, { organizationId: 'org', country: 'GB', livemode: false }),
      /country cannot be changed/i,
    )
  })
})

test('connected accounts use Express dashboard with platform fee and loss responsibility', async () => {
  await withD1(async (db) => {
    let createParams: unknown
    let createOptions: unknown
    const stripe = {
      v2: { core: { accounts: { create: async (params: unknown, options: unknown) => {
        createParams = params
        createOptions = options
        throw new Error('stop after capturing account configuration')
      } } } },
    }

    await assert.rejects(
      ensureStripeConnectedAccount(db, stripe as never, {
        organizationId: 'org',
        organizationName: 'Org',
        contactEmail: 'owner@example.com',
        country: 'US',
        livemode: false,
      }),
      /stop after capturing account configuration/,
    )
    assert.deepEqual(
      createParams && typeof createParams === 'object'
        ? {
            dashboard: Reflect.get(createParams, 'dashboard'),
            responsibilities: Reflect.get(Reflect.get(createParams, 'defaults'), 'responsibilities'),
          }
        : null,
      {
        dashboard: 'express',
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
    )
    assert.deepEqual(createOptions, { idempotencyKey: 'krabiclaw-connect-account:express:org' })
  })
})

test('projection failures retain the created account for refresh on retry', async () => {
  await withD1(async (db) => {
    let createCalls = 0
    const retrievedAccountIds: string[] = []
    const stripe = {
      v2: { core: { accounts: {
        create: async () => {
          createCalls += 1
          return {
            id: 'acct_created',
            configuration: { merchant: { capabilities: { card_payments: { status: 'active' } } } },
            identity: null,
            requirements: { entries: [] },
          }
        },
        retrieve: async (accountId: string) => {
          retrievedAccountIds.push(accountId)
          return {
            id: accountId,
            livemode: false,
            configuration: { merchant: { capabilities: { card_payments: { status: 'active' } } } },
            identity: { country: 'us' },
            requirements: { entries: [] },
          }
        },
      } } },
    }

    const input = {
      organizationId: 'org',
      organizationName: 'Org',
      contactEmail: 'owner@example.com',
      country: 'US',
      livemode: false,
    }
    await assert.rejects(
      ensureStripeConnectedAccount(db, stripe as never, input),
      /country/i,
    )
    const reservation = await getStripeConnectedAccount(db, 'org')
    assert.ok(reservation)
    assert.equal(reservation.status, 'pending_review')
    assert.equal(reservation.stripeAccountId, 'acct_created')
    assert.equal(reservation.lastError, null)

    const recovered = await ensureStripeConnectedAccount(db, stripe as never, input)
    assert.equal(recovered.status, 'ready')
    assert.equal(createCalls, 1)
    assert.deepEqual(retrievedAccountIds, ['acct_created'])
  })
})

test('Stripe account projection preserves provider identity and derives onboarding state', async () => {
  await withD1(async (db) => {
    const reserved = await reserveStripeConnectedAccount(db, { organizationId: 'org', country: 'US', livemode: false })
    const actionRequired = deriveStripeConnectStatus({
      cardPaymentsStatus: 'pending',
      requirements: [{ awaitingActionFrom: 'user', deadlineStatus: 'currently_due' }],
    })
    assert.equal(actionRequired, 'action_required')

    await projectStripeConnectedAccount(db, {
      reservationId: reserved.id,
      organizationId: 'org',
      stripeAccountId: 'acct_test',
      country: 'US',
      livemode: false,
      cardPaymentsStatus: 'active',
      requirements: [],
      stripeRefreshedAt: '2026-09-12T12:00:00.000Z',
    })

    const connected = await getStripeConnectedAccount(db, 'org')
    assert.ok(connected)
    assert.equal(connected.stripeAccountId, 'acct_test')
    assert.equal(connected.status, 'ready')
    assert.equal(connected.cardPaymentsStatus, 'active')
    assert.deepEqual(connected.requirements, [])
  })
})

test('Connect callback URLs are built only from the configured platform origin and organization slug', () => {
  assert.deepEqual(
    buildStripeConnectOnboardingUrls('https://krabiclaw.com', 'sun-and-sea'),
    {
      returnUrl: 'https://krabiclaw.com/dashboard/sun-and-sea/settings/connect?stripe_connect=returned',
      refreshUrl: 'https://krabiclaw.com/api/dashboard/connect/refresh?org=sun-and-sea',
    },
  )
  assert.throws(() => buildStripeConnectOnboardingUrls('http://krabiclaw.com', 'sun-and-sea'), /HTTPS/)
  assert.throws(() => buildStripeConnectOnboardingUrls('https://krabiclaw.com/path', 'sun-and-sea'), /origin/)
})

test('Connect webhook work is claimed once across concurrent D1 deliveries', async () => {
  await withD1(async (db) => {
    let executions = 0
    const event = {
      id: 'evt_connect_test',
      type: 'v2.core.account.updated',
      payload: JSON.stringify({ id: 'evt_connect_test', type: 'v2.core.account.updated' }),
      processor: 'connect_marketplace' as const,
    }
    const work = async () => { executions += 1 }
    const results = await Promise.all([
      processStripeWebhookEvent(db, event, work),
      processStripeWebhookEvent(db, event, work),
    ])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(executions, 1)
    const row = await db.prepare("SELECT processor, status, attempt_count FROM stripe_webhook_events WHERE stripe_event_id='evt_connect_test'").first<{
      processor: string
      status: string
      attempt_count: number
    }>()
    assert.deepEqual(row, { processor: 'connect_marketplace', status: 'processed', attempt_count: 1 })
  })
})
