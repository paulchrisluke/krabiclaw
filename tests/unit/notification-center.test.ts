import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  getDiscordDeliveryMode,
  NOTIFICATION_EVENT_TYPES,
  notifyNewUserSignup,
  redactNotificationPayload,
  tenantEventTypeForTemplate,
} from '../../server/utils/notification-center.ts'
import { composeOwnerThreadInboxUrl } from '../../server/utils/dashboard-notification-links.ts'

test('Discord delivery mode fails closed', () => {
  assert.equal(getDiscordDeliveryMode({}), 'log_only')
  assert.equal(getDiscordDeliveryMode({ DISCORD_DELIVERY_MODE: '' }), 'log_only')
  assert.equal(getDiscordDeliveryMode({ DISCORD_DELIVERY_MODE: 'send' }), 'log_only')
  assert.equal(getDiscordDeliveryMode({ DISCORD_DELIVERY_MODE: 'PROVIDER' }), 'provider')
})

test('notification payload redaction handles nested secrets and personal data', () => {
  assert.deepEqual(redactNotificationPayload({
    event: 'platform.user_signup',
    user: { email: 'person@example.com', profile: { phone: '+6612345678' }, id: 'user-1' },
    authorization: 'Bearer secret',
  }), {
    event: 'platform.user_signup',
    user: { email: '[redacted]', profile: { phone: '[redacted]' }, id: 'user-1' },
    authorization: '[redacted]',
  })
})

test('tenant event taxonomy distinguishes reservations, bookings, messages, replies, and reviews', () => {
  assert.equal(tenantEventTypeForTemplate('new_reservation', { reservation_id: 'r1' }), NOTIFICATION_EVENT_TYPES.RESERVATION_CREATED)
  assert.equal(tenantEventTypeForTemplate('reservation_cancelled', { reservation_id: 'r1' }), NOTIFICATION_EVENT_TYPES.RESERVATION_CANCELLED)
  assert.equal(tenantEventTypeForTemplate('new_reservation', { booking_id: 'b1' }), NOTIFICATION_EVENT_TYPES.BOOKING_CREATED)
  assert.equal(tenantEventTypeForTemplate('experience_booking_cancelled', { booking_id: 'b1' }), NOTIFICATION_EVENT_TYPES.BOOKING_CANCELLED)
  assert.equal(tenantEventTypeForTemplate('new_contact_msg', { contact_id: 'c1' }), NOTIFICATION_EVENT_TYPES.CONTACT_MESSAGE_CREATED)
  assert.equal(tenantEventTypeForTemplate('guest_thread_reply', { thread_id: 't1' }), NOTIFICATION_EVENT_TYPES.GUEST_REPLY_CREATED)
  assert.equal(tenantEventTypeForTemplate('new_review', { review_id: 'v1' }), NOTIFICATION_EVENT_TYPES.REVIEW_CREATED)
})

test('signup dispatch stores a canonical record and a log-only Discord delivery without personal data', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const d1 = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              calls.push({ sql, params })
              return { success: true, meta: { changes: 1 } }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  let scheduled: Promise<unknown> | undefined
  await notifyNewUserSignup(d1, { DISCORD_DELIVERY_MODE: 'log_only' }, {
    id: 'user-1',
    email: 'person@example.com',
  }, task => { scheduled = task })

  assert.ok(scheduled)
  await scheduled

  assert.equal(calls.length, 3)
  assert.match(calls[0]!.sql, /INSERT INTO notifications/)
  assert.ok(calls[0]!.params.includes(NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP))
  assert.ok(!JSON.stringify(calls).includes('person@example.com'))
  assert.match(calls[1]!.sql, /INSERT INTO notification_deliveries/)
  assert.match(calls[2]!.sql, /UPDATE notification_deliveries/)
  assert.ok(calls[2]!.params.includes('log_only:discord'))
})

