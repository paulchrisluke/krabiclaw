import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { readAvailability, executeAvailabilityClaim, setAvailability } from '../../server/utils/availability.ts'
import { bookingPayloadForGuest, requestInsertQueries, cancelBookingRequest, getGuestRequest } from '../../server/domain/requests.ts'

import { executeGuestThreadOperation } from '../../server/domain/guest-threads/operations.ts'
import { listGuestThreads } from '../../server/domain/guest-threads/repository.ts'
import { createExperience, updateExperience } from '../../server/utils/experiences.ts'
import { upsertBookingPolicy, resolveBookingPolicy } from '../../server/utils/booking-policies.ts'
import { buildCanonicalNotificationInsert } from '../../server/utils/notification-center.ts'
import { acknowledgeNotification } from '../../server/utils/notification-acknowledgement.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'

const date = '2099-01-05'
test('canonical requests claim one seat and update independent owner slots atomically', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'request-consolidation-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-proof','Proof','proof')",
      "INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('site-proof','org-proof','proof','proof')",
      "INSERT INTO user (id,name,email) VALUES ('user-proof','Proof','owner@proof.example')",
      "INSERT INTO business_locations (id,organization_id,site_id,slug,title,timezone,max_capacity) VALUES ('location-proof','org-proof','site-proof','proof','Proof','Asia/Bangkok',1)",
    ].map(statement => db.prepare(statement)))
    await db.prepare('UPDATE business_locations SET opening_hours=?').bind(JSON.stringify({ periods: [{ open: { day: 1, hour: 16, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }] })).run()
    const read = async () => (await readAvailability(db, { siteId: 'site-proof', owners: [{ kind: 'location', locationId: 'location-proof' }], dates: [date] }))[0]!
    const snapshot = await read()
    async function claim(id: string) {
      const now = new Date().toISOString()
      const [statement, ...following] = requestInsertQueries({ id, kind: 'reservation', organization_id: 'org-proof', site_id: 'site-proof', location_id: 'location-proof', product_id: null, customer_id: null, review_id: null, status: 'pending', booking_date: date, time_slot: '16:00', party_size: 1, conversation_state: 'needs_attention', resolved_at: null, payload: bookingPayloadForGuest({ name: 'Guest', email: 'guest@proof.example', phone: '+66812345678' }), created_at: now, updated_at: now })
      assert.ok(statement)
      statement.query = statement.query.replace(/VALUES \(([^)]+)\)/, 'SELECT $1 WHERE /* availability_claim */')
      await executeAvailabilityClaim(db, { snapshot, date, time: '16:00', partySize: 1, statement, following })
      return db.prepare('SELECT id FROM requests WHERE id=?').bind(id).first()
    }
    assert.equal((await Promise.all([claim('first'), claim('second')])).filter(Boolean).length, 1)
    assert.equal(await db.prepare('SELECT count(*) FROM activity_entries').first('count(*)'), 1)
    const winner = await db.prepare('SELECT id FROM requests').first<string>('id')
    const inbox = await listGuestThreads(db, 'site-proof', { userId: 'user-proof', locationId: 'location-proof', type: 'reservation', search: 'guest@proof.example' })
    assert.deepEqual(inbox.map(item => ({ id: item.id, preview: item.preview, unread: item.unread })), [
      { id: winner, preview: { kind: 'submission', text: '2099-01-05 16:00 - 1 guests' }, unread: false },
    ])
    for (const field of ['party_size', 'status', 'conversation_state']) {
      await assert.rejects(() => db.prepare(`UPDATE requests SET ${field}=NULL WHERE id=?`).bind(winner).run(), /CHECK constraint/)
    }
    await assert.rejects(() => db.prepare("UPDATE requests SET payload_json='{}' WHERE id=?").bind(winner).run(), /CHECK constraint/)
    await db.prepare("UPDATE requests SET payload_json=json_set(payload_json,'$.cancellation.token_hash','hash','$.cancellation.expires_at','2099-01-01T00:00:00.000Z') WHERE id=?").bind(winner).run()
    const cancellations = await Promise.all([1, 2].map(() => cancelBookingRequest(db, { id: winner!, siteId: 'site-proof', kind: 'reservation', tokenHash: 'hash', now: '2098-01-01T00:00:00.000Z' })))
    assert.equal(cancellations.filter(Boolean).length, 1)
    const entryId = await db.prepare('SELECT id FROM activity_entries').first<string>('id')
    const notification = buildCanonicalNotificationInsert({ scope: 'site', organizationId: 'org-proof', siteId: 'site-proof', title: 'Reply', template: 'guest.reply', sourceEntryId: entryId }, 'notification-proof')
    await db.prepare(notification.query).bind(...notification.params).run()
    assert.deepEqual((await listGuestThreads(db, 'site-proof', { userId: 'user-proof', unreadOnly: true })).map(item => item.id), [winner])
    const visibility = { userId: 'user-proof', whereSql: "n.organization_id = ?", whereParams: ['org-proof'] }
    assert.equal(await acknowledgeNotification(db, visibility, notification.id), true)
    assert.deepEqual(await listGuestThreads(db, 'site-proof', { userId: 'user-proof', unreadOnly: true }), [])
    assert.equal(await acknowledgeNotification(db, { ...visibility, whereParams: ['another-org'] }, notification.id), false)
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE kind='acknowledgement' AND parent_id=? AND actor_user_id='user-proof'").bind(notification.id).first('count(*)'), 1)
    const experience = await createExperience(db, 'org-proof', 'site-proof', { title: 'Actual product', location_id: 'location-proof', max_capacity: 4, recurring_slots: { monday: ['18:30'] } }, 'user-proof', {} as CloudflareEnv)
    assert.equal(experience.max_capacity, 4)
    const updated = await updateExperience(db, 'site-proof', experience.id, { tagline: 'Updated', included_items: ['Clay'] }, {} as CloudflareEnv)
    assert.equal(updated?.tagline, 'Updated')
    assert.deepEqual(updated?.included_items, ['Clay'])
    await upsertBookingPolicy(db, { organizationId: 'org-proof', siteId: 'site-proof', policyType: 'experience', scopeType: 'site', patch: { reschedule_allowed: true, minimum_guest_age: 18 } })
    await upsertBookingPolicy(db, { organizationId: 'org-proof', siteId: 'site-proof', policyType: 'experience', scopeType: 'experience', experienceId: experience.id, locationId: 'location-proof', patch: { reschedule_allowed: false, minimum_guest_age: null } })
    const policy = await resolveBookingPolicy(db, { siteId: 'site-proof', policyType: 'experience', locationId: 'location-proof', experienceId: experience.id })
    assert.equal(policy.reschedule_allowed, false)
    assert.equal(policy.minimum_guest_age, 18)
    await db.prepare("INSERT INTO customers (id,organization_id,site_id,source) VALUES ('customer-proof','org-proof','site-proof','manual')").run()
    await assert.rejects(() => db.prepare("INSERT INTO review_requests (id,organization_id,site_id,customer_id,booking_type,booking_id,token_hash,expires_at) VALUES ('wrong-review','org-proof','site-proof','customer-proof','booking',?,'wrong-token','2099-01-01T00:00:00.000Z')").bind(winner).run(), /FOREIGN KEY constraint/)
    await db.prepare("INSERT INTO review_requests (id,organization_id,site_id,customer_id,booking_type,booking_id,token_hash,expires_at) VALUES ('valid-review','org-proof','site-proof','customer-proof','reservation',?,'valid-token','2099-01-01T00:00:00.000Z')").bind(winner).run()
    const now = new Date().toISOString()
    const bookingWrites = requestInsertQueries({ id: 'experience-booking-proof', kind: 'booking', organization_id: 'org-proof', site_id: 'site-proof', location_id: 'location-proof', product_id: experience.id, customer_id: null, review_id: null, status: 'confirmed', booking_date: date, time_slot: '18:30', party_size: 1, conversation_state: 'needs_attention', resolved_at: null, payload: bookingPayloadForGuest({ name: 'Guest', email: 'guest@proof.example' }), created_at: now, updated_at: now })
    await db.batch(bookingWrites.map(write => db.prepare(write.query).bind(...write.params)))
    const operation = { threadId: 'experience-booking-proof', siteId: 'site-proof', action: 'complete', actorUserId: 'user-proof', idempotencyKey: 'complete-proof', env: {} }
    assert.equal((await executeGuestThreadOperation(db, operation)).ok, true)
    assert.equal((await executeGuestThreadOperation(db, operation)).ok, true)
    assert.equal(await db.prepare("SELECT status FROM requests WHERE id='experience-booking-proof'").first('status'), 'completed')
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE request_id='experience-booking-proof' AND kind='operation'").first('count(*)'), 1)
    const completedBooking = await getGuestRequest(db, 'experience-booking-proof')
    assert.ok(completedBooking && completedBooking.kind === 'booking')
    const autoWrites = requestInsertQueries({ ...completedBooking, id: 'automatic-booking', status: 'confirmed', payload: { ...completedBooking.payload, completion: { at: null, source: null } } })
    await db.batch(autoWrites.map(write => db.prepare(write.query).bind(...write.params)))
    assert.equal((await executeGuestThreadOperation(db, { threadId: 'automatic-booking', siteId: 'site-proof', action: 'complete', actorUserId: null, completionSource: 'auto', idempotencyKey: 'auto-proof', env: {} })).ok, true)
    assert.equal(await db.prepare("SELECT json_extract(payload_json,'$.completion.source') AS source FROM requests WHERE id='automatic-booking'").first('source'), 'auto')
    assert.equal(await db.prepare("SELECT actor_kind FROM activity_entries WHERE request_id='automatic-booking' AND kind='operation'").first('actor_kind'), 'system')
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-former','Former','former')",
      "INSERT INTO organization (id,name,slug) VALUES ('org-current','Current','current')",
      "INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('site-transferred','org-current','transferred','transferred')",
      "INSERT INTO activity_entries (id,kind,scope_kind,site_id,actor_kind,event_name,payload_json,dedupe_key,occurred_at) VALUES ('audit-proof','audit','site','site-transferred','system','site.changed','{\"sourceOrganizationId\":\"org-former\"}','audit-proof','2026-09-01T00:00:00.000Z')",
    ].map(statement => db.prepare(statement)))
    const historicalNotification = buildCanonicalNotificationInsert({ scope: 'site', organizationId: 'org-proof', siteId: 'site-transferred', title: 'Original notification', template: 'site.changed' }, 'historical-notification')
    await db.prepare(historicalNotification.query).bind(...historicalNotification.params).run()
    await acknowledgeNotification(db, visibility, historicalNotification.id)
    await db.prepare("DELETE FROM organization WHERE id='org-former'").run()
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE id='audit-proof'").first('count(*)'), 1)
    await db.prepare("DELETE FROM organization WHERE id='org-current'").run()
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE id='audit-proof'").first('count(*)'), 0)
    assert.deepEqual(await db.prepare("SELECT organization_id,context_site_id FROM activity_entries WHERE id='historical-notification'").first(), { organization_id: 'org-proof', context_site_id: null })
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE kind='acknowledgement' AND parent_id='historical-notification' AND context_site_id IS NULL").first('count(*)'), 1)
    const owner = { kind: 'location', locationId: 'location-proof' } as const
    await Promise.all([
      setAvailability(db, { organizationId: 'org-proof', siteId: 'site-proof', owner, actorUserId: 'user-proof', changes: [{ directive: 'set', override_date: date, time_slot: '16:00', status: 'closed' }] }),
      setAvailability(db, { organizationId: 'org-proof', siteId: 'site-proof', owner, actorUserId: 'user-proof', changes: [{ directive: 'set', override_date: date, time_slot: '17:00', status: 'open', capacity_override: 3 }] }),
    ])
    const changed = await read()
    assert.equal(changed.events.filter(event => event.kind === 'override').length, 2)
    assert.equal(changed.days[0]?.slots.find(slot => slot.time_slot === '16:00')?.is_closed, true)
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
