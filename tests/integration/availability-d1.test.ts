import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import {
  CapacityUnavailableError,
  setProductBookingConfig,
  deleteProductBookingConfig,
  replaceWeeklySchedule,
  claimSessionCapacity,
  listSessions,
  materializeSessions,
  setBookingStatus,
  sessionMoveQuery,
  updateSession,
} from '../../server/utils/availability.ts'
import { requestInsertQueries, threadPayloadForGuest, getThreadOperationalRecord } from '../../server/domain/requests.ts'
import { executeGuestThreadOperation } from '../../server/domain/guest-threads/operations.ts'
import { occurrenceKey } from '../../shared/bookings.ts'
import { addLocalDays, localDateTimeToInstant, localNow } from '../../utils/timezone.ts'

const ORG = 'org-sessions'
const LOCATION = 'loc-sessions'
const PRODUCT = 'prod-class'
const ACTOR = 'user-actor'
const NOW = '2026-09-11T00:00:00.000Z'

async function boot(legacy = false) {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'availability-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = legacy
    ? ['0000_baseline', '0001_message_attachments', '0002_native_consultation_foundation', '0003_provider_calendar_payments'].flatMap(name => readFileSync(`migrations/${name}.sql`, 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean))
    : await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  await db.prepare(`INSERT INTO organization (id, name, slug, subdomain, settings_json, theme_id, default_currency, status, onboarding_status, url_structure, vertical, updated_at)
    VALUES (?, 'Sessions', 'sessions', 'sessions', '{"config":{"default_timezone":"Asia/Bangkok"}}', 'theme', 'THB', 'active', 'complete', 'flat', 'experience', ?)`)
    .bind(ORG, NOW).run()
  await db.prepare(`INSERT INTO business_locations (id, organization_id, slug, title, status, timezone, created_at, updated_at)
    VALUES (?, ?, 'studio', 'Studio', 'active', 'Asia/Bangkok', ?, ?)`).bind(LOCATION, ORG, NOW, NOW).run()
  await db.prepare(`INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES (?, ?, 'Pottery Class', 'pottery-class', ?, ?)`)
    .bind(PRODUCT, ORG, ACTOR, ACTOR).run()
  await db.prepare('INSERT INTO product_publications (organization_id, product_id, published, created_by, updated_by) VALUES (?, ?, 1, ?, ?)').bind(ORG, PRODUCT, ACTOR, ACTOR).run()
  for (const [id, name] of [['var-adult', 'Adult'], ['var-child', 'Child']]) {
    await db.prepare(`INSERT INTO product_variants (id, organization_id, product_id, name, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, ORG, PRODUCT, name, ACTOR, ACTOR).run()
  }
  // The studio sells it: a session at a location takes seats only while that
  // location is still offering the product.
  await db.prepare(`INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_by, updated_by)
    VALUES (?, ?, ?, 1, 1, ?, ?)`).bind(ORG, PRODUCT, LOCATION, ACTOR, ACTOR).run()
  await db.prepare(`INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_by, updated_by)
    VALUES (?, ?, 120, 10, ?, ?)`).bind(PRODUCT, ORG, ACTOR, ACTOR).run()
  return { runtime, db }
}

function addRule(db: D1Database, id: string, over: Partial<{ weekday: number; start_time: string; timezone: string; location_id: string | null }> = {}) {
  return db.prepare(`INSERT INTO product_availability_rules
    (id, organization_id, product_id, location_id, timezone, weekday, start_time, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, ORG, PRODUCT, over.location_id === undefined ? LOCATION : over.location_id, over.timezone ?? 'Asia/Bangkok', over.weekday ?? 0,
      over.start_time ?? '14:00', ACTOR, ACTOR).run()
}