test('slow or rejected Discord delivery never blocks signup persistence', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const d1 = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              calls.push({ sql, params })
              return { success: true, meta: { changes: 1 } }
            },
          }
        },
      }
    },
  } as unknown as D1Database
  const originalFetch = globalThis.fetch
  let releaseFetch!: (_response: Response) => void
  globalThis.fetch = () => new Promise<Response>(resolve => { releaseFetch = resolve })

  try {
    let scheduled: Promise<unknown> | undefined
    await notifyNewUserSignup(d1, {
      DISCORD_DELIVERY_MODE: 'provider',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/test-token',
    }, {
      id: 'user-slow',
      email: 'slow@example.com',
    }, task => { scheduled = task })

    assert.ok(scheduled, 'Discord work was not handed to the request scheduler')
    assert.match(calls[0]!.sql, /INSERT INTO notifications/)
    assert.ok(calls[0]!.params.includes(NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP))
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(typeof releaseFetch, 'function')
    releaseFetch(new Response(JSON.stringify({ id: 'discord-message' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    await scheduled

    globalThis.fetch = async () => { throw new Error('network unavailable') }
    let rejectedDelivery: Promise<unknown> | undefined
    await notifyNewUserSignup(d1, {
      DISCORD_DELIVERY_MODE: 'provider',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/test-token',
    }, {
      id: 'user-rejected',
      email: 'rejected@example.com',
    }, task => { rejectedDelivery = task })
    assert.ok(rejectedDelivery)
    await rejectedDelivery
    assert.ok(calls.some(call => /UPDATE notification_deliveries/.test(call.sql) && call.params.includes('request_failed')))
    assert.ok(calls.filter(call => /INSERT INTO notifications/.test(call.sql)).length >= 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('auth route passes request-scoped waitUntil into the uncached auth hook', () => {
  const route = readFileSync('server/api/auth/[...].ts', 'utf8')
  const auth = readFileSync('server/utils/auth.ts', 'utf8')
  assert.match(route, /createAuth\(env, \{ waitUntil \}\)/)
  assert.match(auth, /options\.waitUntil \? null : authCache\.get/)
  assert.match(auth, /notifyNewUserSignup\([\s\S]+options\.waitUntil/)
})

test('dashboard notification writers use canonical fields and guest replies emit once', () => {
  for (const file of [
    'server/utils/domain-notifications.ts',
    'server/utils/site-transfer-notifications.ts',
    'server/utils/submission-messages.ts',
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /(?:create|build)CanonicalNotification/)
    assert.doesNotMatch(source, /INSERT INTO notifications[\s\S]{0,300}'dashboard'/)
  }

  const notifications = readFileSync('server/utils/notifications.ts', 'utf8')
  const guestReplyWriter = notifications.slice(notifications.indexOf('async function notifyGuestThreadReplyInner'))
  assert.doesNotMatch(guestReplyWriter, /createCanonicalNotification/)

  const inboundWriter = readFileSync('server/utils/submission-messages.ts', 'utf8')
  assert.match(inboundWriter, /buildOwnerThreadInboxUrl\(env, db/)
  assert.match(inboundWriter, /deepLink: replyUrl/)
  assert.equal(inboundWriter.match(/buildCanonicalNotificationInsert\(\{/g)?.length, 1)
})

test('canonical guest-reply deep link targets the exact dashboard inbox thread', () => {
  assert.equal(composeOwnerThreadInboxUrl({
    NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://staging.krabiclaw.com/',
  }, {
    orgSlug: 'krabi-team',
    siteSlug: 'sunset-cafe',
    locationSlug: 'ao-nang',
  }, 'thread/with spaces'), 'https://staging.krabiclaw.com/dashboard/krabi-team/sites/sunset-cafe/locations/ao-nang/inbox?thread=thread%2Fwith+spaces')

  assert.equal(composeOwnerThreadInboxUrl({
    NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://staging.krabiclaw.com/',
  }, {
    orgSlug: 'krabi-team',
    siteSlug: 'sunset-cafe',
    locationSlug: null,
  }, 'site-thread'), 'https://staging.krabiclaw.com/dashboard/krabi-team/sites/sunset-cafe/inbox?thread=site-thread')
})

test('notification migration preserves legacy rows while adding per-user read and delivery relations', () => {
  const migrationDirectory = join(process.cwd(), 'migrations')
  const notificationMigration = readdirSync(migrationDirectory)
    .filter(file => /^\d{4}_.+\.sql$/.test(file))
    .find(file => readFileSync(join(migrationDirectory, file), 'utf8').includes('CREATE TABLE `notification_reads`'))
  assert.ok(notificationMigration, 'notification center migration is missing')
  const sql = readFileSync(join(migrationDirectory, notificationMigration), 'utf8')
  assert.match(sql, /CREATE TABLE `notification_reads`/)
  assert.match(sql, /CREATE TABLE `notification_deliveries`/)
  assert.match(sql, /CASE WHEN "site_id" IS NOT NULL THEN 'site' ELSE 'organization' END/)
  assert.match(sql, /json_extract\(CASE WHEN json_valid\("payload"\)/)
  assert.match(sql, /THEN 'booking\.cancelled'/)
  assert.match(sql, /THEN 'reservation\.created'/)
  assert.match(sql, /THEN 'guest_reply\.created'/)
  assert.match(sql, /ELSE "template"/)
  assert.doesNotMatch(sql, /SELECT "id"[^;]+"scope"[^;]+FROM `notifications`/)
})

test('notification migration backfills canonical event types and preserves unknown templates', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY NOT NULL, organization_id TEXT, site_id TEXT, location_id TEXT,
      channel TEXT NOT NULL, template TEXT NOT NULL, recipient TEXT, title TEXT, payload TEXT,
      status TEXT NOT NULL, provider_message_id TEXT, error TEXT, read_at TEXT, sent_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE sites (id TEXT PRIMARY KEY);
    CREATE TABLE business_locations (id TEXT PRIMARY KEY);
    CREATE TABLE user (id TEXT PRIMARY KEY);
  `)
  const insert = db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, payload, status, created_at)
    VALUES (?, 'org', 'site', ?, ?, ?, 'sent', '2026-07-16T00:00:00.000Z')
  `)
  insert.run('booking-new', 'dashboard', 'new_reservation', '{"booking_id":"b1"}')
  insert.run('booking-cancel', 'dashboard', 'reservation_cancelled', '{"booking_id":"b1"}')
  insert.run('reservation-new', 'dashboard', 'new_reservation', '{"reservation_id":"r1"}')
  insert.run('guest-reply', 'dashboard', 'submission_reply_email', '{"thread_id":"t1"}')
  insert.run('domain', 'dashboard', 'domain_update', '{}')
  insert.run('unknown', 'dashboard', 'future_event', '{broken')
  insert.run('email', 'email', 'new_reservation', '{"booking_id":"b2"}')

  const sql = readFileSync('migrations/0053_simple_mentallo.sql', 'utf8').replaceAll('--> statement-breakpoint', '')
  db.exec(sql)
  const rows = db.prepare('SELECT id, event_type FROM notifications ORDER BY id').all()
    .map(row => ({ id: String(row.id), event_type: row.event_type === null ? null : String(row.event_type) }))
  assert.deepEqual(rows, [
    { id: 'booking-cancel', event_type: 'booking.cancelled' },
    { id: 'booking-new', event_type: 'booking.created' },
    { id: 'domain', event_type: 'domain.updated' },
    { id: 'email', event_type: null },
    { id: 'guest-reply', event_type: 'guest_reply.created' },
    { id: 'reservation-new', event_type: 'reservation.created' },
    { id: 'unknown', event_type: 'future_event' },
  ])
  db.close()
})
