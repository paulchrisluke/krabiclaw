import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { threadPayloadForGuest, requestInsertQueries, cancelBookingRequest, getGuestRequest, getThreadOperationalRecord } from '../../server/domain/requests.ts'
import { executeGuestThreadOperation } from '../../server/domain/guest-threads/operations.ts'
import { listGuestThreads } from '../../server/domain/guest-threads/repository.ts'
import { claimReservation, upsertLocationReservationConfig } from '../../server/utils/reservations.ts'
import { claimSessionCapacity, setBookingStatus } from '../../server/utils/availability.ts'
import { buildCanonicalNotificationInsert } from '../../server/utils/notification-center.ts'
import { acknowledgeNotification } from '../../server/utils/notification-acknowledgement.ts'

const ORG = 'org-proof'
const SITE = 'site-proof'
const LOCATION = 'location-proof'
const ACTOR = 'user-proof'
const NOW = '2026-09-11T00:00:00.000Z'

/**
 * A thread carries the conversation; a booking or reservation holds the seats.
 *
 * These are the invariants of that split: the two rows commit together, the
 * seat-holding row is the only place a status lives, and a guest's
 * cancellation token can be spent exactly once no matter how many times it is
 * presented.
 */
test('a thread and the record it refers to commit and cancel as one', { timeout: 120_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'request-consolidation-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const deadline = setTimeout(() => { void runtime.dispose() }, 110_000)
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.batch([
      `INSERT INTO organization (id,name,slug) VALUES ('${ORG}','Proof','proof')`,
      `INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('${SITE}','${ORG}','proof','proof')`,
      `INSERT INTO user (id,name,email) VALUES ('${ACTOR}','Proof','owner@proof.example')`,
      `INSERT INTO business_locations (id,organization_id,site_id,slug,title,timezone) VALUES ('${LOCATION}','${ORG}','${SITE}','proof','Proof','Asia/Bangkok')`,
      `INSERT INTO products (id,organization_id,name,slug,created_by,updated_by) VALUES ('product-proof','${ORG}','Pottery Class','pottery-class','${ACTOR}','${ACTOR}')`,
      `INSERT INTO product_variants (id,organization_id,product_id,name,created_by,updated_by) VALUES ('variant-proof','${ORG}','product-proof','Standard','${ACTOR}','${ACTOR}')`,
      // The branch offers it: a session at a location takes seats only while
      // that location is still selling the product.
      `INSERT INTO product_locations (organization_id,product_id,location_id,active,published,created_by,updated_by) VALUES ('${ORG}','product-proof','${LOCATION}',1,1,'${ACTOR}','${ACTOR}')`,
      `INSERT INTO product_booking_configs (product_id,organization_id,duration_minutes,default_capacity,created_by,updated_by) VALUES ('product-proof','${ORG}',120,1,'${ACTOR}','${ACTOR}')`,
      `INSERT INTO product_sessions (id,organization_id,product_id,location_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by)
        VALUES ('session-proof','${ORG}','product-proof','${LOCATION}','Asia/Bangkok','2099-01-05T07:00:00.000Z','2099-01-05T09:00:00.000Z',1,'scheduled','${ACTOR}','${ACTOR}')`,
    ].map(statement => db.prepare(statement)))

    // One seat, two guests: the claim carries its own capacity predicate, so
    // exactly one insert lands and the loser is told, not overbooked.
    async function bookSession(id: string) {
      await db.batch(requestInsertQueries({
        id, kind: 'booking', organization_id: ORG, site_id: SITE, location_id: LOCATION,
        customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null,
        payload: threadPayloadForGuest({ name: 'Guest', email: 'guest@proof.example', phone: '+66812345678' }),
        created_at: NOW, updated_at: NOW,
      }).map(write => db.prepare(write.query).bind(...write.params)))
      return claimSessionCapacity(db, {
        organizationId: ORG, siteId: SITE, productId: 'product-proof', sessionId: 'session-proof',
        productVariantId: 'variant-proof', partySize: 1, customerId: null, requestId: id,
      }).then(() => true, async () => {
        // A thread with no booking is a conversation about nothing; the caller
        // that lost the seat takes its thread back out, as the public route does.
        await db.prepare('DELETE FROM requests WHERE id=?').bind(id).run()
        return false
      })
    }
    const claims = await Promise.all([bookSession('booking-first'), bookSession('booking-second')])
    assert.equal(claims.filter(Boolean).length, 1)
    assert.equal(await db.prepare('SELECT count(*) FROM bookings').first('count(*)'), 1)

    const winner = await db.prepare('SELECT request_id FROM bookings').first<string>('request_id')
    assert.ok(winner)
    // The thread holds no copy of when or for how many; the booking does.
    const record = await getThreadOperationalRecord(db, winner)
    assert.equal(record?.kind, 'booking')
    assert.equal(record?.party_size, 1)
    assert.equal(record?.starts_at, '2099-01-05T07:00:00.000Z')

    const inbox = await listGuestThreads(db, SITE, { userId: ACTOR, locationId: LOCATION, type: 'booking', search: 'guest@proof.example' })
    assert.deepEqual(inbox.map(item => item.id), [winner])

    // Completing is idempotent: the same operation key twice writes one entry.
    // Only a confirmed booking can be completed, and the status lives on the
    // booking, so that is where the transition is made.
    await setBookingStatus(db, { organizationId: ORG, bookingId: record!.id, status: 'confirmed' })
    const operation = { threadId: winner, siteId: SITE, action: 'complete', actorUserId: ACTOR, idempotencyKey: 'complete-proof', env: {} }
    assert.equal((await executeGuestThreadOperation(db, operation)).ok, true)
    assert.equal((await executeGuestThreadOperation(db, operation)).ok, true)
    assert.equal(await db.prepare("SELECT status FROM bookings WHERE request_id=?").bind(winner).first('status'), 'completed')
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE request_id=? AND kind='operation'").bind(winner).first('count(*)'), 1)

    // A reservation is the other half of the same split: a location policy is
    // what opens reservations, and the claim commits the thread with the row.
    await upsertLocationReservationConfig(db, { organizationId: ORG, locationId: LOCATION, patch: { slot_capacity: 1 }, actorId: ACTOR })
    const reservationThread = 'reservation-proof'
    await db.batch(requestInsertQueries({
      id: reservationThread, kind: 'reservation', organization_id: ORG, site_id: SITE, location_id: LOCATION,
      customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null,
      payload: {
        ...threadPayloadForGuest({ name: 'Guest', email: 'guest@proof.example', phone: '+66812345678' }),
        cancellation: { token_hash: 'hash', expires_at: '2099-01-01T00:00:00.000Z', used_at: null },
      },
      created_at: NOW, updated_at: NOW,
    }).map(write => db.prepare(write.query).bind(...write.params)))
    const reserved = await claimReservation(db, {
      organizationId: ORG, siteId: SITE, locationId: LOCATION, reservationId: 'reservation-row-proof',
      timezone: 'Asia/Bangkok', startsAt: '2099-01-06T09:00:00.000Z', endsAt: '2099-01-06T11:00:00.000Z',
      partySize: 1, customerId: null, requestId: reservationThread,
    }).then(() => true, () => false)
    assert.equal(reserved, true)
    // The location seats one party per slot, so the second claim is refused
    // rather than silently overbooking the same start instant.
    const secondClaim = await claimReservation(db, {
      organizationId: ORG, siteId: SITE, locationId: LOCATION, reservationId: 'reservation-row-second',
      timezone: 'Asia/Bangkok', startsAt: '2099-01-06T09:00:00.000Z', endsAt: '2099-01-06T11:00:00.000Z',
      partySize: 1, customerId: null, requestId: null,
    }).then(() => true, () => false)
    assert.equal(secondClaim, false)
    assert.equal(await db.prepare('SELECT count(*) FROM reservations').first('count(*)'), 1)

    // The token is spendable exactly once, however many times it is presented.
    const cancellations = await Promise.all([1, 2].map(() => cancelBookingRequest(db, {
      id: reservationThread, siteId: SITE, kind: 'reservation', tokenHash: 'hash', now: '2098-01-01T00:00:00.000Z',
    })))
    assert.equal(cancellations.filter(Boolean).length, 1)
    assert.equal(await db.prepare('SELECT status FROM reservations WHERE request_id=?').bind(reservationThread).first('status'), 'cancelled')
    const cancelledThread = await getGuestRequest(db, reservationThread)
    assert.equal(cancelledThread?.payload.cancellation.used_at, '2098-01-01T00:00:00.000Z')

    // Notifications and their acknowledgements survive the organization that
    // owned the site they happened on being deleted.
    const entryId = await db.prepare("SELECT id FROM activity_entries WHERE request_id=? LIMIT 1").bind(winner).first<string>('id')
    const notification = buildCanonicalNotificationInsert({ scope: 'site', organizationId: ORG, siteId: SITE, title: 'Reply', template: 'guest.reply', sourceEntryId: entryId }, 'notification-proof')
    await db.prepare(notification.query).bind(...notification.params).run()
    const visibility = { userId: ACTOR, whereSql: 'n.organization_id = ?', whereParams: [ORG] }
    assert.equal(await acknowledgeNotification(db, visibility, notification.id), true)
    assert.equal(await acknowledgeNotification(db, { ...visibility, whereParams: ['another-org'] }, notification.id), false)
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE kind='acknowledgement' AND parent_id=? AND actor_user_id=?").bind(notification.id, ACTOR).first('count(*)'), 1)

    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-former','Former','former')",
      "INSERT INTO organization (id,name,slug) VALUES ('org-current','Current','current')",
      "INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('site-transferred','org-current','transferred','transferred')",
      `INSERT INTO activity_entries (id,kind,scope_kind,site_id,actor_kind,event_name,payload_json,dedupe_key,occurred_at) VALUES ('audit-proof','audit','site','site-transferred','system','site.changed','{"sourceOrganizationId":"org-former"}','audit-proof','2026-09-01T00:00:00.000Z')`,
    ].map(statement => db.prepare(statement)))
    await db.prepare("DELETE FROM organization WHERE id='org-former'").run()
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE id='audit-proof'").first('count(*)'), 1)
    await db.prepare("DELETE FROM organization WHERE id='org-current'").run()
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE id='audit-proof'").first('count(*)'), 0)
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