test('session materialization is idempotent across cancel, edit and reschedule', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await addRule(db, 'rule-sunday')
    const first = await materializeSessions(db, { organizationId: ORG, productId: PRODUCT, throughDate: '2026-10-31', actorId: ACTOR })
    assert(first.created > 0, 'the weekly rule generates sessions')
    assert.equal(first.existing, 0)
    const count = await db.prepare('SELECT count(*) n FROM product_sessions').first<number>('n')

    // Re-running changes nothing.
    const second = await materializeSessions(db, { organizationId: ORG, productId: PRODUCT, throughDate: '2026-10-31', actorId: ACTOR })
    assert.equal(second.created, 0, 'regeneration must not duplicate a session')
    assert.equal(second.existing, first.created)
    assert.equal(await db.prepare('SELECT count(*) n FROM product_sessions').first<number>('n'), count)

    const target = await db.prepare('SELECT id, source_occurrence_key, starts_at FROM product_sessions ORDER BY starts_at LIMIT 1')
      .first<{ id: string; source_occurrence_key: string; starts_at: string }>()
    assert(target)

    // A cancelled occurrence stays cancelled.
    await updateSession(db, { organizationId: ORG, sessionId: target.id, actorId: ACTOR, status: 'cancelled' })
    await materializeSessions(db, { organizationId: ORG, productId: PRODUCT, throughDate: '2026-10-31', actorId: ACTOR })
    assert.equal(await db.prepare('SELECT status FROM product_sessions WHERE id = ?').bind(target.id).first<string>('status'), 'cancelled',
      'regeneration must not resurrect a cancelled occurrence')
    assert.equal(await db.prepare('SELECT count(*) n FROM product_sessions').first<number>('n'), count)

    // A rescheduled occurrence is not recreated at its old start.
    const moved = await db.prepare('SELECT id, starts_at, ends_at FROM product_sessions WHERE status = ? ORDER BY starts_at LIMIT 1')
      .bind('scheduled').first<{ id: string; starts_at: string; ends_at: string }>()
    assert(moved)
    const newStart = new Date(Date.parse(moved.starts_at) + 3_600_000).toISOString()
    await updateSession(db, { organizationId: ORG, sessionId: moved.id, actorId: ACTOR, startsAt: newStart, endsAt: new Date(Date.parse(moved.ends_at) + 3_600_000).toISOString(), capacity: 4 })
    await materializeSessions(db, { organizationId: ORG, productId: PRODUCT, throughDate: '2026-10-31', actorId: ACTOR })
    const after = await db.prepare('SELECT starts_at, capacity FROM product_sessions WHERE id = ?').bind(moved.id).first<{ starts_at: string; capacity: number }>()
    assert.equal(after?.starts_at, newStart, 'a rescheduled session keeps its new time')
    assert.equal(after?.capacity, 4, 'regeneration must not overwrite an edited capacity')
    assert.equal(await db.prepare('SELECT count(*) n FROM product_sessions').first<number>('n'), count,
      'regeneration must not recreate a rescheduled occurrence under its old start')
  } finally { await runtime.dispose() }
})

test('DST gaps and folds are reported, never silently resolved', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    // Generation is bounded to a year ahead, so the transition dates are found
    // inside that window rather than hardcoded — the test stays true as time
    // passes instead of expiring on a fixed date.
    const zone = 'America/Los_Angeles'
    // One window for both the search and the generation: searching a day
    // further than sessions are generated could find a transition the run never
    // reached, depending on the date the suite happened to run.
    const WINDOW_DAYS = 359
    const findSunday = (time: string): string | null => {
      const today = localNow(zone).date
      for (let offset = 1; offset <= WINDOW_DAYS; offset += 1) {
        const date = addLocalDays(today, offset)
        if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) continue
        try { localDateTimeToInstant(date, time, zone, 'reject') }
        catch (error) { if (error instanceof RangeError) return date; throw error }
      }
      return null
    }
    const gapDate = findSunday('02:30')
    const foldDate = findSunday('01:30')
    assert(gapDate, 'a spring-forward Sunday exists within the generation window')
    assert(foldDate, 'a fall-back Sunday exists within the generation window')

    await addRule(db, 'rule-gap', { timezone: zone, weekday: 0, start_time: '02:30', location_id: null })
    await addRule(db, 'rule-fold', { timezone: zone, weekday: 0, start_time: '01:30', location_id: null })
    const result = await materializeSessions(db, {
      organizationId: ORG, productId: PRODUCT, throughDate: addLocalDays(localNow(zone).date, WINDOW_DAYS), actorId: ACTOR,
    })

    const gap = result.skipped.find(entry => entry.local_date === gapDate && entry.local_start_time === '02:30')
    assert(gap, `the spring-forward occurrence on ${gapDate} is reported`)
    assert.equal(gap.reason, 'nonexistent_local_time')
    const fold = result.skipped.find(entry => entry.local_date === foldDate && entry.local_start_time === '01:30')
    assert(fold, `the fall-back occurrence on ${foldDate} is reported`)
    assert.equal(fold.reason, 'ambiguous_local_time')

    const rows = await db.prepare('SELECT starts_at FROM product_sessions ORDER BY starts_at').all<{ starts_at: string }>()
    assert(rows.results.length > 0, 'the surrounding Sundays still generate')
    const localDay = (instant: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
    const localTime = (instant: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant))
    // The other rule still runs on each transition date — 01:30 exists on the
    // spring-forward day and 02:30 exists on the fall-back day. Only the
    // impossible and the doubled occurrence are absent, and neither was
    // quietly shifted to a neighbouring hour.
    assert.equal(rows.results.some(row => localDay(row.starts_at) === gapDate && localTime(row.starts_at) === '02:30'), false, 'the impossible 02:30 occurrence does not exist')
    assert.equal(rows.results.some(row => localDay(row.starts_at) === foldDate && localTime(row.starts_at) === '01:30'), false, 'the doubled 01:30 occurrence does not exist')
    assert.equal(rows.results.filter(row => localDay(row.starts_at) === gapDate).length, 1, 'the gap date keeps only its 01:30 session')
    assert.equal(rows.results.filter(row => localDay(row.starts_at) === foldDate).length, 1, 'the fold date keeps only its 02:30 session')

    // Local wall time is stable across the offset change: this is the whole
    // reason recurrence is stored as wall time plus a zone, not as an offset.
    const locals = new Set(rows.results.map(row => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.starts_at))))
    assert.deepEqual([...locals].sort(), ['01:30', '02:30'])
  } finally { await runtime.dispose() }
})

