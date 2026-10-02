import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { claimSessionCapacity, setBookingStatus, updateSession } from '../../server/utils/availability.ts'
import { calendarSubjects, runCalendarCleanupJobs, disconnectCalendar, readCalendarIntegration, storeCalendarSelection, syncCalendarOrganization } from '../../server/utils/google-calendar.ts'
import { requireIntegrationAccount, type CloudflareEnv } from '../../server/utils/auth.ts'
import { cleanupOrganizationBeforeDelete } from '../../server/utils/tenant-deletion.ts'
import { organizationAdapter } from '../../server/utils/member-access.ts'
import { INTEGRATION_SCOPES } from '../../shared/organization-settings.ts'

test('committed consultation projection is tenant scoped, private, idempotent and fenced during cancellation and cleanup', { timeout: 120_000 }, async (t) => {
  const mf = new Miniflare({ workers: [{ config: { name: 'calendar-proof', type: 'worker', compatibilityDate: '2024-11-01', manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } }, env: { DB: { type: 'd1' } } } }] })
  try {
    const db = await mf.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization(id,name,slug) VALUES('org','Org','org'),('other','Other','other')").run()
    await db.prepare("INSERT INTO products(id,organization_id,name,slug,created_by,updated_by) VALUES('p','org','Consultation','consultation','actor','actor'),('class','org','Class','class','actor','actor')").run()
    await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by) VALUES('v','org','p','Consultation','actor','actor')").run()
    await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,calendar_group,online_timezone,confirmation_mode,created_by,updated_by) VALUES('p','org','consultations','America/New_York','review','actor','actor'),('class','org',NULL,'America/New_York','instant','actor','actor')").run()
    await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,created_by,updated_by) VALUES('s','org','p','America/New_York','2099-11-01T14:00:00.000Z','2099-11-01T14:30:00.000Z',1,'actor','actor')").run()
    await db.prepare(`INSERT INTO requests(id,kind,organization_id,conversation_state,payload_json) VALUES('thread','booking','org','needs_attention','{"guest":{"name":"Jane Doe","email":"private@example.test","phone":null},"notes":"PRIVATE MATTER"}')`).run()
    const { bookingId } = await claimSessionCapacity(db, { organizationId: 'org', productId: 'p', sessionId: 's', productVariantId: 'v', partySize: 1, requestId: 'thread' })
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    const integration = (await readCalendarIntegration(db, 'org'))!
    assert.equal((await calendarSubjects(db, 'other', integration)).length, 0)
    await db.prepare("INSERT INTO organization_integrations(id,organization_id,provider,account_id,target_id,target_name,measurement_id,revision)VALUES('analytics','org','google_analytics','linked-account','property','Analytics','G-123','a')").run()
    const env = { DB: db, BETTER_AUTH_URL: 'https://proof.example', BETTER_AUTH_SECRET: 'local-proof-secret-long-enough-for-auth', STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests', NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.test' } as CloudflareEnv
    await db.prepare("INSERT INTO user(id,name,email) VALUES('owner','Owner','owner@example.test'),('foreign','Foreign','foreign@example.test')").run()
    await db.prepare("INSERT INTO account(id,accountId,providerId,userId,scope) VALUES('linked-account','google-subject','google','owner',?)").bind(INTEGRATION_SCOPES['google-calendar'].join(' ')).run()
    await requireIntegrationAccount(env, 'linked-account', { userId: 'owner', currentAccountId: null, providerId: 'google', scopes: INTEGRATION_SCOPES['google-calendar'] })
    await assert.rejects(requireIntegrationAccount(env, 'linked-account', { userId: 'foreign', currentAccountId: null, providerId: 'google', scopes: INTEGRATION_SCOPES['google-calendar'] }))
    assert.ok(!JSON.stringify(integration).includes('token'))
    const provider = { token: async (accountId: string) => { assert.equal(accountId, 'linked-account'); return 'token' } }
    const events = new Map<string, Record<string, unknown>>()
    let timeoutAfterInsert = true; let denyCalendar = false; let cancelDuringPut = false; let disconnectDuringPost = false
    t.mock.method(globalThis, 'fetch', async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.hostname, 'www.googleapis.com')
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token')
      if (url.pathname.includes('/calendarList/')) return denyCalendar ? new Response(null, { status: 404 }) : Response.json({ accessRole: 'writer' })
      assert.equal(url.searchParams.get('sendUpdates'), 'none')
      const payload = init?.body ? JSON.parse(String(init.body)) : null
      const id = init?.method === 'POST' ? payload.id : url.pathname.split('/').at(-1)!
      if (init?.method === 'DELETE') { events.delete(id); return new Response(null, { status: 204 }) }
      if (init?.method === 'POST') {
        if (events.has(id)) return new Response(null, { status: 409 })
        events.set(id, payload)
        if (disconnectDuringPost) { disconnectDuringPost = false; await disconnectCalendar(db, 'org') }
        if (timeoutAfterInsert) { timeoutAfterInsert = false; throw new Error('timeout after provider committed') }
      } else {
        events.set(id, payload)
        if (cancelDuringPut) { cancelDuringPut = false; await setBookingStatus(db, { organizationId: 'org', bookingId, status: 'cancelled' }) }
      }
      return Response.json({ id })
    })
    assert.equal((await syncCalendarOrganization(env, 'org', 25, provider)).failed, 1)
    assert.equal((await db.prepare('SELECT status FROM bookings WHERE id=?').bind(bookingId).first())?.status, 'pending')
    assert.equal((await readCalendarIntegration(db, 'org'))?.status, 'error')
    await db.prepare('UPDATE google_calendar_event_links SET next_attempt_at=NULL').run()
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 1)
    const link = await db.prepare('SELECT * FROM google_calendar_event_links').first()
    assert.equal(link?.operational_id, bookingId)
    assert.equal(link?.request_id, 'thread')
    const event = events.get(String(link?.event_id))!
    assert.equal(event.summary, 'Pending consultation — Jane Doe')
    assert.deepEqual(event.start, { dateTime: '2099-11-01T14:00:00.000Z', timeZone: 'America/New_York' })
    assert.equal(event.attendees, undefined)
    assert.ok(String(event.description).includes('/dashboard/org/messages/thread'))
    assert.ok(!JSON.stringify(event).includes('PRIVATE MATTER'))
    assert.ok(!JSON.stringify(event).includes('private@example.test'))
    await setBookingStatus(db, { organizationId: 'org', bookingId, status: 'confirmed' })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 1)
    assert.equal(events.get(String(link?.event_id))?.summary, 'Consultation — Jane Doe')
    await updateSession(db, { organizationId: 'org', sessionId: 's', actorId: 'actor', startsAt: '2099-11-01T15:00:00.000Z', endsAt: '2099-11-01T15:30:00.000Z' })
    cancelDuringPut = true
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 0, 'late update is compensated after committed cancellation')
    assert.equal((await db.prepare('SELECT state FROM google_calendar_event_links').first())?.state, 'deleted')
    // Failed cleanup is retained even when Google answers 404 for lost access.
    await disconnectCalendar(db, 'org')
    // Cancelled subject was already deleted; create another real committed claim.
    const second = await claimSessionCapacity(db, { organizationId: 'org', productId: 'p', sessionId: 's', productVariantId: 'v', partySize: 1 })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(await readCalendarIntegration(db, 'org'), null)
    assert.equal((await db.prepare("SELECT measurement_id FROM organization_integrations WHERE organization_id='org' AND provider='google_analytics'").first())?.measurement_id, 'G-123')
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 1)
    // Disable while a create is in flight: the late result is removed, and
    // its original identity remains locally for audit.
    await updateSession(db, { organizationId: 'org', sessionId: 's', actorId: 'actor', startsAt: '2099-11-01T16:00:00.000Z', endsAt: '2099-11-01T16:30:00.000Z' })
    await disconnectCalendar(db, 'org')
    await syncCalendarOrganization(env, 'org', 25, provider)
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    disconnectDuringPost = true
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 0, 'late create cannot survive disconnect')
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(await readCalendarIntegration(db, 'org'), null)
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 1)
    await disconnectCalendar(db, 'org')
    denyCalendar = true
    assert.equal((await syncCalendarOrganization(env, 'org', 25, provider)).failed, 1)
    assert.equal(events.size, 1)
    assert.equal((await readCalendarIntegration(db, 'org'))?.status, 'disabled')
    assert.ok((await readCalendarIntegration(db, 'org'))?.last_error)
    await assert.rejects(storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'new', calendar_name: 'New', calendar_group: 'consultations', include_reservations: false }))
    denyCalendar = false
    await db.prepare('UPDATE google_calendar_event_links SET next_attempt_at=NULL').run()
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 0)
    assert.equal((await db.prepare('SELECT status FROM bookings WHERE id=?').bind(second.bookingId).first())?.status, 'pending')
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 1)
    await cleanupOrganizationBeforeDelete(env, 'org')
    await cleanupOrganizationBeforeDelete(env, 'org')
    assert.equal((await runCalendarCleanupJobs(env, 25, provider)).checked, 0, 'staging cannot authorize orphan deletion while tenant still exists')
    assert.equal(events.size, 1)
    assert.equal((await db.prepare('SELECT count(*) n FROM google_calendar_cleanup_jobs').first())?.n, 1)
    await (await organizationAdapter(env)).deleteOrganization('org')
    assert.equal(await db.prepare("SELECT id FROM organization WHERE id='org'").first(), null)
    assert.equal(await db.prepare('SELECT id FROM google_calendar_event_links').first(), null)
    const orphan = await db.prepare('SELECT * FROM google_calendar_cleanup_jobs').first()
    assert.equal(orphan?.organization_id, 'org')
    assert.equal(orphan?.account_id, 'linked-account')
    assert.ok(!JSON.stringify(orphan).includes('PRIVATE MATTER'))
    assert.equal(orphan?.booking_id, undefined)
    denyCalendar = true
    assert.equal((await runCalendarCleanupJobs(env, 25, provider)).failed, 1)
    assert.equal(events.size, 1)
    assert.equal((await db.prepare('SELECT state FROM google_calendar_cleanup_jobs').first())?.state, 'error')
    assert.equal((await syncCalendarOrganization(env, 'org', 25, provider)).checked, 0)
    denyCalendar = false
    await db.prepare('UPDATE google_calendar_cleanup_jobs SET next_attempt_at=NULL').run()
    assert.equal((await runCalendarCleanupJobs(env, 25, provider)).failed, 0)
    assert.equal(events.size, 0)
    assert.ok((await db.prepare('SELECT completed_at FROM google_calendar_cleanup_jobs').first())?.completed_at)
    assert.ok(await db.prepare("SELECT id FROM organization WHERE id='other'").first())

  } finally { await mf.dispose() }
})


