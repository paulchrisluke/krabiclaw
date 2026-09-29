import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { recordOrganizationConversionEvent as recordAt, type OrganizationConversionInput } from '../../server/utils/organization-conversions.ts'
import { getAnalyticsReport } from '../../server/utils/analytics-report.ts'
import { recordTenantPageview, type TenantPageviewInput } from '../../server/utils/pageview-tracking.ts'

const SESSION = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
// Events are recorded inside the reported range, at their own occurrence time.
const recordOrganizationConversionEvent = (db: Parameters<typeof recordAt>[0], origin: Parameters<typeof recordAt>[1], input: OrganizationConversionInput) =>
  recordAt(db, origin, { occurredAt: '2026-09-10T04:00:00.000Z', ...input })
const browser = { headers: new Headers({ cookie: `kc_session_id=${SESSION}; kc_visitor_id=${VISITOR}`, 'user-agent': 'Desktop' }) }

test('conversion measurement: contract, values, idempotency, report and cohort on D1', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'conversion-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
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
    const onboarding = await recordOrganizationConversionEvent(db, null, { organizationId: 'org-platform', eventName: 'onboarding_complete', stage: 'completed', surface: 'dashboard', entityType: 'organization', entityId: 'org-customer' })
    const onboardingRow = await db.prepare("SELECT session_id, visitor_id, json_extract(payload_json, '$.attribution') attribution FROM analytics_events WHERE id = ?").bind(onboarding.id).first<Record<string, unknown>>()
    assert.deepEqual(onboardingRow, { session_id: null, visitor_id: null, attribution: null })
    assert.equal(await db.prepare("SELECT count(*) FROM analytics_summaries WHERE kind = 'session'").first('count(*)'), 1)

    // Purchases: value excludes tax, collected includes it; a redelivery is the same event.
    const purchase = {
      organizationId: 'org-platform', eventName: 'purchase', stage: 'completed', surface: 'stripe', entityType: 'invoice', entityId: 'in_1',
      occurredAt: '2026-09-11T03:00:00.000Z',
      value: { basis: 'purchase', amount_minor: 4900, collected_minor: 5243, currency: 'USD', transaction_id: 'in_1' },
      metadata: { purchase_type: 'initial_subscription', subscribing_organization_id: 'org-customer' },
    } as const
    const paid = await recordOrganizationConversionEvent(db, null, purchase)
    assert.deepEqual(await recordOrganizationConversionEvent(db, null, purchase), { id: paid.id, created: false })

    // Two partial refunds of one invoice are two events; a redelivered refund is not a third.
    const refund = (id: string, amount: number) => ({ organizationId: 'org-platform', eventName: 'refund', stage: 'completed', surface: 'stripe', entityType: 'refund', entityId: id, value: { basis: 'refund', amount_minor: amount, currency: 'USD', transaction_id: 'in_1' } }) as const
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
    assert.equal(platform.conversions.find(row => row.eventName === 'purchase')?.sessionConversionRate, 0)
    assert.deepEqual(platform.attribution.map(row => [row.campaign, row.content, row.sessions, row.outcomeEvents, row.convertingSessions, row.sessionConversionRate]), [['launch', 'video-a', 1, 1, 1, 100]])
    assert.deepEqual(platform.values.find(row => row.eventName === 'purchase'), { eventName: 'purchase', basis: 'purchase', currency: 'USD', events: 1, valueMinor: 4900, collectedMinor: 5243 })
    assert.deepEqual(platform.net, [{ currency: 'USD', collectedMinor: 5243, refundedMinor: 1500, netMinor: 3743 }])
    // The signup cohort links signup -> owned organization -> onboarding and first payment, counted per signup.
    assert.deepEqual([platform.signupCohort.signups, platform.signupCohort.onboardedSignups, platform.signupCohort.firstPaidSignups], [1, 1, 1])
    assert.equal(platform.signupCohort.bySignupAttribution[0]?.campaign, 'launch')
    assert.deepEqual([platform.signupCohort.onboardedBusinesses, platform.signupCohort.firstPaidBusinesses], [1, 1])
    assert.equal(platform.coverage.outcomeEventsWithoutAttribution, 2)
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