test('concurrent claims cannot exceed capacity, and variants share one pool', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, location_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-1', ?, ?, ?, 'Asia/Bangkok', '2099-01-05T07:00:00.000Z', '2099-01-05T09:00:00.000Z', 5, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, LOCATION, ACTOR, ACTOR).run()

    // Two ticket tiers, one seat pool: 3 adults + 2 children fills the class.
    await claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 3 })
    await claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-child', partySize: 2 })
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError,
      'a ticket tier does not get its own seat pool',
    )

    // Concurrency: eight parties of one race for three seats.
    await db.prepare("UPDATE product_sessions SET capacity = 8 WHERE id = 'sess-1'").run()
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () =>
      claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 1 })))
    const granted = outcomes.filter(outcome => outcome.status === 'fulfilled').length
    assert.equal(granted, 3, `exactly the three remaining seats were granted, got ${granted}`)
    const claimed = await db.prepare("SELECT SUM(party_size) n FROM bookings WHERE product_session_id = 'sess-1' AND status = 'confirmed'").first<number>('n')
    assert.equal(claimed, 8, 'claims never exceed capacity')

    // Cancelling releases exactly that booking's seats.
    const one = await db.prepare("SELECT id FROM bookings WHERE party_size = 3 LIMIT 1").first<string>('id')
    assert(one)
    await setBookingStatus(db, { organizationId: ORG, bookingId: one, status: 'cancelled', reason: 'guest cancelled' })
    const afterCancel = await db.prepare("SELECT SUM(party_size) n FROM bookings WHERE product_session_id = 'sess-1' AND status = 'confirmed'").first<number>('n')
    assert.equal(afterCancel, 5, 'cancellation released exactly three seats')
    const [session] = await listSessions(db, { organizationId: ORG, productId: PRODUCT, fromInstant: '2099-01-01T00:00:00.000Z', toInstant: '2099-02-01T00:00:00.000Z' })
    assert.equal(session?.remaining, 3)
    assert.equal(session?.is_full, false)
  } finally { await runtime.dispose() }
})

test('capacity cannot be reduced below seats already claimed, and a past session cannot be booked', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-cap', ?, ?, 'Asia/Bangkok', '2099-01-05T07:00:00.000Z', '2099-01-05T09:00:00.000Z', 10, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, ACTOR, ACTOR).run()
    await claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-cap', productVariantId: 'var-adult', partySize: 6 })
    await assert.rejects(
      updateSession(db, { organizationId: ORG, sessionId: 'sess-cap', actorId: ACTOR, capacity: 4 }),
      /already has 6 seats claimed/, 'reducing capacity below claimed seats is refused, not silently oversold')
    await updateSession(db, { organizationId: ORG, sessionId: 'sess-cap', actorId: ACTOR, capacity: 6 })

    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-past', ?, ?, 'Asia/Bangkok', '2020-01-05T07:00:00.000Z', '2020-01-05T09:00:00.000Z', 10, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, ACTOR, ACTOR).run()
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-past', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError, 'a session in the past takes no bookings')

    await db.prepare("UPDATE product_sessions SET status = 'cancelled' WHERE id = 'sess-cap'").run()
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, productId: PRODUCT, sessionId: 'sess-cap', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError, 'a cancelled session takes no bookings')
  } finally { await runtime.dispose() }
})

test('the occurrence key is the intended local start, not the actual instant', () => {
  assert.equal(occurrenceKey('rule-1', '2026-10-04', '14:00'), 'rule-1:2026-10-04T14:00')
})