test('bounded Calendar backfill resumes and cancelled historical Sessions are cleaned', { timeout: 120_000 }, async (t) => {
  const mf = new Miniflare({ workers: [{ config: { name: 'calendar-budget-proof', type: 'worker', compatibilityDate: '2024-11-01', manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } }, env: { DB: { type: 'd1' } } } }] })
  try {
    const db = await mf.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization(id,name,slug) VALUES('org','Org','org')").run()
    await db.prepare("INSERT INTO products(id,organization_id,name,slug,created_by,updated_by) VALUES('p','org','Consultation','consultation','actor','actor')").run()
    await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,calendar_group,online_timezone,confirmation_mode,created_by,updated_by) VALUES('p','org','consultations','UTC','review','actor','actor')").run()
    await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by) VALUES('v','org','p','Consultation','actor','actor')").run()
    const bookings: string[] = []
    for (let i = 0; i < 55; i++) {
      const start = Date.parse('2099-11-01T00:00:00.000Z') + i * 3600_000
      await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,created_by,updated_by) VALUES(?,'org','p','UTC',?,?,1,'actor','actor')").bind(`s${i.toString().padStart(2, '0')}`, new Date(start).toISOString(), new Date(start + 1800_000).toISOString()).run()
      bookings.push((await claimSessionCapacity(db, { organizationId: 'org', productId: 'p', sessionId: `s${i.toString().padStart(2, '0')}`, productVariantId: 'v', partySize: 1 })).bookingId)
    }
    const env = { DB: db, NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.test' } as CloudflareEnv
    await storeCalendarSelection(db, 'org', { account_id: 'linked-account', calendar_id: 'chosen', calendar_name: 'Calendar', calendar_group: 'consultations', include_reservations: false })
    const provider = { token: async () => 'token' }
    for (const expected of [25, 50, 55]) {
      await syncCalendarOrganization(env, 'org', 0, provider)
      assert.equal((await db.prepare('SELECT count(*) n FROM google_calendar_event_links').first())?.n, expected)
    }
    const oldest = await db.prepare('SELECT operational_id FROM google_calendar_event_links ORDER BY updated_at, operational_id LIMIT 1').first<{ operational_id: string }>()
    await db.prepare("UPDATE bookings SET updated_at='2099-01-01T00:00:00.000Z' WHERE id=?").bind(oldest!.operational_id).run()
    const previous = await db.prepare('SELECT booking_revision FROM google_calendar_event_links WHERE operational_id=?').bind(oldest!.operational_id).first()
    await syncCalendarOrganization(env, 'org', 0, provider)
    assert.notEqual((await db.prepare('SELECT booking_revision FROM google_calendar_event_links WHERE operational_id=?').bind(oldest!.operational_id).first())?.booking_revision, previous?.booking_revision, 'persisted oldest-first cursor also revisits existing subjects')
    const events = new Map<string, unknown>()
    t.mock.method(globalThis, 'fetch', async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/calendarList/')) return Response.json({ accessRole: 'writer' })
      const payload = init?.body ? JSON.parse(String(init.body)) : null
      const id = init?.method === 'POST' ? payload.id : url.pathname.split('/').at(-1)!
      if (init?.method === 'DELETE') { events.delete(id); return new Response(null, { status: 204 }) }
      events.set(id, payload)
      return Response.json(payload)
    })
    // Drain the bounded queue through the provider boundary.
    for (let i = 0; i < 3; i++) await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 55)
    await setBookingStatus(db, { organizationId: 'org', bookingId: bookings[0]!, status: 'confirmed' })
    for (let i = 0; i < 3; i++) await syncCalendarOrganization(env, 'org', 25, provider)
    await updateSession(db, { organizationId: 'org', sessionId: 's00', actorId: 'actor', startsAt: '2020-01-01T10:00:00.000Z', endsAt: '2020-01-01T10:30:00.000Z' })
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 55, 'confirmed ended scheduled consultation retains its event')
    // Legacy/imported state: a confirmed booking can reference a cancelled Session.
    await db.prepare("UPDATE product_sessions SET status='cancelled' WHERE id='s00'").run()
    await syncCalendarOrganization(env, 'org', 25, provider)
    assert.equal(events.size, 54, 'cancelled historical Session does not retain the event')
    assert.equal((await db.prepare('SELECT state FROM google_calendar_event_links WHERE operational_id=?').bind(bookings[0]).first())?.state, 'deleted')
  } finally { await mf.dispose() }
})
