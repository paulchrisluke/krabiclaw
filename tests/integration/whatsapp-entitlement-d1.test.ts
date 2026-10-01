import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { sendWhatsAppNotification } from '../../server/utils/whatsapp.ts'
import { hasOrganizationEntitlement } from '../../server/utils/billing.ts'
import { notifyDomainLifecycle } from '../../server/utils/domain-notifications.ts'
import { notifyContactSubmitted, notifyGuestThreadReply } from '../../server/utils/notifications.ts'
import { requestInsertQueries } from '../../server/domain/requests.ts'
import { claimDelivery, createDeliveryReceipt, getDeliveryById, getDeliveryRetryEligibility, isVisibleDeliveryFailure, recordDeliveryOutcome } from '../../server/domain/guest-threads/deliveries.ts'
import { appendEntry } from '../../server/domain/guest-threads/entries.ts'

// Real D1 billing, membership, preferences and notification persistence. Only
// the external Meta HTTP boundary is intercepted; no live messages are sent.
test('organization messaging entitlement fences Meta calls while preserving notification fallbacks', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'guest-delivery-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export class Hub { fetch() { return new Response(null, { status: 204 }) } } export default { fetch() { return new Response("ok") } }' } } },
    exports: { Hub: { type: 'durable-object', storage: 'sqlite' } },
    env: { DB: { type: 'd1' }, GUEST_INBOX_HUBS: { type: 'durable-object', worker: 'guest-delivery-proof', exportName: 'Hub' } },
  } }] })

  try {
    const db = await runtime.getD1Database('DB')
    const env = { ...await runtime.getBindings<CloudflareEnv>(), BETTER_AUTH_SECRET: 'local-proof-secret-long-enough-for-auth', BETTER_AUTH_URL: 'https://proof.example',
      STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests',
      NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://proof.example', EMAIL_REPLY_SECRET: 'local-reply-proof', EMAIL_DELIVERY_MODE: 'log_only', WHATSAPP_DELIVERY_MODE: 'log_only' }
    await db.batch((await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))).map(statement => db.prepare(statement)))

    const providerEnv = { ...env, WHATSAPP_DELIVERY_MODE: 'provider', WHATSAPP_PHONE_NUMBER_ID: 'local-proof-phone-id', WHATSAPP_ACCESS_TOKEN: 'local-proof-no-live-token' }
    for (const id of ['free', 'paid']) {
      await db.prepare('INSERT INTO organization (id,name,slug,subdomain) VALUES (?,?,?,?)').bind(id, id, id, id).run()
    }
    await db.prepare("INSERT INTO user (id,name,email,phoneNumber,phoneNumberVerified) VALUES ('owner','Owner','owner@proof.example','+66812345678',1)").run()
    for (const id of ['free', 'paid']) {
      await db.prepare("INSERT INTO member (id,organizationId,userId,role) VALUES (?,?,'owner','owner')").bind(`member-${id}`, id).run()
    }
    await db.prepare("INSERT INTO subscription (id,plan,referenceId,status,periodEnd) VALUES ('paid-sub','growth','paid','active',?)").bind(Math.floor(Date.now() / 1000) + 86400).run()
    let metaCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /^https:\/\/graph\.facebook\.com\//)
      assert.equal(init?.method, 'POST')
      metaCalls++
      return Response.json({ messages: [{ id: `meta-proof-${metaCalls}` }] })
    }
    try {
      const send = (organizationId: string) => sendWhatsAppNotification(providerEnv, { organizationId, toPhone: '+66812345678', template: 'domain_update', vars: { domain: 'proof.example', status: 'active', dashboard_path: 'paid/settings' } })
      const skipped = { success: true, status: 'skipped', reason: 'messaging_not_enabled' }
      assert.deepEqual(await send('free'), skipped)
      assert.equal(metaCalls, 0)
      assert.equal((await send('paid')).status, 'sent')
      assert.equal(metaCalls, 1)
      assert.equal(await hasOrganizationEntitlement(providerEnv, 'paid', 'messaging'), true)
      // An eligibility check made earlier cannot authorize a downgraded send.
      for (const status of ['past_due', 'canceled', 'incomplete', 'unpaid']) {
        await db.prepare("UPDATE subscription SET status=? WHERE id='paid-sub'").bind(status).run()
        assert.deepEqual(await send('paid'), skipped)
      }
      await db.prepare("UPDATE subscription SET status='active',periodEnd=? WHERE id='paid-sub'").bind(Math.floor(Date.now() / 1000) - 60).run()
      assert.deepEqual(await send('paid'), skipped)
      assert.equal(metaCalls, 1)
      await db.prepare("UPDATE subscription SET status='trialing',periodEnd=? WHERE id='paid-sub'").bind(Math.floor(Date.now() / 1000) + 86400).run()
      assert.equal((await send('paid')).status, 'sent')
      assert.equal(metaCalls, 2)
      await db.prepare("UPDATE subscription SET status='active' WHERE id='paid-sub'").run()

      // The same owner belongs to both organizations: eligibility is per org.
      for (const category of ['organization_and_billing', 'guest_messages', 'reservations_bookings']) {
        await db.prepare('INSERT INTO user_notification_preferences (user_id,category,email_enabled,whatsapp_enabled) VALUES (?,?,1,1)').bind('owner', category).run()
      }
      const domain = (organizationId: string, status: string) => notifyDomainLifecycle(providerEnv, db, { organizationId, domain: 'proof.example', status, title: 'Domain update', message: 'Domain status changed', dashboardUrl: `https://proof.example/dashboard/${organizationId}/settings` })
      await domain('free', 'free')
      assert.equal(metaCalls, 2)
      await domain('paid', 'paid')
      assert.equal(metaCalls, 3)
      await db.prepare("UPDATE user_notification_preferences SET whatsapp_enabled=0 WHERE category='organization_and_billing'").run()
      await domain('paid', 'preference-off')
      assert.equal(metaCalls, 3)

      for (const organizationId of ['free', 'paid']) {
        const id = `contact-${organizationId}`
        const now = new Date().toISOString()
        await db.batch(requestInsertQueries({ id, kind: 'contact', organization_id: organizationId, location_id: null, user_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null, payload: { guest: { name: 'Guest', email: 'guest@proof.example', phone: null }, subject: null, message: 'Hello', consent_at: null, ip_hash: null }, created_at: now, updated_at: now }).map(write => db.prepare(write.query).bind(...write.params)))
        const before = metaCalls
        await notifyContactSubmitted(providerEnv, db, { organizationId, organizationName: organizationId, locationId: null, contactId: id, guestName: 'Guest', email: 'guest@proof.example', subject: null, message: 'Hello' })
        assert.equal(metaCalls - before, organizationId === 'paid' ? 1 : 0)
        const entry = await appendEntry(db, { threadId: id, kind: 'message', actorKind: 'guest', channel: 'email', body: 'Reply', dedupeKey: `reply-${id}` })
        const replyBefore = metaCalls
        await notifyGuestThreadReply(providerEnv, db, { organizationId, organizationName: organizationId, threadId: id, sourceEntryId: entry.id, submissionType: 'contact', submissionId: id, guestName: 'Guest', inboundChannel: 'email', messagePreview: 'Reply' })
        assert.equal(metaCalls - replyBefore, organizationId === 'paid' ? 1 : 0)
        const rows = (await db.prepare('SELECT d.channel,d.status FROM guest_thread_deliveries d JOIN activity_entries e ON e.id=d.entry_id WHERE e.request_id=?').bind(id).all<{ channel: string; status: string }>()).results
        assert(rows.some(row => row.channel === 'email' && row.status === 'sent'), 'email fallback persists')
        assert.equal(rows.filter(row => row.channel === 'whatsapp').length, organizationId === 'paid' ? 2 : 0)
        assert.equal(await db.prepare("SELECT count(*) AS count FROM activity_entries WHERE kind='notification' AND organization_id=?").bind(organizationId).first('count'), organizationId === 'paid' ? 4 : 3, 'dashboard alerts persist independently of WhatsApp')
      }
      await db.prepare("UPDATE user_notification_preferences SET whatsapp_enabled=0 WHERE category='guest_messages'").run()
      const entry = await appendEntry(db, { threadId: 'contact-paid', kind: 'message', actorKind: 'guest', channel: 'email', body: 'Opted out', dedupeKey: 'reply-optout' })
      const before = metaCalls
      await notifyGuestThreadReply(providerEnv, db, { organizationId: 'paid', organizationName: 'paid', threadId: 'contact-paid', sourceEntryId: entry.id, submissionType: 'contact', submissionId: 'contact-paid', guestName: 'Guest', inboundChannel: 'email', messagePreview: 'Opted out' })
      assert.equal(metaCalls, before)
      // A claimed notification whose organization downgrades is explicitly
      // skipped, settled and not represented as a failed or sent delivery.
      const receipt = await createDeliveryReceipt(db, { entryId: entry.id, channel: 'whatsapp', provider: 'meta', purpose: 'owner_alert', idempotencyKey: 'downgrade-proof' })
      const claim = await claimDelivery(db, receipt.id)
      assert(claim.claimed)
      await db.prepare("UPDATE subscription SET status='canceled' WHERE id='paid-sub'").run()
      const result = await send('paid')
      assert.equal(result.status, 'skipped')
      if (result.status !== 'skipped') assert.fail('Expected a skipped result')
      await recordDeliveryOutcome(db, { claim, status: result.status, error: result.reason })
      const persisted = await getDeliveryById(db, receipt.id)
      assert(persisted)
      assert.equal(persisted.status, 'skipped')
      assert.equal(persisted.provider_message_id, null)
      assert.equal(isVisibleDeliveryFailure(persisted), false)
      assert.notEqual(getDeliveryRetryEligibility(persisted), 'retryable')
      assert.equal((await claimDelivery(db, receipt.id)).claimed, false)
      assert.equal(metaCalls, before)
    } finally {
      globalThis.fetch = originalFetch
    }
  } finally {
    await runtime.dispose()
  }
})