test('shared booking defaults retain omissions, zero and null; all history blocks removal', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  const scope = { organizationId: ORG, productId: PRODUCT, actorId: ACTOR }
  try {
    await setProductBookingConfig(db, { ...scope, patch: { default_capacity: 0 } })
    assert.deepEqual(await db.prepare('SELECT duration_minutes, default_capacity FROM product_booking_configs WHERE product_id = ?').bind(PRODUCT).first(), { duration_minutes: 120, default_capacity: 0 })
    await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: null } })
    assert.deepEqual(await db.prepare('SELECT duration_minutes, default_capacity FROM product_booking_configs WHERE product_id = ?').bind(PRODUCT).first(), { duration_minutes: null, default_capacity: 0 })
    await assert.rejects(setProductBookingConfig(db, { ...scope, patch: { duration_minutes: 0 } }), /duration_minutes/)
    await assert.rejects(setProductBookingConfig(db, { ...scope, organizationId: 'other-org', patch: { default_capacity: 99 } }), /not found/i)
    await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: 60, default_capacity: null } })
    const scheduled = await replaceWeeklySchedule(db, { ...scope, locationId: LOCATION, slots: [{ weekday: 1, start_time: '10:00' }] })
    assert(scheduled.sessions.created > 0)
    const session = await db.prepare("SELECT id FROM product_sessions WHERE starts_at > ? AND status = 'scheduled' ORDER BY starts_at LIMIT 1").bind(new Date().toISOString()).first<string>('id')
    assert(session)
    const booking = await claimSessionCapacity(db, { ...scope, sessionId: session, productVariantId: 'var-adult', partySize: 1 })
    await setBookingStatus(db, { organizationId: ORG, bookingId: booking.bookingId, status: 'cancelled' })
    await assert.rejects(deleteProductBookingConfig(db, scope), /has bookings/)
    assert.equal(await db.prepare('SELECT default_capacity FROM product_booking_configs WHERE product_id = ?').bind(PRODUCT).first('default_capacity'), null)
    assert.equal(await db.prepare('SELECT status FROM bookings WHERE id = ?').bind(booking.bookingId).first('status'), 'cancelled')
  } finally { await runtime.dispose() }
})

test('weekly replacement uses saved timezone, converges and preserves booked occurrences on clear', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  const scope = { organizationId: ORG, productId: PRODUCT, locationId: LOCATION, actorId: ACTOR }
  const slots = [{ weekday: 0, start_time: '14:00' }, { weekday: 1, start_time: '10:00' }]
  try {
    await assert.rejects(replaceWeeklySchedule(db, { ...scope, timezone: 'UTC', slots }), /timezone must match/)
    await assert.rejects(replaceWeeklySchedule(db, { ...scope, slots: [{ weekday: 0, start_time: '14:00', capacity: null }] }), /only weekday and start_time/)
    await assert.rejects(replaceWeeklySchedule(db, { ...scope, locationId: 'foreign-location', slots }), /Location not found/)
    await db.prepare(`INSERT INTO business_locations (id, organization_id, slug, title, status, timezone, created_at, updated_at)
      VALUES ('other-studio', ?, 'other-studio', 'Other studio', 'active', 'Asia/Bangkok', ?, ?)`).bind(ORG, NOW, NOW).run()
    await addRule(db, 'other-location-rule', { location_id: 'other-studio', weekday: 3, start_time: '12:00' })
    await materializeSessions(db, { organizationId: ORG, productId: PRODUCT, throughDate: addLocalDays(localNow('Asia/Bangkok').date, 31), actorId: ACTOR })
    const first = await replaceWeeklySchedule(db, { ...scope, slots })
    assert(first.sessions.created > 0)
    assert(first.rules.every(rule => rule.timezone === 'Asia/Bangkok'))
    const before = (await db.prepare('SELECT id, starts_at, ends_at, capacity FROM product_sessions ORDER BY id').all()).results
    const monday = await db.prepare('SELECT id FROM product_sessions WHERE capacity = 10 AND location_id = ? AND starts_at > ? ORDER BY starts_at LIMIT 1').bind(LOCATION, new Date().toISOString()).first<string>('id')
    assert(monday)
    const booked = await claimSessionCapacity(db, { ...scope, sessionId: monday, productVariantId: 'var-adult', partySize: 1 })
    const repeated = await replaceWeeklySchedule(db, { ...scope, slots })
    assert.equal(repeated.sessions.created, 0)
    assert.deepEqual(repeated.rules.map(rule => rule.id).sort(), first.rules.map(rule => rule.id).sort())
    assert.deepEqual((await db.prepare('SELECT id, starts_at, ends_at, capacity FROM product_sessions ORDER BY id').all()).results, before)
    const otherSessions = (await db.prepare("SELECT id, status FROM product_sessions WHERE location_id = 'other-studio' ORDER BY id").all()).results
    assert(otherSessions.length > 0)
    const cleared = await replaceWeeklySchedule(db, { ...scope, slots: [] })
    assert.deepEqual(cleared.rules, [])
    assert.equal(await db.prepare("SELECT id FROM product_availability_rules WHERE location_id = 'other-studio'").first('id'), 'other-location-rule')
    assert.deepEqual((await db.prepare("SELECT id, status FROM product_sessions WHERE location_id = 'other-studio' ORDER BY id").all()).results, otherSessions)
    assert(cleared.cancelled > 0)
    assert.deepEqual(await db.prepare('SELECT status, availability_rule_id FROM product_sessions WHERE id = ?').bind(monday).first(), { status: 'scheduled', availability_rule_id: null })
    assert.deepEqual(await db.prepare('SELECT status, product_session_id FROM bookings WHERE id = ?').bind(booked.bookingId).first(), { status: 'confirmed', product_session_id: monday })
    // Clearing remains valid after the duration default has been cleared.
    await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: null } })
    assert.deepEqual((await replaceWeeklySchedule(db, { ...scope, slots: [] })).rules, [])
  } finally { await runtime.dispose() }
})

