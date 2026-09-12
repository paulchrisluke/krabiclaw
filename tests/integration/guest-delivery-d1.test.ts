import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { threadPayloadForGuest, requestInsertQueries, getGuestRequest } from '../../server/domain/requests.ts'
import { upsertLocationReservationConfig } from '../../server/utils/reservations.ts'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { claimDelivery, createDeliveryReceipt, getDeliveryById, getDeliveryRetryEligibility, listDeliveryFailures, recordDeliveryOutcome } from '../../server/domain/guest-threads/deliveries.ts'
import { appendEntry } from '../../server/domain/guest-threads/entries.ts'
import { executeGuestThreadOperation } from '../../server/domain/guest-threads/operations.ts'
import { listGuestThreads, updateThreadProjectionIfLatestEntry } from '../../server/domain/guest-threads/repository.ts'
import { requestBookingChange, respondToBookingChange } from '../../server/domain/guest-threads/booking-changes.ts'
import { notifyContactSubmitted } from '../../server/utils/notifications.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'

test('D1 claims fence concurrent sends and bound ambiguous provider retries', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'guest-delivery-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export class Hub { fetch() { return new Response(null, { status: 204 }) } } export default { fetch() { return new Response("ok") } }' } } },
    exports: { Hub: { type: 'durable-object', storage: 'sqlite' } },
    env: { DB: { type: 'd1' }, GUEST_INBOX_HUBS: { type: 'durable-object', workerName: 'guest-delivery-proof', exportName: 'Hub' } },
  } }] })

  try {
    const db = await runtime.getD1Database('DB')
    const env = { ...await runtime.getBindings<CloudflareEnv>(), BETTER_AUTH_SECRET: 'local-proof-secret-long-enough-for-auth', BETTER_AUTH_URL: 'https://proof.example',
      STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests',
      NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://proof.example', EMAIL_REPLY_SECRET: 'local-reply-proof', EMAIL_DELIVERY_MODE: 'log_only', WHATSAPP_DELIVERY_MODE: 'log_only' }
    await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))).map(statement => db.prepare(statement)))
    for (const statement of [
      "INSERT INTO organization (id, name, slug) VALUES ('org-proof', 'Proof', 'proof')",
      "INSERT INTO sites (id, organization_id, slug, subdomain, brand_name) VALUES ('site-proof', 'org-proof', 'proof', 'proof', 'Proof')",
      "INSERT INTO user (id, name, email) VALUES ('user-proof', 'Proof Owner', 'owner@proof.example')",
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('member-proof','org-proof','user-proof','owner')",
    ]) await db.prepare(statement).run()
    const now = new Date().toISOString()
    const opening = requestInsertQueries({ id: 'contact-proof', kind: 'contact', organization_id: 'org-proof', site_id: 'site-proof', location_id: null, customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null, payload: { guest: { name: 'Proof Guest', email: 'guest@proof.example', phone: null }, subject: null, message: 'Hello', consent_at: null, ip_hash: null }, created_at: now, updated_at: now })
    await db.batch(opening.map(write => db.prepare(write.query).bind(...write.params)))
    await notifyContactSubmitted(env, db, { organizationId: 'org-proof', siteId: 'site-proof', siteName: 'Proof', locationId: null,
      contactId: 'contact-proof', guestName: 'Proof Guest', email: 'guest@proof.example', subject: null, message: 'Hello' })
    assert.equal((await listGuestThreads(db, 'site-proof', { userId: 'user-proof', unreadOnly: true }))[0]?.id, 'contact-proof')
    assert.deepEqual((await db.prepare("SELECT d.purpose,d.status FROM guest_thread_deliveries d JOIN activity_entries e ON e.id=d.entry_id WHERE e.request_id='contact-proof' ORDER BY d.purpose").all()).results,
      [{ purpose: 'guest_acknowledgement', status: 'sent' }, { purpose: 'owner_alert', status: 'sent' }])

    await db.prepare("INSERT INTO business_locations (id,organization_id,site_id,slug,title,timezone,max_capacity,opening_hours) VALUES ('booking-location','org-proof','site-proof','booking','Booking','Asia/Bangkok',10,?)")
      .bind(JSON.stringify({ periods: [{ open: { day: 1, hour: 16, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }] })).run()
    const booking = requestInsertQueries({ id: 'change-proof', kind: 'reservation', organization_id: 'org-proof', site_id: 'site-proof', location_id: 'booking-location',
      customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null,
      payload: threadPayloadForGuest({ name: 'Guest', email: 'guest@proof.example', phone: '+66812345678' }), created_at: now, updated_at: now })
    await db.batch(booking.map(write => db.prepare(write.query).bind(...write.params)))
    // The seats live on the reservation, not the thread: a change proposal is
    // read from and applied to this row.
    await upsertLocationReservationConfig(db, { organizationId: 'org-proof', locationId: 'booking-location', patch: { slot_capacity: 10 }, actorId: 'user-proof' })
    await db.prepare(`INSERT INTO reservations (id,organization_id,site_id,location_id,request_id,timezone,starts_at,ends_at,party_size,status)
      VALUES ('reservation-change-proof','org-proof','site-proof','booking-location','change-proof','Asia/Bangkok','2099-01-05T09:00:00.000Z','2099-01-05T11:00:00.000Z',1,'pending')`).run()
    const propose = async (key: string, partySize: number) => {
      const current = await getGuestRequest(db, 'change-proof')
      assert(current)
      await requestBookingChange(db, env, current, 'user-proof', { kind: 'reservation', bookingDate: '2099-01-05', bookingTime: '16:00', partySize, locationId: 'booking-location', expectedUpdatedAt: current.updated_at }, key)
      const requestId = await db.prepare('SELECT id FROM activity_entries WHERE dedupe_key=?').bind(`booking-change-request:change-proof:${key}`).first<string>('id')
      assert(requestId)
      return { threadId: 'change-proof', requestId, token: createHmac('sha256', env.EMAIL_REPLY_SECRET).update(`booking-change:v1:change-proof:${requestId}`).digest('hex'), decision: 'accept' as const }
    }
    const proposal = await propose('first-change', 2)
    assert.equal((await respondToBookingChange(db, env, proposal)).status, 'accepted')
    assert.equal((await respondToBookingChange(db, env, proposal)).status, 'accepted')
    assert.equal(await db.prepare("SELECT party_size FROM reservations WHERE request_id='change-proof'").first('party_size'), 2)
    assert.equal(await db.prepare("SELECT count(*) AS count FROM activity_entries WHERE request_id='change-proof' AND event_name='booking_change.accepted'").first('count'), 1)
    const stale = await propose('stale-change', 3)
    await executeGuestThreadOperation(db, { threadId: 'change-proof', siteId: 'site-proof', action: 'confirm', actorUserId: 'user-proof', idempotencyKey: 'owner-confirm', env })
    await assert.rejects(respondToBookingChange(db, env, stale), /changed since the request/)
    const concurrent = await propose('concurrent-change', 4)
    const [decision, cancellation] = await Promise.allSettled([respondToBookingChange(db, env, concurrent), executeGuestThreadOperation(db, {
      threadId: 'change-proof', siteId: 'site-proof', action: 'cancel', actorUserId: 'user-proof', idempotencyKey: 'owner-cancel', env })])
    assert(cancellation.status === 'fulfilled' && cancellation.value.ok)
    if (decision.status === 'fulfilled') assert.equal(decision.value.status, 'accepted')
    else assert.match(String(decision.reason), /changed|no longer/)
    assert.equal(await db.prepare("SELECT status FROM reservations WHERE request_id='change-proof'").first('status'), 'cancelled')
    assert.equal(await db.prepare("SELECT count(*) AS count FROM activity_entries WHERE request_id='change-proof' AND event_name='reservation.cancel'").first('count'), 1)
    assert.equal(await db.prepare(`SELECT count(*) AS count FROM activity_entries accepted JOIN activity_entries cancelled ON cancelled.request_id=accepted.request_id
      WHERE accepted.request_id='change-proof' AND accepted.event_name='booking_change.accepted' AND cancelled.event_name='reservation.cancel' AND accepted.sequence>cancelled.sequence`).first('count'), 0)
    await db.prepare("INSERT INTO activity_entries (id,request_id,kind,scope_kind,actor_kind,channel,dedupe_key,sequence,occurred_at) VALUES ('entry-proof','contact-proof','message','request','guest','email','proof',2,'2026-09-05T00:00:00.000Z')").run()


    for (const provider of ['meta', 'resend'] as const) {
      const receipt = await createDeliveryReceipt(db, { entryId: 'entry-proof', channel: provider === 'meta' ? 'whatsapp' : 'email', provider, purpose: 'member_reply', idempotencyKey: `${provider}-proof` })
      assert.notEqual(getDeliveryRetryEligibility(receipt), 'retryable')
      const now = Date.now()
      const claims = await Promise.all([claimDelivery(db, receipt.id, now), claimDelivery(db, receipt.id, now)])
      assert.equal(claims.filter(result => result.claimed).length, 1)
      const winner = claims.find(result => result.claimed)!
      assert(winner.claimed)
      assert.equal((await claimDelivery(db, receipt.id, now + 1)).claimed, false)

      if (provider === 'meta') {
        assert.equal((await claimDelivery(db, receipt.id, now + 60_000)).claimed, false)
        await db.prepare("UPDATE guest_thread_deliveries SET status = 'failed' WHERE id = ?").bind(receipt.id).run()
        assert.equal((await claimDelivery(db, receipt.id, now + 60_000)).claimed, false)
        continue
      }

      const retried = await claimDelivery(db, receipt.id, now + 60_000)
      assert(retried.claimed)
      assert.notEqual(retried.claimVersion, winner.claimVersion)
      await recordDeliveryOutcome(db, { claim: winner, status: 'failed', error: 'late failure' })
      assert.equal((await getDeliveryById(db, receipt.id))!.status, 'unknown')
      await db.prepare("UPDATE guest_thread_deliveries SET status = 'delivered' WHERE id = ?").bind(receipt.id).run()
      await recordDeliveryOutcome(db, { claim: retried, status: 'failed', error: 'late failure after webhook' })
      assert.equal((await getDeliveryById(db, receipt.id))!.status, 'delivered')

      await db.prepare("UPDATE guest_thread_deliveries SET status = 'unknown', created_at = ?, updated_at = ? WHERE id = ?")
        .bind(new Date(now - 86_400_000).toISOString(), new Date(now - 60_000).toISOString(), receipt.id).run()
      assert.equal((await claimDelivery(db, receipt.id, now)).claimed, false)
      assert.notEqual(getDeliveryRetryEligibility((await getDeliveryById(db, receipt.id))!), 'retryable')
    }
    const failedReceipt = await createDeliveryReceipt(db, { entryId: 'entry-proof', channel: 'email', provider: 'resend', purpose: 'member_reply', idempotencyKey: 'failed-email-proof' })
    const firstAttempt = await claimDelivery(db, failedReceipt.id)
    assert(firstAttempt.claimed)
    const failure = await recordDeliveryOutcome(db, { claim: firstAttempt, status: 'failed', error: 'provider rejected request' })
    const retry = await claimDelivery(db, failedReceipt.id, Date.parse(failure.updated_at))
    assert(retry.claimed)
    assert(retry.claimVersion > failure.updated_at)
    assert.equal(retry.delivery.error, null)
    await recordDeliveryOutcome(db, { claim: firstAttempt, status: 'sent' })
    assert.equal((await getDeliveryById(db, failedReceipt.id))!.status, 'unknown')
    const sent = await recordDeliveryOutcome(db, { claim: retry, status: 'sent' })
    assert.equal(sent.status, 'sent')

    const operationKey = 'held-reply-proof'
    const operationDedupeKey = `guest-thread-operation:contact-proof:${operationKey}`
    const deliveryId = `guest-thread-email:contact-proof:${operationKey}`
    await db.prepare(`
      INSERT INTO activity_entries
        (id, request_id, kind, scope_kind, actor_kind, actor_user_id, channel, body, event_name, dedupe_key, sequence, occurred_at)
      VALUES ('entry-held-reply', 'contact-proof', 'message', 'request', 'member', 'user-proof', 'email', 'A held reply', 'thread.member_reply', ?, 3, ?)
    `).bind(operationDedupeKey, new Date().toISOString()).run()
    const heldReceipt = await createDeliveryReceipt(db, {
      entryId: 'entry-held-reply',
      channel: 'email',
      provider: 'resend',
      purpose: 'member_reply',
      idempotencyKey: deliveryId,
    })
    const heldClaim = await claimDelivery(db, heldReceipt.id)
    assert.equal(heldClaim.claimed, true)
    assert.equal((await listDeliveryFailures(db, 'contact-proof')).some(delivery => delivery.id === deliveryId), false)

    const accepted = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: accepted.ok, status: accepted.status }, { ok: true, status: 202 })

    const acceptedRetry = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'retry_delivery',
      actorUserId: 'user-proof',
      deliveryId,
      idempotencyKey: 'held-retry-proof',
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: acceptedRetry.ok, status: acceptedRetry.status }, { ok: true, status: 202 })

    await recordDeliveryOutcome(db, { claim: heldClaim, status: 'sent', providerMessageId: 'provider-proof' })
    const replay = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: replay.ok, status: replay.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM requests WHERE id = ?').bind('contact-proof').first<{ conversation_state: string }>())?.conversation_state, 'waiting_on_guest')

    const resolved = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'resolve',
      actorUserId: 'user-proof',
      idempotencyKey: 'resolve-after-reply-proof',
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: resolved.ok, status: resolved.status }, { ok: true, status: 200 })

    const replayAfterResolve = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: replayAfterResolve.ok, status: replayAfterResolve.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM requests WHERE id = ?').bind('contact-proof').first<{ conversation_state: string }>())?.conversation_state, 'resolved')

    const delayedOperationKey = 'delayed-reply-proof'
    const delayedOperationDedupeKey = `guest-thread-operation:contact-proof:${delayedOperationKey}`
    const delayedDeliveryId = `guest-thread-email:contact-proof:${delayedOperationKey}`
    const delayedReplyEntry = await appendEntry(db, {
      threadId: 'contact-proof',
      kind: 'message',
      actorKind: 'member',
      actorUserId: 'user-proof',
      channel: 'email',
      body: 'A delayed reply',
      eventName: 'thread.member_reply',
      dedupeKey: delayedOperationDedupeKey,
    })
    const delayedReceipt = await createDeliveryReceipt(db, {
      entryId: delayedReplyEntry.id,
      channel: 'email',
      provider: 'resend',
      purpose: 'member_reply',
      idempotencyKey: delayedDeliveryId,
    })
    const delayedClaim = await claimDelivery(db, delayedReceipt.id)
    assert.equal(delayedClaim.claimed, true)

    const inboundEntry = await appendEntry(db, {
      threadId: 'contact-proof',
      kind: 'message',
      actorKind: 'guest',
      channel: 'email',
      body: 'A newer guest reply',
      dedupeKey: 'email:newer-guest-reply-proof',
    })
    await updateThreadProjectionIfLatestEntry(db, 'contact-proof', inboundEntry.id, { conversationState: 'needs_attention' })
    await recordDeliveryOutcome(db, { claim: delayedClaim, status: 'sent', providerMessageId: 'provider-delayed-proof' })

    const delayedCompletion = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A delayed reply',
      idempotencyKey: delayedOperationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: delayedCompletion.ok, status: delayedCompletion.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM requests WHERE id = ?').bind('contact-proof').first<{ conversation_state: string }>())?.conversation_state, 'needs_attention')

    const retryOperationKey = 'failed-reply-proof'
    const retryEntry = await appendEntry(db, {
      threadId: 'contact-proof',
      kind: 'message',
      actorKind: 'member',
      actorUserId: 'user-proof',
      channel: 'email',
      body: 'A failed reply',
      eventName: 'thread.member_reply',
      dedupeKey: `guest-thread-operation:contact-proof:${retryOperationKey}`,
    })
    const retryReceipt = await createDeliveryReceipt(db, {
      entryId: retryEntry.id,
      channel: 'email',
      provider: 'resend',
      purpose: 'member_reply',
      idempotencyKey: `guest-thread-email:contact-proof:${retryOperationKey}`,
    })
    const retryClaim = await claimDelivery(db, retryReceipt.id)
    assert.equal(retryClaim.claimed, true)
    await recordDeliveryOutcome(db, { claim: retryClaim, status: 'failed', error: 'provider rejected request' })

    const resolvedAfterFailure = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'resolve',
      actorUserId: 'user-proof',
      idempotencyKey: 'resolve-after-failed-reply-proof',
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: resolvedAfterFailure.ok, status: resolvedAfterFailure.status }, { ok: true, status: 200 })

    const retriedAfterResolve = await executeGuestThreadOperation(db, {
      threadId: 'contact-proof',
      siteId: 'site-proof',
      action: 'retry_delivery',
      actorUserId: 'user-proof',
      deliveryId: retryReceipt.id,
      idempotencyKey: 'retry-after-resolve-proof',
      env: {},
    })
    assert.deepEqual({ ok: retriedAfterResolve.ok, status: retriedAfterResolve.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM requests WHERE id = ?').bind('contact-proof').first<{ conversation_state: string }>())?.conversation_state, 'resolved')
    assert.equal((await db.prepare('SELECT count(*) count FROM activity_entries WHERE dedupe_key = ?').bind(operationDedupeKey).first<{ count: number }>())?.count, 1)
    assert.equal((await db.prepare('SELECT count(*) count FROM guest_thread_deliveries WHERE id = ?').bind(deliveryId).first<{ count: number }>())?.count, 1)
  } finally {
    await runtime.dispose()
  }
})

