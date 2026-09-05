import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { claimDelivery, createDeliveryReceipt, getDeliveryById, getDeliveryRetryEligibility, recordDeliveryOutcome } from '../../server/domain/guest-threads/deliveries.ts'

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
      "INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site-proof', 'org-proof', 'proof', 'proof')",
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
    await recordDeliveryOutcome(db, { claim: firstAttempt, status: 'sent' })
    assert.equal((await getDeliveryById(db, failedReceipt.id))!.status, 'unknown')
    const sent = await recordDeliveryOutcome(db, { claim: retry, status: 'sent' })
    assert.equal(sent.status, 'sent')
  } finally {
    await runtime.dispose()
  }
})