test('readding a weekly slot preserves every fact of sessions with booking history', { timeout: 120_000 }, async () => {
  for (const scenario of ['active', 'cancelled-booking', 'cancelled-session', 'edited', 'moved'] as const) {
    const { runtime, db } = await boot()
    const scope = { organizationId: ORG, productId: PRODUCT, locationId: LOCATION, actorId: ACTOR }
    const slots = [{ weekday: 0, start_time: '14:00' }]
    try {
      await replaceWeeklySchedule(db, { ...scope, slots })
      const sessionId = await db.prepare('SELECT id FROM product_sessions WHERE starts_at > ? ORDER BY starts_at LIMIT 1').bind(new Date().toISOString()).first<string>('id')
      assert(sessionId)
      const booking = await claimSessionCapacity(db, { ...scope, sessionId, productVariantId: 'var-adult', partySize: 6 })
      if (scenario === 'cancelled-booking') await setBookingStatus(db, { organizationId: ORG, bookingId: booking.bookingId, status: 'cancelled' })
      if (scenario === 'cancelled-session') await updateSession(db, { ...scope, sessionId, status: 'cancelled' })
      if (scenario === 'edited') await updateSession(db, { ...scope, sessionId, capacity: 8 })
      if (scenario === 'moved') {
        const row = await db.prepare('SELECT starts_at, ends_at FROM product_sessions WHERE id = ?').bind(sessionId).first<{ starts_at: string; ends_at: string }>()
        assert(row)
        await updateSession(db, { ...scope, sessionId, startsAt: new Date(Date.parse(row.starts_at) + 3_600_000).toISOString(), endsAt: new Date(Date.parse(row.ends_at) + 3_600_000).toISOString() })
      }
      const read = () => db.prepare('SELECT id, source_occurrence_key, timezone, starts_at, ends_at, capacity, status FROM product_sessions WHERE id = ?').bind(sessionId).first()
      const before = await read()
      const bookingBefore = await db.prepare('SELECT id, product_session_id, status, party_size FROM bookings WHERE id = ?').bind(booking.bookingId).first()
      await replaceWeeklySchedule(db, { ...scope, slots: [] })
      await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: 30, default_capacity: 2 } })
      await replaceWeeklySchedule(db, { ...scope, slots })
      assert.deepEqual(await read(), before, `${scenario}: adoption must preserve booked actual facts and generation identity`)
      assert.deepEqual(await db.prepare('SELECT id, product_session_id, status, party_size FROM bookings WHERE id = ?').bind(booking.bookingId).first(), bookingBefore)
      await replaceWeeklySchedule(db, { ...scope, slots })
      assert.deepEqual(await read(), before, `${scenario}: normal replay also preserves history`)
    } finally { await runtime.dispose() }
  }
})


test('unbooked re-add retains the existing cancellation and default-refresh behavior', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  const scope = { organizationId: ORG, productId: PRODUCT, locationId: LOCATION, actorId: ACTOR }
  const slots = [{ weekday: 0, start_time: '14:00' }]
  try {
    await replaceWeeklySchedule(db, { ...scope, slots })
    const first = await db.prepare('SELECT id, starts_at FROM product_sessions WHERE starts_at > ? ORDER BY starts_at LIMIT 1').bind(new Date().toISOString()).first<{ id: string; starts_at: string }>()
    assert(first)
    await replaceWeeklySchedule(db, { ...scope, slots: [] })
    assert.equal(await db.prepare('SELECT status FROM product_sessions WHERE id = ?').bind(first.id).first('status'), 'cancelled')
    await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: 30, default_capacity: 2 } })
    await replaceWeeklySchedule(db, { ...scope, slots })
    assert.deepEqual(await db.prepare('SELECT id, starts_at, ends_at, capacity, status FROM product_sessions WHERE id = ?').bind(first.id).first(), {
      id: first.id, starts_at: first.starts_at, ends_at: new Date(Date.parse(first.starts_at) + 30 * 60_000).toISOString(), capacity: 2, status: 'scheduled',
    })
  } finally { await runtime.dispose() }
})