test('D1 status-email retries preserve recorded content and reject superseded bookings', async (t) => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'status-retry-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const requests: { subject: string; text: string }[] = []
  let reject = true
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails')
    requests.push(JSON.parse(String(init.body)))
    return reject ? new Response('Provider rejected', { status: 503 }) : Response.json({ id: 'status-proof' })
  })
  try {
    const db = await runtime.getD1Database('DB')
    await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))).map(statement => db.prepare(statement)))
    for (const statement of [
      "INSERT INTO organization (id, name, slug) VALUES ('org-status', 'Proof', 'proof')",
      "INSERT INTO sites (id, organization_id, slug, subdomain, brand_name) VALUES ('site-status', 'org-status', 'proof', 'proof', 'Proof')",
      "INSERT INTO user (id, name, email) VALUES ('user-status', 'Proof Owner', 'owner@proof.example')",
      "INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location-status', 'org-status', 'site-status', 'proof', 'Proof')",
    ]) await db.prepare(statement).run()
    const now = new Date().toISOString()
    const opening = requestInsertQueries({ id: 'booking-status', kind: 'reservation', organization_id: 'org-status', site_id: 'site-status', location_id: 'location-status', customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null, payload: threadPayloadForGuest({ name: 'Guest', email: 'guest@provider-proof.com', phone: '123' }), created_at: now, updated_at: now })
    await db.batch(opening.map(write => db.prepare(write.query).bind(...write.params)))
    // The instant and the zone the guest agreed to live on the reservation; the
    // confirmation email is formatted from them, never from a server clock.
    await db.prepare(`INSERT INTO reservations (id,organization_id,site_id,location_id,request_id,timezone,starts_at,ends_at,party_size,status)
      VALUES ('reservation-status','org-status','site-status','location-status','booking-status','Asia/Bangkok','2026-10-01T11:00:00.000Z','2026-10-01T13:00:00.000Z',2,'pending')`).run()

    const input = {
      threadId: 'booking-status', siteId: 'site-status', actorUserId: 'user-status',
      env: { EMAIL_DELIVERY_MODE: 'provider', RESEND_API_KEY: 'controlled-provider-only' },
    }
    const confirm = { ...input, action: 'confirm', idempotencyKey: 'confirm-status' }
    assert.equal((await executeGuestThreadOperation(db, confirm)).ok, true)
    assert.equal(requests.length, 1)
    const deliveryId = 'guest-thread-email:booking-status:confirm-status'
    assert.equal((await getDeliveryById(db, deliveryId))!.status, 'failed')
    const original = requests[0]!
    assert.equal(original.text, 'Your reservation is confirmed: Oct 1, 2026, 6:00 PM for 2 guests.')
    assert.equal((await executeGuestThreadOperation(db, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-unchanged' })).status, 502)
    assert.deepEqual(requests[1], original)

    // Moving the reservation is what makes the pending send stale — the thread
    // carries no copy of the time to move.
    await db.prepare("UPDATE reservations SET starts_at = '2026-10-02T11:00:00.000Z', ends_at = '2026-10-02T13:00:00.000Z' WHERE request_id = 'booking-status'").run()
    const attemptsBefore = requests.length
    for (const request of [confirm, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-changed' }]) {
      assert.equal((await executeGuestThreadOperation(db, request)).status, 409)
    }
    assert.equal(requests.length, attemptsBefore)
    reject = false
    assert.equal((await executeGuestThreadOperation(db, { ...input, action: 'cancel', idempotencyKey: 'cancel-status' })).ok, true)
    assert.match(requests.at(-1)!.text, /Oct 2, 2026.*cancelled/)
    const afterCancellation = requests.length
    for (const request of [confirm, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-cancelled' }]) {
      assert.equal((await executeGuestThreadOperation(db, request)).status, 409)
    }
    assert.equal(requests.length, afterCancellation)
    assert.equal((await getDeliveryById(db, deliveryId))!.status, 'failed')
    const entry = await db.prepare('SELECT body, payload_json FROM activity_entries WHERE id = ?')
      .bind((await getDeliveryById(db, deliveryId))!.entry_id).first<{ body: string; payload_json: string }>()
    assert.equal(entry!.body, original.text)
    assert.equal(JSON.parse(entry!.payload_json).subject, original.subject)
  } finally {
    await runtime.dispose()
  }
})

test('a booking move into a full session leaves the original booking exactly as it was', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'booking-move-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export class Hub { fetch() { return new Response(null, { status: 204 }) } } export default { fetch() { return new Response("ok") } }' } } },
    exports: { Hub: { type: 'durable-object', storage: 'sqlite' } },
    env: { DB: { type: 'd1' }, GUEST_INBOX_HUBS: { type: 'durable-object', workerName: 'booking-move-proof', exportName: 'Hub' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const env = { ...await runtime.getBindings<CloudflareEnv>(), BETTER_AUTH_SECRET: 'local-proof-secret-long-enough-for-auth', BETTER_AUTH_URL: 'https://proof.example',
      STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests',
      NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://proof.example', EMAIL_REPLY_SECRET: 'local-reply-proof', EMAIL_DELIVERY_MODE: 'log_only', WHATSAPP_DELIVERY_MODE: 'log_only' }
    await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))).map(statement => db.prepare(statement)))
    const now = new Date().toISOString()
    // Both sessions sit inside the window a change request looks at.
    const at = (days: number, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString()
    const soon = at(30)
    const soonEnd = at(30, 1)
    const later = at(60)
    const laterEnd = at(60, 1)
    for (const statement of [
      "INSERT INTO organization (id, name, slug) VALUES ('org-move', 'Move', 'move')",
      "INSERT INTO sites (id, organization_id, slug, subdomain, brand_name) VALUES ('site-move', 'org-move', 'move', 'move', 'Move')",
      "INSERT INTO user (id, name, email) VALUES ('user-move', 'Owner', 'owner@move.example')",
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('member-move','org-move','user-move','owner')",
      "INSERT INTO business_locations (id,organization_id,site_id,slug,title,timezone) VALUES ('loc-move','org-move','site-move','move','Move','Asia/Bangkok')",
      "INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES ('prod-move','org-move','Class','class','user-move','user-move')",
      "INSERT INTO product_variants (id, organization_id, product_id, name, created_by, updated_by) VALUES ('var-move','org-move','prod-move','Adult','user-move','user-move')",
      "INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_by, updated_by) VALUES ('prod-move','org-move',60,4,'user-move','user-move')",
      // The branch offers it: a session at a location only takes seats while
      // that location is still selling the product.
      "INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_by, updated_by) VALUES ('org-move','prod-move','loc-move',1,1,'user-move','user-move')",
      // The destination holds two seats and already has both taken.
      `INSERT INTO product_sessions (id,organization_id,product_id,location_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES ('session-from','org-move','prod-move','loc-move','Asia/Bangkok','${soon}','${soonEnd}',4,'scheduled','user-move','user-move')`,
      `INSERT INTO product_sessions (id,organization_id,product_id,location_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES ('session-to','org-move','prod-move','loc-move','Asia/Bangkok','${later}','${laterEnd}',2,'scheduled','user-move','user-move')`,
      "INSERT INTO bookings (id,organization_id,site_id,product_id,product_session_id,product_variant_id,party_size,status) VALUES ('booking-other','org-move','site-move','prod-move','session-to','var-move',2,'confirmed')",
    ]) await db.prepare(statement).run()
    const thread = requestInsertQueries({ id: 'move-proof', kind: 'booking', organization_id: 'org-move', site_id: 'site-move', location_id: 'loc-move',
      customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null,
      payload: threadPayloadForGuest({ name: 'Guest', email: 'guest@move.example', phone: '+66812345678' }), created_at: now, updated_at: now })
    await db.batch(thread.map(write => db.prepare(write.query).bind(...write.params)))
    await db.prepare(`INSERT INTO bookings (id,organization_id,site_id,product_id,product_session_id,product_variant_id,request_id,party_size,status)
      VALUES ('booking-move','org-move','site-move','prod-move','session-from','var-move','move-proof',1,'confirmed')`).run()

    const current = await getGuestRequest(db, 'move-proof')
    assert(current)
    await requestBookingChange(db, env, current, 'user-move', { kind: 'booking', sessionId: 'session-to', partySize: 1, expectedUpdatedAt: current.updated_at }, 'full-session')
    const requestId = await db.prepare('SELECT id FROM activity_entries WHERE dedupe_key=?').bind('booking-change-request:move-proof:full-session').first<string>('id')
    assert(requestId)
    const token = createHmac('sha256', env.EMAIL_REPLY_SECRET).update(`booking-change:v1:move-proof:${requestId}`).digest('hex')

    await assert.rejects(
      respondToBookingChange(db, env, { threadId: 'move-proof', requestId, token, decision: 'accept' }),
      /filled up/,
      'a full destination refuses the move',
    )
    // Nothing about the original may have moved: not its session, not its
    // status, not the thread it answers.
    const original = await db.prepare("SELECT product_session_id, status, request_id FROM bookings WHERE id='booking-move'").first<{ product_session_id: string; status: string; request_id: string | null }>()
    assert.deepEqual(original, { product_session_id: 'session-from', status: 'confirmed', request_id: 'move-proof' })
    assert.equal(await db.prepare("SELECT count(*) AS count FROM bookings WHERE product_session_id='session-to'").first('count'), 1,
      'no replacement seat was taken in the full session')
    assert.equal(await db.prepare("SELECT count(*) AS count FROM activity_entries WHERE request_id='move-proof' AND event_name='booking_change.accepted'").first('count'), 0,
      'the decision was not recorded for a move that did not happen')
  } finally { await runtime.dispose() }
})
