import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { claimDelivery, createDeliveryReceipt, getDeliveryById, getDeliveryRetryEligibility, listDeliveryFailures, recordDeliveryOutcome } from '../../server/domain/guest-threads/deliveries.ts'
import { appendEntry } from '../../server/domain/guest-threads/entries.ts'
import { executeGuestThreadOperation } from '../../server/domain/guest-threads/operations.ts'
import { updateThreadProjectionIfLatestEntry } from '../../server/domain/guest-threads/repository.ts'

test('D1 claims fence concurrent sends and bound ambiguous provider retries', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'guest-delivery-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })

  try {
    const db = await runtime.getD1Database('DB')
    for (const statement of readFileSync('migrations/0000_epoch_4_baseline.sql', 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
    for (const statement of [
      "INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')",
      "INSERT INTO organization (id, name, slug) VALUES ('org-proof', 'Proof', 'proof')",
      "INSERT INTO sites (id, organization_id, slug, subdomain, brand_name) VALUES ('site-proof', 'org-proof', 'proof', 'proof', 'Proof')",
      "INSERT INTO user (id, name, email) VALUES ('user-proof', 'Proof Owner', 'owner@proof.example')",
      "INSERT INTO contact_submissions (id, organization_id, site_id, name, email, message) VALUES ('contact-proof', 'org-proof', 'site-proof', 'Proof Guest', 'guest@proof.example', 'Hello')",
      "INSERT INTO guest_threads (id, organization_id, site_id, submission_type, submission_id) VALUES ('thread-proof', 'org-proof', 'site-proof', 'contact', 'contact-proof')",
      "INSERT INTO guest_thread_entries (id, thread_id, kind, actor_kind, channel, dedupe_key, sequence, occurred_at) VALUES ('entry-proof', 'thread-proof', 'message', 'guest', 'email', 'proof', 1, '2026-09-05T00:00:00.000Z')",
    ]) await db.prepare(statement).run()

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
    const operationDedupeKey = `guest-thread-operation:thread-proof:${operationKey}`
    const deliveryId = `guest-thread-email:thread-proof:${operationKey}`
    await db.prepare(`
      INSERT INTO guest_thread_entries
        (id, thread_id, kind, actor_kind, actor_user_id, channel, body, event_name, dedupe_key, sequence, occurred_at)
      VALUES ('entry-held-reply', 'thread-proof', 'message', 'member', 'user-proof', 'email', 'A held reply', 'thread.member_reply', ?, 2, ?)
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
    assert.equal((await listDeliveryFailures(db, 'thread-proof')).some(delivery => delivery.id === deliveryId), false)

    const accepted = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: accepted.ok, status: accepted.status }, { ok: true, status: 202 })

    const acceptedRetry = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
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
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: replay.ok, status: replay.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM guest_threads WHERE id = ?').bind('thread-proof').first<{ conversation_state: string }>())?.conversation_state, 'waiting_on_guest')

    const resolved = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'resolve',
      actorUserId: 'user-proof',
      idempotencyKey: 'resolve-after-reply-proof',
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: resolved.ok, status: resolved.status }, { ok: true, status: 200 })

    const replayAfterResolve = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A held reply',
      idempotencyKey: operationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: replayAfterResolve.ok, status: replayAfterResolve.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM guest_threads WHERE id = ?').bind('thread-proof').first<{ conversation_state: string }>())?.conversation_state, 'resolved')

    const delayedOperationKey = 'delayed-reply-proof'
    const delayedOperationDedupeKey = `guest-thread-operation:thread-proof:${delayedOperationKey}`
    const delayedDeliveryId = `guest-thread-email:thread-proof:${delayedOperationKey}`
    const delayedReplyEntry = await appendEntry(db, {
      threadId: 'thread-proof',
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
      threadId: 'thread-proof',
      kind: 'message',
      actorKind: 'guest',
      channel: 'email',
      body: 'A newer guest reply',
      dedupeKey: 'email:newer-guest-reply-proof',
    })
    await updateThreadProjectionIfLatestEntry(db, 'thread-proof', inboundEntry.id, { conversationState: 'needs_attention' })
    await recordDeliveryOutcome(db, { claim: delayedClaim, status: 'sent', providerMessageId: 'provider-delayed-proof' })

    const delayedCompletion = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'reply',
      actorUserId: 'user-proof',
      body: 'A delayed reply',
      idempotencyKey: delayedOperationKey,
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: delayedCompletion.ok, status: delayedCompletion.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM guest_threads WHERE id = ?').bind('thread-proof').first<{ conversation_state: string }>())?.conversation_state, 'needs_attention')

    const retryOperationKey = 'failed-reply-proof'
    const retryEntry = await appendEntry(db, {
      threadId: 'thread-proof',
      kind: 'message',
      actorKind: 'member',
      actorUserId: 'user-proof',
      channel: 'email',
      body: 'A failed reply',
      eventName: 'thread.member_reply',
      dedupeKey: `guest-thread-operation:thread-proof:${retryOperationKey}`,
    })
    const retryReceipt = await createDeliveryReceipt(db, {
      entryId: retryEntry.id,
      channel: 'email',
      provider: 'resend',
      purpose: 'member_reply',
      idempotencyKey: `guest-thread-email:thread-proof:${retryOperationKey}`,
    })
    const retryClaim = await claimDelivery(db, retryReceipt.id)
    assert.equal(retryClaim.claimed, true)
    await recordDeliveryOutcome(db, { claim: retryClaim, status: 'failed', error: 'provider rejected request' })

    const resolvedAfterFailure = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'resolve',
      actorUserId: 'user-proof',
      idempotencyKey: 'resolve-after-failed-reply-proof',
      env: { EMAIL_DELIVERY_MODE: 'provider' },
    })
    assert.deepEqual({ ok: resolvedAfterFailure.ok, status: resolvedAfterFailure.status }, { ok: true, status: 200 })

    const retriedAfterResolve = await executeGuestThreadOperation(db, {
      threadId: 'thread-proof',
      siteId: 'site-proof',
      action: 'retry_delivery',
      actorUserId: 'user-proof',
      deliveryId: retryReceipt.id,
      idempotencyKey: 'retry-after-resolve-proof',
      env: {},
    })
    assert.deepEqual({ ok: retriedAfterResolve.ok, status: retriedAfterResolve.status }, { ok: true, status: 200 })
    assert.equal((await db.prepare('SELECT conversation_state FROM guest_threads WHERE id = ?').bind('thread-proof').first<{ conversation_state: string }>())?.conversation_state, 'resolved')
    assert.equal((await db.prepare('SELECT count(*) count FROM guest_thread_entries WHERE dedupe_key = ?').bind(operationDedupeKey).first<{ count: number }>())?.count, 1)
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
    for (const statement of readFileSync('migrations/0000_epoch_4_baseline.sql', 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
    for (const statement of [
      "INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')",
      "INSERT INTO organization (id, name, slug) VALUES ('org-status', 'Proof', 'proof')",
      "INSERT INTO sites (id, organization_id, slug, subdomain, brand_name) VALUES ('site-status', 'org-status', 'proof', 'proof', 'Proof')",
      "INSERT INTO user (id, name, email) VALUES ('user-status', 'Proof Owner', 'owner@proof.example')",
      "INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location-status', 'org-status', 'site-status', 'proof', 'Proof')",
      "INSERT INTO reservation_submissions (id, organization_id, site_id, location_id, name, email, phone, date, time, guests) VALUES ('booking-status', 'org-status', 'site-status', 'location-status', 'Guest', 'guest@provider-proof.com', '123', '2026-10-01', '18:00', '2')",
      "INSERT INTO guest_threads (id, organization_id, site_id, submission_type, submission_id) VALUES ('thread-status', 'org-status', 'site-status', 'reservation', 'booking-status')",
    ]) await db.prepare(statement).run()
    const input = {
      threadId: 'thread-status', siteId: 'site-status', actorUserId: 'user-status',
      env: { EMAIL_DELIVERY_MODE: 'provider', RESEND_API_KEY: 'controlled-provider-only' },
    }
    const confirm = { ...input, action: 'confirm', idempotencyKey: 'confirm-status' }
    assert.equal((await executeGuestThreadOperation(db, confirm)).ok, true)
    assert.equal(requests.length, 1)
    const deliveryId = 'guest-thread-email:thread-status:confirm-status'
    assert.equal((await getDeliveryById(db, deliveryId))!.status, 'failed')
    const original = requests[0]!
    assert.equal(original.text, 'Your reservation is confirmed: 2026-10-01 at 18:00 for 2 guests.')
    assert.equal((await executeGuestThreadOperation(db, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-unchanged' })).status, 502)
    assert.deepEqual(requests[1], original)

    await db.prepare("UPDATE reservation_submissions SET date = '2026-10-02' WHERE id = 'booking-status'").run()
    const attemptsBefore = requests.length
    for (const request of [confirm, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-changed' }]) {
      assert.equal((await executeGuestThreadOperation(db, request)).status, 409)
    }
    assert.equal(requests.length, attemptsBefore)
    reject = false
    assert.equal((await executeGuestThreadOperation(db, { ...input, action: 'cancel', idempotencyKey: 'cancel-status' })).ok, true)
    assert.match(requests.at(-1)!.text, /2026-10-02.*cancelled/)
    const afterCancellation = requests.length
    for (const request of [confirm, { ...input, action: 'retry_delivery', deliveryId, idempotencyKey: 'retry-cancelled' }]) {
      assert.equal((await executeGuestThreadOperation(db, request)).status, 409)
    }
    assert.equal(requests.length, afterCancellation)
    assert.equal((await getDeliveryById(db, deliveryId))!.status, 'failed')
    const entry = await db.prepare('SELECT body, payload_json FROM guest_thread_entries WHERE id = ?')
      .bind((await getDeliveryById(db, deliveryId))!.entry_id).first<{ body: string; payload_json: string }>()
    assert.equal(entry!.body, original.text)
    assert.equal(JSON.parse(entry!.payload_json).subject, original.subject)
  } finally {
    await runtime.dispose()
  }
})