test('neutral adoption protects cancelled history and a claim racing its atomic write', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  const scope = { organizationId: ORG, productId: PRODUCT, actorId: ACTOR }
  try {
    await addRule(db, 'neutral-old', { location_id: null })
    const throughDate = addLocalDays(localNow('Asia/Bangkok').date, 31)
    await materializeSessions(db, { ...scope, throughDate })
    const rows = (await db.prepare('SELECT id FROM product_sessions WHERE location_id IS NULL AND starts_at > ? ORDER BY starts_at').bind(new Date().toISOString()).all<{ id: string }>()).results
    assert(rows.length >= 2)
    const protectedId = rows[0]!.id
    const racingId = rows[1]!.id
    const booking = await claimSessionCapacity(db, { ...scope, sessionId: protectedId, productVariantId: 'var-adult', partySize: 6 })
    await setBookingStatus(db, { organizationId: ORG, bookingId: booking.bookingId, status: 'cancelled' })
    await updateSession(db, { ...scope, sessionId: protectedId, status: 'cancelled' })
    const read = (id: string) => db.prepare('SELECT id, source_occurrence_key, starts_at, ends_at, timezone, capacity, status FROM product_sessions WHERE id = ?').bind(id).first()
    const protectedBefore = await read(protectedId)
    const raceBefore = await read(racingId)
    await db.batch([
      db.prepare("UPDATE product_sessions SET availability_rule_id = NULL WHERE availability_rule_id = 'neutral-old'"),
      db.prepare("DELETE FROM product_availability_rules WHERE id = 'neutral-old'"),
    ])
    await setProductBookingConfig(db, { ...scope, patch: { duration_minutes: 30, default_capacity: 2 } })
    await addRule(db, 'neutral-new', { location_id: null })
    const [claim, generation] = await Promise.allSettled([
      claimSessionCapacity(db, { ...scope, sessionId: racingId, productVariantId: 'var-adult', partySize: 6 }),
      materializeSessions(db, { ...scope, throughDate }),
    ])
    assert.equal(generation.status, 'fulfilled')
    assert.deepEqual(await read(protectedId), protectedBefore)
    if (claim.status === 'fulfilled') assert.deepEqual(await read(racingId), raceBefore, 'the committed claim protects all session facts')
    else {
      assert(claim.reason instanceof CapacityUnavailableError)
      assert.equal((await read(racingId))?.capacity, 2, 'adoption won and the larger claim was refused')
    }
    const invalid = await db.prepare("SELECT count(*) n FROM product_sessions s WHERE s.capacity IS NOT NULL AND s.capacity < (SELECT COALESCE(SUM(b.party_size),0) FROM bookings b WHERE b.product_session_id=s.id AND b.status='confirmed')").first('n')
    assert.equal(invalid, 0)
    assert.equal(await db.prepare('SELECT product_session_id FROM bookings WHERE id = ?').bind(booking.bookingId).first('product_session_id'), protectedId)
  } finally { await runtime.dispose() }
})


test('provider additive migration keeps the separately held weekly columns and their populated values', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot(true)
  try {
    await addRule(db, 'held-rule')
    await db.prepare("UPDATE product_availability_rules SET end_time='16:00',interval_minutes=30,interval_weeks=2,effective_from_date='2026-01-01',effective_until_date='2030-01-01',duration_minutes=30,capacity=0 WHERE id='held-rule'").run()
    const row = await db.prepare("SELECT end_time,interval_minutes,interval_weeks,effective_from_date,effective_until_date,duration_minutes,capacity FROM product_availability_rules WHERE id='held-rule'").first()
    assert.deepEqual(row, { end_time: '16:00', interval_minutes: 30, interval_weeks: 2, effective_from_date: '2026-01-01', effective_until_date: '2030-01-01', duration_minutes: 30, capacity: 0 })
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally { await runtime.dispose() }
})

