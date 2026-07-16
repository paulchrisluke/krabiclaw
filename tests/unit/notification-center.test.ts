import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  getDiscordDeliveryMode,
  NOTIFICATION_EVENT_TYPES,
  notifyNewUserSignup,
  redactNotificationPayload,
  tenantEventTypeForTemplate,
} from '../../server/utils/notification-center.ts'

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

  await notifyNewUserSignup(d1, { DISCORD_DELIVERY_MODE: 'log_only' }, {
    id: 'user-1',
    email: 'person@example.com',
  })

  assert.equal(calls.length, 3)
  assert.match(calls[0]!.sql, /INSERT INTO notifications/)
  assert.ok(calls[0]!.params.includes(NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP))
  assert.ok(!JSON.stringify(calls).includes('person@example.com'))
  assert.match(calls[1]!.sql, /INSERT INTO notification_deliveries/)
  assert.match(calls[2]!.sql, /UPDATE notification_deliveries/)
  assert.ok(calls[2]!.params.includes('log_only:discord'))
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
  assert.doesNotMatch(sql, /SELECT "id"[^;]+"scope"[^;]+FROM `notifications`/)
})
