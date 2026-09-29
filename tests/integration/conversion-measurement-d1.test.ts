import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { handleStripeGa4Event, withdrawStripeGaIdentifiers } from '../../server/utils/stripe-ga4.ts'
import { PLATFORM_TEMPLATE } from '../../utils/template-registry.ts'
import { originatingOwnerId, recordAndDeliverConversion, recordOrganizationConversionEvent as recordAt, type OrganizationConversionInput } from '../../server/utils/organization-conversions.ts'
import { getAnalyticsReport } from '../../server/utils/analytics-report.ts'
import { recordTenantPageview, type TenantPageviewInput } from '../../server/utils/pageview-tracking.ts'

const SESSION = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
// Events are recorded inside the reported range, at their own occurrence time.
const recordOrganizationConversionEvent = (db: Parameters<typeof recordAt>[0], origin: Parameters<typeof recordAt>[1], input: OrganizationConversionInput) =>
  recordAt(db, origin, { occurredAt: '2026-09-10T04:00:00.000Z', ...input })
const browser = { headers: new Headers({ cookie: `kc_session_id=${SESSION}; kc_visitor_id=${VISITOR}`, 'user-agent': 'Desktop' }) }

async function openDb() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'conversion-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  return { runtime, db }
}

test('conversion measurement: contract, values, idempotency, report and cohort on D1', { timeout: 60_000 }, async () => {
  const { runtime, db } = await openDb()
  try {
    const settings = '{"config":{"default_timezone":"Asia/Bangkok"}}'
    for (const id of ['org-platform', 'org-customer']) {
      await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json) VALUES (?, ?, ?, ?, ?)`).bind(id, id, id, id, settings).run()
    }
    for (const id of ['user-a', 'user-b']) {
      await db.prepare(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`).bind(id, id, `${id}@example.com`).run()
    }
    await db.prepare(`INSERT INTO member (id, "organizationId", "userId", role) VALUES ('m1', 'org-customer', 'user-a', 'owner')`).run()

    // A visitor lands from a campaign; their signup carries that session's snapshot.
    const landing: TenantPageviewInput = {
      eventId: 'pv-1', organizationId: 'org-platform', pagePath: '/', locale: 'en', referrerHost: null,
      attribution: { utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'launch', utm_content: 'video-a' },
      internalHosts: ['platform.example'], userAgent: 'Desktop', ipHash: 'h', sessionId: SESSION, visitorId: VISITOR,
      country: 'th', region: null, city: null, locationId: null, pageId: null, pageType: 'home', recipe: null, now: '2026-09-10T03:00:00.000Z',
    }
    await recordTenantPageview(db, landing)

    const signup = { organizationId: 'org-platform', eventName: 'sign_up', stage: 'completed', surface: 'auth', entityType: 'user', entityId: 'user-a' } as const
    const [first, second] = await Promise.all([recordOrganizationConversionEvent(db, browser, signup), recordOrganizationConversionEvent(db, browser, signup)])
    assert.equal(first.id, second.id, 'a repeated signup returns the persisted identity')
    assert.equal([first.created, second.created].filter(Boolean).length, 1)
    const snapshot = JSON.parse(await db.prepare("SELECT payload_json FROM analytics_events WHERE id = ?").bind(first.id).first<string>('payload_json') ?? '{}')
    assert.equal(snapshot.attribution.campaign, 'launch')
    assert.equal(snapshot.attribution.content, 'video-a')

    // No visitor context: a nonbrowser outcome, never a minted session.
    const onboarding = await recordOrganizationConversionEvent(db, null, { organizationId: 'org-platform', eventName: 'onboarding_complete', stage: 'completed', surface: 'dashboard', entityType: 'organization', entityId: 'org-customer', metadata: { originating_user_id: 'user-a' } })
    const onboardingRow = await db.prepare("SELECT session_id, visitor_id, json_extract(payload_json, '$.attribution') attribution FROM analytics_events WHERE id = ?").bind(onboarding.id).first<Record<string, unknown>>()
    assert.deepEqual(onboardingRow, { session_id: null, visitor_id: null, attribution: null })
    assert.equal(await db.prepare("SELECT count(*) FROM analytics_summaries WHERE kind = 'session'").first('count(*)'), 1)

    // Purchases: value excludes tax, collected includes it; a redelivery is the same event.
    const purchase = {
      organizationId: 'org-platform', eventName: 'purchase', stage: 'completed', surface: 'stripe', entityType: 'invoice', entityId: 'in_1',
      occurredAt: '2026-09-11T03:00:00.000Z',
      value: { basis: 'purchase', amount_minor: 4900, collected_minor: 5243, currency: 'USD', transaction_id: 'in_1' },
      // The checkout observed this campaign; the webhook that records the payment carries it.
      attribution: { touch: { source: 'meta', medium: 'paid', campaign: 'launch', term: null, content: 'video-a', referrerHost: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null }, attributedAt: '2026-09-10T03:30:00.000Z' },
      metadata: { purchase_type: 'initial_subscription', subscribing_organization_id: 'org-customer', originating_user_id: 'user-a' },
    } as const
    const paid = await recordOrganizationConversionEvent(db, null, purchase)
    assert.deepEqual(await recordOrganizationConversionEvent(db, null, purchase), { id: paid.id, created: false })

    // Two partial refunds of one invoice are two events; a redelivered refund is not a third.
    const refund = (id: string, amount: number) => ({ organizationId: 'org-platform', eventName: 'refund', stage: 'completed', surface: 'stripe', entityType: 'refund', entityId: id, value: { basis: 'refund', amount_minor: amount, collected_minor: amount, currency: 'USD', transaction_id: 'in_1' }, attribution: purchase.attribution, metadata: { originating_user_id: 'user-a' } }) as const
    await recordOrganizationConversionEvent(db, null, refund('re_1', 1000))
    await recordOrganizationConversionEvent(db, null, refund('re_2', 500))
    await recordOrganizationConversionEvent(db, null, refund('re_1', 1000))
    assert.equal(await db.prepare("SELECT count(*) FROM analytics_events WHERE json_extract(payload_json, '$.event_name') = 'refund'").first('count(*)'), 2)

    // The catalog refuses values an event cannot carry and unpriced purchases.
    await assert.rejects(recordOrganizationConversionEvent(db, null, { ...signup, entityId: 'user-b', value: { basis: 'purchase', amount_minor: 1, currency: 'USD', transaction_id: 'x' } }), /cannot carry/)
    await assert.rejects(recordOrganizationConversionEvent(db, null, { ...purchase, entityId: 'in_2', value: { basis: 'purchase', amount_minor: 1, currency: 'USD' } }), /transaction identity/)
    // The schema refuses a conversion that is neither a full browser event nor a full nonbrowser one.
    await assert.rejects(db.prepare(`INSERT INTO analytics_events (id, kind, organization_id, session_id, visitor_id, payload_json)
      VALUES ('mixed', 'conversion', 'org-platform', 's', NULL, '{"event_name":"sign_up","stage":"completed","attribution":null,"attributed_at":null}')`).run(), /CHECK constraint failed/)

    // A priced and an unpriced booking on a customer site: value is known or absent, never invented.
    await recordOrganizationConversionEvent(db, null, { organizationId: 'org-customer', eventName: 'booking_submit', stage: 'submitted', surface: 'website', entityType: 'request', entityId: 'req-1', pageType: 'product',
      value: { basis: 'quoted', amount_minor: 240000, currency: 'THB', items: [{ item_id: 'prod-1', item_name: 'Pottery', item_variant: 'Adult', price_minor: 120000, quantity: 2 }] } })
    await recordOrganizationConversionEvent(db, null, { organizationId: 'org-customer', eventName: 'booking_submit', stage: 'submitted', surface: 'website', entityType: 'request', entityId: 'req-2', pageType: 'product' })

    const period = { startDate: '2026-09-10', endDate: '2026-09-12', now: new Date('2026-09-13T00:00:00Z') }
    const platform = await getAnalyticsReport(db, { organizationId: 'org-platform', ...period })
    // One session, one signup: the session converted once; the purchase and onboarding have no session.
    const signupRow = platform.conversions.find(row => row.eventName === 'sign_up')
    assert.deepEqual([signupRow?.events, signupRow?.distinctEntities, signupRow?.convertingSessions, signupRow?.sessionConversionRate], [1, 1, 1, 100])
    assert.equal(platform.conversions.find(row => row.eventName === 'onboarding_complete')?.nonbrowserEvents, 1)
    // Revenue is attributed to the campaign and creative the checkout observed, without a browser session.
    assert.deepEqual(platform.attributedValue.map(row => [row.campaign, row.content, row.currency, row.purchases, row.collectedMinor, row.refundedMinor, row.netMinor]), [['launch', 'video-a', 'USD', 1, 5243, 1500, 3743]])
    assert.equal(await db.prepare("SELECT count(*) FROM analytics_events WHERE json_extract(payload_json, '$.event_name') = 'purchase' AND session_id IS NULL").first('count(*)'), 1)
    assert.equal(platform.conversions.find(row => row.eventName === 'purchase')?.sessionConversionRate, 0)
    assert.deepEqual(platform.attribution.map(row => [row.campaign, row.content, row.sessions, row.outcomeEvents, row.convertingSessions, row.sessionConversionRate]), [['launch', 'video-a', 1, 1, 1, 100]])
    assert.deepEqual(platform.values.find(row => row.eventName === 'purchase'), { eventName: 'purchase', basis: 'purchase', currency: 'USD', events: 1, valueMinor: 4900, collectedMinor: 5243 })
    assert.deepEqual(platform.net, [{ currency: 'USD', collectedMinor: 5243, refundedMinor: 1500, netMinor: 3743 }])
    assert.deepEqual(platform.signupCohort.bySignupAttribution[0]?.revenue, [{ currency: 'USD', collectedMinor: 5243, refundedMinor: 1500, netMinor: 3743 }])
    // The signup cohort links signup -> owned organization -> onboarding and first payment, counted per signup.
    assert.deepEqual([platform.signupCohort.signups, platform.signupCohort.onboardedSignups, platform.signupCohort.firstPaidSignups], [1, 1, 1])
    assert.equal(platform.signupCohort.bySignupAttribution[0]?.campaign, 'launch')
    assert.deepEqual([platform.signupCohort.onboardedBusinesses, platform.signupCohort.firstPaidBusinesses], [1, 1])
    // Only the nonbrowser onboarding carried no observed attribution.
    assert.equal(platform.coverage.outcomeEventsWithoutAttribution, 1)
    assert.ok(platform.coverage.measurementContractStartedAt)
    assert.deepEqual(platform.coverage.ga4Delivery.map(row => [row.eventName, row.status]).sort(), [['onboarding_complete', 'unrecorded'], ['purchase', 'unrecorded'], ['refund', 'unrecorded'], ['sign_up', 'unrecorded']])

    const customer = await getAnalyticsReport(db, { organizationId: 'org-customer', ...period })
    assert.deepEqual(customer.bookingValue.map(row => [row.productName, row.currency, row.bookings, row.valuedBookings, row.quotedValueMinor]).sort(), [['Pottery', 'THB', 1, 1, 240000], [null, null, 1, 0, 0]].sort())
    assert.deepEqual(customer.net, [])
    assert.equal(customer.signupCohort.signups, 0)
    // KrabiClaw's subscription revenue never appears as the subscribing customer's revenue.
    assert.equal(customer.values.some(row => row.basis !== 'quoted'), false)
  } finally { await runtime.dispose() }
})