// Named invariants: review allocations exclude concurrent overlaps across explicitly
// enrolled Products; confirmation/rejection and replay never allocate a second seat.
test('one configured online calendar excludes overlapping pending requests and review retries release once', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare("INSERT INTO user (id, name, email) VALUES (?, 'Operator', 'operator@example.com')").bind(ACTOR).run()
    await db.prepare("UPDATE product_booking_configs SET confirmation_mode = 'review', online_timezone = 'America/New_York', calendar_group = 'online' WHERE product_id = ?").bind(PRODUCT).run()
    for (const [productId, variantId, group] of [['prod-consult', 'var-consult', 'online'], ['prod-independent', 'var-independent', null]]) {
      await db.prepare('INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)').bind(productId, ORG, productId, productId, ACTOR, ACTOR).run()
      await db.prepare('INSERT INTO product_variants (id, organization_id, product_id, name, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)').bind(variantId, ORG, productId, variantId, ACTOR, ACTOR).run()
      await db.prepare("INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, confirmation_mode, online_timezone, calendar_group, created_by, updated_by) VALUES (?, ?, 45, 1, 'review', 'America/New_York', ?, ?, ?)").bind(productId, ORG, group, ACTOR, ACTOR).run()
    }
    for (const [id, productId, start, end] of [
      ['session-one', PRODUCT, '2098-11-02T15:00:00.000Z', '2098-11-02T16:15:00.000Z'],
      ['session-two', 'prod-consult', '2098-11-02T15:30:00.000Z', '2098-11-02T16:15:00.000Z'],
      ['session-adjacent', 'prod-consult', '2098-11-02T16:15:00.000Z', '2098-11-02T17:00:00.000Z'],
      ['session-independent', 'prod-independent', '2098-11-02T15:30:00.000Z', '2098-11-02T16:15:00.000Z'],
    ]) await db.prepare("INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by) VALUES (?, ?, ?, 'America/New_York', ?, ?, 1, 'scheduled', ?, ?)").bind(id, ORG, productId, start, end, ACTOR, ACTOR).run()
    for (const id of ['thread-one', 'thread-two']) {
      const queries = requestInsertQueries({ id, kind: 'booking', organization_id: ORG, location_id: null, user_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null, payload: threadPayloadForGuest({ name: 'Guest', email: 'guest@example.com' }), created_at: NOW, updated_at: NOW })
      await db.batch(queries.map(query => db.prepare(query.query).bind(...query.params!)))
    }
    const inputs = [
      { organizationId: ORG, productId: PRODUCT, sessionId: 'session-one', productVariantId: 'var-adult', partySize: 1, requestId: 'thread-one' },
      { organizationId: ORG, productId: 'prod-consult', sessionId: 'session-two', productVariantId: 'var-consult', partySize: 1, requestId: 'thread-two' },
    ]
    const raced = await Promise.allSettled(inputs.map(input => claimSessionCapacity(db, input)))
    assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1)
    const index = raced.findIndex(result => result.status === 'fulfilled')
    const winner = inputs[index]!
    const record = await getThreadOperationalRecord(db, winner.requestId)
    assert.equal(record?.status, 'pending')
    assert.equal((await claimSessionCapacity(db, winner)).bookingId, record!.id)
    assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'), 1)
    const listed = await listSessions(db, { organizationId: ORG, fromInstant: '2098-11-02T00:00:00.000Z', toInstant: '2098-11-03T00:00:00.000Z' })
    assert.equal(listed.find(session => session.id === inputs[1 - index]!.sessionId)?.is_full, true)
    assert.equal(listed.find(session => session.id === 'session-adjacent')?.remaining, 1)
    assert.equal(listed.find(session => session.id === 'session-independent')?.remaining, 1)
    const env = { NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://proof.example', EMAIL_REPLY_SECRET: 'local-reply-proof', EMAIL_DELIVERY_MODE: 'log_only' }
    const confirm = { threadId: winner.requestId, organizationId: ORG, action: 'confirm', actorUserId: ACTOR, idempotencyKey: 'confirm-once', env }
    assert.equal((await executeGuestThreadOperation(db, confirm)).ok, true)
    assert.equal((await executeGuestThreadOperation(db, confirm)).ok, true)
    assert.equal((await getThreadOperationalRecord(db, winner.requestId))?.status, 'confirmed')
    assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'), 1)
    const moved = sessionMoveQuery({ bookingId: record!.id, organizationId: ORG, productId: winner.productId, sessionId: winner.sessionId, partySize: 1, now: new Date().toISOString() })
    assert.equal((await db.prepare(moved.query).bind(...moved.params!).run()).meta.changes, 1, 'same-session changes exclude the allocation being moved')
    assert.equal((await getThreadOperationalRecord(db, winner.requestId))?.id, record!.id)
    assert.equal((await getThreadOperationalRecord(db, winner.requestId))?.status, 'confirmed')
    await assert.rejects(() => claimSessionCapacity(db, { ...winner, partySize: 2 }), /different booking/)
    const cancel = { ...confirm, action: 'cancel', idempotencyKey: 'cancel-once' }
    assert.equal((await executeGuestThreadOperation(db, cancel)).ok, true)
    assert.equal((await executeGuestThreadOperation(db, cancel)).ok, true)
    assert.equal(await db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE event_name = 'booking.cancel'").first('n'), 1)
    const loser = inputs[1 - index]!
    await claimSessionCapacity(db, loser)
    const reject = { ...confirm, threadId: loser.requestId, action: 'reject', idempotencyKey: 'reject-once' }
    assert.equal((await executeGuestThreadOperation(db, reject)).ok, true)
    assert.equal((await executeGuestThreadOperation(db, reject)).ok, true)
    assert.equal((await getThreadOperationalRecord(db, loser.requestId))?.status, 'cancelled')
    const after = await listSessions(db, { organizationId: ORG, fromInstant: '2098-11-02T00:00:00.000Z', toInstant: '2098-11-03T00:00:00.000Z' })
    assert.equal(after.find(session => session.id === 'session-one')?.remaining, 1)
    assert.equal(after.find(session => session.id === 'session-two')?.remaining, 1)
    assert.equal(await db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE event_name = 'booking.confirm'").first('n'), 1)
    assert.equal(await db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE event_name = 'booking.reject'").first('n'), 1)
  } finally { await runtime.dispose() }
})

test('provider allocation shares a class Session, excludes distinct overlapping services, and preserves assigned identities after hours/config edits', {timeout:120_000}, async()=>{
 const {runtime,db}=await boot()
 try {
  const {workingWindows}=await import('../../server/domain/member-scheduling.ts')
  const {publicProductProvider}=await import('../../server/utils/public-provider.ts')
  const day=addLocalDays(localNow('UTC').date,3), start=`${day}T09:00:00.000Z`, end=`${day}T10:00:00.000Z`
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('provider-user','Private account name','private-provider@example.com',1,1,1)`).run()
  await db.prepare(`INSERT INTO member(id,organizationId,userId,role) VALUES ('provider-one',?,'provider-user','member')`).bind(ORG).run()
  const windows=workingWindows('UTC',Array.from({length:7},(_,weekday)=>({weekday,start:'08:00',end:'18:00'})))
  await db.prepare(`INSERT INTO member_scheduling(member_id,organization_id,timezone,weekly_json,time_off_json,windows_json,windows_until,public_name,public_bio,public_approved,calendar_revision,updated_at,updated_by) VALUES ('provider-one',?,'UTC','[]','[]',?,?, 'Approved public name','Approved public bio',1,'revision',?,?)`).bind(ORG,JSON.stringify(windows.intervals),windows.until,NOW,ACTOR).run()
  await db.prepare("UPDATE product_booking_configs SET scheduling_mode='provider',assigned_member_id='provider-one',calendar_group='legacy-output',online_timezone='UTC' WHERE product_id=?").bind(PRODUCT).run()
  const second='second-service'
  await db.prepare("INSERT INTO products(id,organization_id,name,slug,created_by,updated_by)VALUES(?,?,'Other service','other-service',?,?)").bind(second,ORG,ACTOR,ACTOR).run()
  await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,scheduling_mode,assigned_member_id,duration_minutes,default_capacity,online_timezone,calendar_group,created_by,updated_by)VALUES(?,?,'provider','provider-one',60,3,'UTC','legacy-output',?,?)").bind(second,ORG,ACTOR,ACTOR).run()
  await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by)VALUES('second-variant',?,?,'Standard',?,?)").bind(ORG,second,ACTOR,ACTOR).run()
  for(const [id,product]of [['group-session',PRODUCT],['other-session',second]])await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,created_by,updated_by)VALUES(?,?,?,'UTC',?,?,3,?,?)").bind(id,ORG,product,start,end,ACTOR,ACTOR).run()
  const claims=await Promise.allSettled([
   claimSessionCapacity(db,{organizationId:ORG,productId:PRODUCT,sessionId:'group-session',productVariantId:'var-adult',partySize:1}),
   claimSessionCapacity(db,{organizationId:ORG,productId:second,sessionId:'other-session',productVariantId:'second-variant',partySize:1})
  ])
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1,'only one distinct overlapping Session acquires provider occupancy')
  const winner=await db.prepare("SELECT id,product_id,product_session_id,assigned_member_id FROM bookings WHERE status='confirmed'").first<{id:string;product_id:string;product_session_id:string;assigned_member_id:string}>()
  assert.equal(winner?.assigned_member_id,'provider-one')
  const variant=winner!.product_id===PRODUCT?'var-child':'second-variant'
  const attendee=await claimSessionCapacity(db,{organizationId:ORG,productId:winner!.product_id,sessionId:winner!.product_session_id,productVariantId:variant,partySize:1})
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(attendee.bookingId).first('assigned_member_id'),'provider-one','a second attendee shares the committed provider')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),2)
  assert.equal((await listSessions(db,{organizationId:ORG,fromInstant:`${day}T00:00:00.000Z`,toInstant:`${day}T23:59:59.999Z`})).find(s=>s.id===winner!.product_session_id)?.remaining,1,'remaining capacity is attendee based')
  await db.prepare("UPDATE product_booking_configs SET assigned_member_id=NULL WHERE product_id=?").bind(winner!.product_id).run()
  await db.prepare("UPDATE member_scheduling SET time_off_json=? WHERE member_id='provider-one'").bind(JSON.stringify([{start,end}])).run()
  await assert.rejects(()=>claimSessionCapacity(db,{organizationId:ORG,productId:winner!.product_id,sessionId:winner!.product_session_id,productVariantId:variant,partySize:1}),CapacityUnavailableError)
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(winner!.id).first('assigned_member_id'),'provider-one','hours/assignment edits never rewrite a booked commitment')
  assert.deepEqual(await publicProductProvider(db,ORG,winner!.product_id,winner!.product_session_id),{name:'Approved public name',photo_url:null,bio:'Approved public bio'})
  await db.prepare("UPDATE member_scheduling SET public_approved=0 WHERE member_id='provider-one'").run()
  assert.equal(await publicProductProvider(db,ORG,winner!.product_id,winner!.product_session_id),null,'unapproved/private identity is not public content')
 }finally{await runtime.dispose()}
})