test('attribution rates share one population; cohorts follow the acquiring owner and timing', { timeout: 60_000 }, async () => {
  const { runtime, db } = await openDb()
  try {
    const settings = '{"config":{"default_timezone":"Asia/Bangkok"}}'
    for (const id of ['org-platform', 'org-paying', 'org-new']) {
      await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json) VALUES (?, ?, ?, ?, ?)`).bind(id, id, id, id, settings).run()
    }
    for (const id of ['owner', 'newcomer', 'founder']) await db.prepare(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`).bind(id, id, `${id}@example.com`).run()
    const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
    const page = (sessionN: number, campaign: string, at: string): TenantPageviewInput => ({
      eventId: `pv-${sessionN}-${campaign}`, organizationId: 'org-platform', pagePath: '/', locale: 'en', referrerHost: null,
      attribution: { utm_source: 'meta', utm_medium: 'paid', utm_campaign: campaign }, internalHosts: ['platform.example'], userAgent: 'Desktop', ipHash: 'h',
      sessionId: uuid(sessionN), visitorId: uuid(100 + sessionN), country: 'th', region: null, city: null, locationId: null, pageId: null, pageType: 'home', recipe: null, now: at,
    })
    const cookies = (sessionN: number) => ({ headers: new Headers({ cookie: `kc_session_id=${uuid(sessionN)}; kc_visitor_id=${uuid(100 + sessionN)}` }) })
    // Sessions 1-2 land on A and convert; session 3 lands on A and does not. Sessions 1-2 are later touched by B.
    for (const n of [1, 2, 3]) await recordTenantPageview(db, page(n, 'A', '2026-09-10T03:00:00.000Z'))
    for (const n of [1, 2]) {
      await recordAt(db, cookies(n), { organizationId: 'org-platform', eventName: 'sign_up', stage: 'completed', surface: 'auth', entityType: 'user', entityId: `user-${n}`, occurredAt: '2026-09-10T03:30:00.000Z' })
      await recordTenantPageview(db, page(n, 'B', '2026-09-10T04:00:00.000Z'))
    }
    const period = { organizationId: 'org-platform', startDate: '2026-09-10', endDate: '2026-09-10', now: new Date('2026-09-11T00:00:00Z') }
    const report = await getAnalyticsReport(db, period)
    for (const row of report.attribution) assert.ok((row.sessionConversionRate ?? 0) <= 100, `${row.campaign} rate ${row.sessionConversionRate}`)
    assert.deepEqual(report.attribution.map(row => [row.campaign, row.sessions, row.convertingSessions]).sort(), [['A', 1, 0], ['B', 2, 2]])
    // The events keep the touch they had when they happened, in their own grouping.
    assert.deepEqual(report.outcomeAttribution.map(row => [row.campaign, row.events]), [['A', 2]])

    // A paying business already owned by someone else; a newcomer is added as a later owner and is not its acquirer.
    const founderSignup = await recordAt(db, null, { organizationId: 'org-platform', eventName: 'sign_up', stage: 'completed', surface: 'auth', entityType: 'user', entityId: 'founder', occurredAt: '2026-09-10T05:00:00.000Z' })
    assert.ok(founderSignup.created)
    await db.prepare(`INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ('m-owner', 'org-paying', 'owner', 'owner', 1000), ('m-newcomer', 'org-paying', 'newcomer', 'owner', 2000)`).run()
    await recordAt(db, null, { organizationId: 'org-platform', eventName: 'sign_up', stage: 'completed', surface: 'auth', entityType: 'user', entityId: 'newcomer', occurredAt: '2026-09-10T06:00:00.000Z' })
    assert.equal(await originatingOwnerId(db, 'org-paying'), 'owner')
    await recordAt(db, null, { organizationId: 'org-platform', eventName: 'purchase', stage: 'completed', surface: 'stripe', entityType: 'invoice', entityId: 'in_old', occurredAt: '2026-09-10T02:00:00.000Z',
      value: { basis: 'purchase', amount_minor: 4900, collected_minor: 4900, currency: 'USD', transaction_id: 'in_old' },
      metadata: { purchase_type: 'initial_subscription', subscribing_organization_id: 'org-paying', originating_user_id: 'owner' } })
    // A business the founder actually created, onboarded and paid for after the signup.
    await db.prepare(`INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ('m-founder', 'org-new', 'founder', 'owner', 3000)`).run()
    await recordAt(db, null, { organizationId: 'org-platform', eventName: 'onboarding_complete', stage: 'completed', surface: 'dashboard', entityType: 'organization', entityId: 'org-new', occurredAt: '2026-09-10T07:00:00.000Z', metadata: { originating_user_id: await originatingOwnerId(db, 'org-new') } })
    await recordAt(db, null, { organizationId: 'org-platform', eventName: 'purchase', stage: 'completed', surface: 'stripe', entityType: 'invoice', entityId: 'in_new', occurredAt: '2026-09-10T08:00:00.000Z',
      value: { basis: 'purchase', amount_minor: 4900, collected_minor: 4900, currency: 'USD', transaction_id: 'in_new' },
      metadata: { purchase_type: 'initial_subscription', subscribing_organization_id: 'org-new', originating_user_id: 'founder' } })
    const cohort = (await getAnalyticsReport(db, period)).signupCohort
    // Four signups; only the founder's led to a business that onboarded and paid after them. The paying business predates the newcomer.
    assert.deepEqual([cohort.signups, cohort.onboardedSignups, cohort.firstPaidSignups], [4, 1, 1])
    assert.deepEqual([cohort.onboardedBusinesses, cohort.firstPaidBusinesses], [1, 2])
  } finally { await runtime.dispose() }
})

test('consent is enforced for GA delivery and withdrawal erases stored identifiers', { timeout: 60_000 }, async () => {
  const { runtime, db } = await openDb()
  const realFetch = globalThis.fetch
  const sent: string[] = []
  try {
    await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json, "stripeCustomerId", integrations_json) VALUES
      ('org-platform', 'p', 'p', 'p', '{"config":{"default_timezone":"Asia/Bangkok"}}', NULL, '{"google_analytics":{"revision":"r1","status":"active","measurement_id":"G-TEST"}}'),
      ('org-customer', 'c', 'c', 'c', '{"config":{"default_timezone":"Asia/Bangkok"}}', 'cus_1', '{}')`).run()
    await db.prepare(`INSERT INTO organization_domains (id, organization_id, domain, type, role, status) VALUES ('d1', 'org-platform', 'platform.example', 'subdomain', 'canonical', 'active')`).run()
    for (const id of ['user-a', 'user-b']) await db.prepare(`INSERT INTO user (id, name, email) VALUES (?, ?, ?)`).bind(id, id, `${id}@example.com`).run()
    await db.prepare(`INSERT INTO member (id, "organizationId", "userId", role) VALUES ('m1', 'org-customer', 'user-a', 'owner')`).run()
    globalThis.fetch = (async (url: string | URL | Request) => { sent.push(String(url)); return new Response(null, { status: 204 }) }) as typeof fetch
    const signup = (id: string) => ({ organizationId: 'org-platform', eventName: 'sign_up', stage: 'completed', surface: 'auth', entityType: 'user', entityId: id } as const)
    const request = (consent: string | null) => ({ headers: new Headers({ cookie: `_ga=GA1.1.111.222${consent === null ? '' : `; kc_analytics_consent=${encodeURIComponent(consent)}`}` }) })
    const deliveryOf = async (id: string) => JSON.parse(await db.prepare("SELECT json_extract(payload_json, '$.ga4_delivery') d FROM analytics_events WHERE id = ?").bind(id).first<string>('d') ?? 'null')

    // The identifier alone (the _ga cookie) is not consent; rejection sends nothing; acceptance sends once.
    const noAnswer = await recordAndDeliverConversion({ GA4_API_SECRET: 'secret' }, db, request(null), signup('user-a'))
    const rejected = await recordAndDeliverConversion({ GA4_API_SECRET: 'secret' }, db, request('{"kc_analytics":false}'), signup('user-b'))
    assert.deepEqual([(await deliveryOf(noAnswer.id)).status, (await deliveryOf(rejected.id)).status], ['no_consent_context', 'consent_rejected'])
    assert.equal(sent.length, 0)
    // The native events exist regardless of the consent decision.
    assert.equal(await db.prepare("SELECT count(*) FROM analytics_events WHERE json_extract(payload_json, '$.event_name') = 'sign_up'").first('count(*)'), 2)
    const accepted = await recordAndDeliverConversion({ GA4_API_SECRET: 'secret' }, db, request('{"kc_analytics":true}'), { ...signup('user-c') })
    assert.equal((await deliveryOf(accepted.id)).status, 'sent')
    assert.equal(sent.length, 1)
    assert.match(sent[0]!, /measurement_id=G-TEST/)

    // Withdrawal erases what checkout stored for this user, only where they captured it.
    await db.prepare(`INSERT INTO stripe_ga4_subscription_intents (id, organization_id, user_id, action, client_id, session_id, session_captured_at, expires_at)
      VALUES ('i1', 'org-customer', 'user-a', 'initial_subscription', '111.222', '9', 1, '2027-01-01T00:00:00.000Z'),
             ('i2', 'org-customer', 'user-b', 'initial_subscription', '333.444', '9', 1, '2027-01-01T00:00:00.000Z')`).run()
    const updates: Array<Record<string, unknown>> = []
    const stripe = {
      customers: {
        retrieve: async () => ({ deleted: false, metadata: { user_id: 'user-a', ga_client_id: '111.222', keep: 'x' } }),
        update: async (_id: string, body: { metadata: Record<string, unknown> }) => { updates.push({ customer: body.metadata }) },
      },
      subscriptions: {
        list: () => (async function* () {
          yield { id: 'sub_mine', metadata: { user_id: 'user-a', ga_client_id: '111.222', ga_session_id: '9', other: 'y' } }
          yield { id: 'sub_theirs', metadata: { user_id: 'user-b', ga_client_id: '333.444' } }
        })(),
        update: async (id: string, body: { metadata: Record<string, unknown> }) => { updates.push({ [id]: body.metadata }) },
      },
    } as never
    await withdrawStripeGaIdentifiers(db, () => stripe, 'user-a')
    assert.deepEqual(updates, [{ customer: { ga_client_id: '' } }, { sub_mine: { ga_client_id: '', ga_session_id: '' } }])
    assert.deepEqual((await db.prepare('SELECT id, client_id, session_id FROM stripe_ga4_subscription_intents ORDER BY id').all()).results,
      [{ id: 'i1', client_id: null, session_id: null }, { id: 'i2', client_id: '333.444', session_id: '9' }])
  } finally {
    globalThis.fetch = realFetch
    await runtime.dispose()
  }
})

test('the Stripe handler records every paid subscription invoice and refund once, with checkout attribution', { timeout: 60_000 }, async () => {
  const { runtime, db } = await openDb()
  const realFetch = globalThis.fetch
  const sent: string[] = []
  try {
    const timezone = '{"config":{"default_timezone":"Asia/Bangkok"}}'
    await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json, theme_id, status, onboarding_status, integrations_json) VALUES
      ('org-platform', 'p', 'p', 'p', ?, ?, 'active', 'active', '{"google_analytics":{"revision":"r1","status":"active","measurement_id":"G-TEST"}}')`).bind(timezone, PLATFORM_TEMPLATE.themeId).run()
    await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json, integrations_json) VALUES ('org-customer', 'c', 'c', 'c', ?, '{}')`).bind(timezone).run()
    await db.prepare(`INSERT INTO organization_domains (id, organization_id, domain, type, role, status) VALUES ('d1', 'org-platform', 'platform.example', 'subdomain', 'canonical', 'active')`).run()
    await db.prepare(`INSERT INTO user (id, name, email) VALUES ('founder', 'f', 'f@example.com')`).run()
    await db.prepare(`INSERT INTO member (id, "organizationId", "userId", role) VALUES ('m1', 'org-customer', 'founder', 'owner')`).run()
    // Checkout began with a consenting visitor from a campaign.
    await db.prepare(`INSERT INTO stripe_ga4_subscription_intents (id, organization_id, user_id, action, client_id, session_id, session_captured_at, attribution_json, expires_at)
      VALUES ('intent-1', 'org-customer', 'founder', 'initial_subscription', '111.222', '9', ${Math.floor(Date.now() / 1000)}, ?, '2099-01-01T00:00:00.000Z')`)
      .bind(JSON.stringify({ touch: { source: 'meta', medium: 'paid', campaign: 'launch', term: null, content: 'video-a', referrerHost: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null }, attributedAt: '2026-09-10T03:30:00.000Z' })).run()
    globalThis.fetch = (async (url: string | URL | Request) => { sent.push(String(url)); return new Response(null, { status: 204 }) }) as typeof fetch

    const price = { id: 'price_1', unit_amount: 4900, nickname: null, product: { name: 'Growth', deleted: false }, recurring: { interval: 'month', interval_count: 1 } }
    const line = { id: 'il_1', type: 'subscription', amount: 4900, quantity: 1, subscription: 'sub_1', price }
    const invoices = new Map<string, Record<string, unknown>>()
    const makeInvoice = (id: string, created: number, billingReason: string) => {
      const value = { id, created, billing_reason: billingReason, currency: 'usd', customer: 'cus_1', subscription: 'sub_1', amount_paid: 5243, total_excluding_tax: 4900, status_transitions: { paid_at: created } }
      invoices.set(id, value)
      return value
    }
    const history = [{ id: 'in_trial', amount_paid: 0, created: 1_000 }]
    const stripe = {
      subscriptions: {
        retrieve: async () => ({ id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { referenceId: 'org-customer' }, items: { data: [{ price, quantity: 1 }] } }),
        update: async () => ({}),
      },
      customers: { retrieve: async () => ({ deleted: false, metadata: { customerType: 'organization', organizationId: 'org-customer' } }) },
      invoices: {
        list: () => (async function* () { for (const item of history) yield item })(),
        listLineItems: async () => ({ data: [line], has_more: false }),
        retrieve: async (id: string) => invoices.get(id),
      },
      prices: { retrieve: async () => price },
      charges: { retrieve: async () => ({ invoice: null }) },
    } as never
    const env = { GA4_API_SECRET: 'secret' } as never
    const paid = (invoice: Record<string, unknown>, eventId: string) => handleStripeGa4Event(env, db, stripe, { id: eventId, type: 'invoice.paid', data: { object: invoice } } as never)
    const purchases = async () => (await db.prepare(`SELECT id, json_extract(payload_json, '$.metadata.purchase_type') type, json_extract(payload_json, '$.attribution.campaign') campaign,
      json_extract(payload_json, '$.metadata.originating_user_id') owner, json_extract(payload_json, '$.value.amount_minor') value, json_extract(payload_json, '$.value.collected_minor') cash, session_id,
      json_extract(payload_json, '$.ga4_delivery.status') delivery FROM analytics_events WHERE json_extract(payload_json, '$.event_name') = 'purchase' ORDER BY created_at, id`).all()).results

    // First positive payment after a zero-value trial arrives as a cycle and is the first paid conversion, attributed to the checkout's campaign.
    const first = makeInvoice('in_1', 2_000, 'subscription_cycle')
    await paid(first, 'evt_1')
    await paid(first, 'evt_1_redelivered')
    const rows = await purchases()
    assert.equal(rows.length, 1)
    assert.deepEqual({ ...rows[0], id: undefined }, { id: undefined, type: 'initial_subscription', campaign: 'launch', owner: 'founder', value: 4900, cash: 5243, session_id: null, delivery: 'sent' })
    assert.equal(sent.length, 1, 'a redelivered invoice does not send a second GA event')

    // The customer cancels and later starts a new subscription: still revenue, classified apart from acquisition.
    history.push({ id: 'in_1', amount_paid: 5243, created: 2_000 })
    await paid(makeInvoice('in_2', 5_000, 'subscription_create'), 'evt_2')
    assert.deepEqual((await purchases()).map(row => row.type), ['initial_subscription', 'resubscription'])

    // A partial refund reverses the first purchase on its own basis and campaign; a redelivery is the same event.
    const refund = { id: 're_1', amount: 1_000, status: 'succeeded', charge: 'ch_1', payment_intent: null, currency: 'usd', created: 3_000, metadata: { invoice_id: 'in_1' } }
    for (const eventId of ['evt_3', 'evt_3_again']) await handleStripeGa4Event(env, db, stripe, { id: eventId, type: 'refund.created', data: { object: refund } } as never)
    const refunds = (await db.prepare(`SELECT json_extract(payload_json, '$.value.amount_minor') value, json_extract(payload_json, '$.value.collected_minor') cash, json_extract(payload_json, '$.value.items') items,
      json_extract(payload_json, '$.attribution.campaign') campaign, json_extract(payload_json, '$.metadata.purchase_type') type FROM analytics_events WHERE json_extract(payload_json, '$.event_name') = 'refund'`).all()).results
    assert.deepEqual(refunds, [{ value: Math.round(1_000 * 4_900 / 5_243), cash: 1_000, items: null, campaign: 'launch', type: 'initial_subscription' }])
  } finally {
    globalThis.fetch = realFetch
    await runtime.dispose()
  }
})
