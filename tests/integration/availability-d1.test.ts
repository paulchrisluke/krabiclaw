import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import {
  CapacityUnavailableError,
  claimSessionCapacity,
  expireBookingHolds,
  listSessions,
  materializeSessions,
  setBookingStatus,
  updateSession,
} from '../../server/utils/availability.ts'
import { occurrenceKey } from '../../shared/bookings.ts'
import { addLocalDays, localDateTimeToInstant, localNow } from '../../utils/timezone.ts'

const ORG = 'org-sessions'
const SITE = 'site-sessions'
const LOCATION = 'loc-sessions'
const PRODUCT = 'prod-class'
const ACTOR = 'user-actor'
const NOW = '2026-09-11T00:00:00.000Z'

async function boot() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'availability-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  await db.prepare("INSERT INTO organization (id, name, slug) VALUES (?, 'Sessions', 'sessions')").bind(ORG).run()
  await db.prepare(`INSERT INTO sites (id, organization_id, slug, settings_json, integrations_json, theme_id, default_currency, status, onboarding_status, url_structure, vertical, created_at, updated_at)
    VALUES (?, ?, 'sessions', '{"config":{"default_timezone":"Asia/Bangkok"}}', '{}', 'theme', 'THB', 'active', 'complete', 'flat', 'experience', ?, ?)`)
    .bind(SITE, ORG, NOW, NOW).run()
  await db.prepare(`INSERT INTO business_locations (id, organization_id, site_id, slug, title, status, timezone, created_at, updated_at)
    VALUES (?, ?, ?, 'studio', 'Studio', 'active', 'Asia/Bangkok', ?, ?)`).bind(LOCATION, ORG, SITE, NOW, NOW).run()
  await db.prepare(`INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES (?, ?, 'Pottery Class', 'pottery-class', ?, ?)`)
    .bind(PRODUCT, ORG, ACTOR, ACTOR).run()
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

function addRule(db: D1Database, id: string, over: Partial<{ weekday: number; start_time: string; interval_weeks: number; timezone: string; effective_from_date: string | null; capacity: number | null; location_id: string | null }> = {}) {
  return db.prepare(`INSERT INTO product_availability_rules
    (id, organization_id, product_id, location_id, timezone, weekday, start_time, interval_weeks, effective_from_date, capacity, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, ORG, PRODUCT, over.location_id ?? LOCATION, over.timezone ?? 'Asia/Bangkok', over.weekday ?? 0,
      over.start_time ?? '14:00', over.interval_weeks ?? 1, over.effective_from_date ?? null, over.capacity ?? null, ACTOR, ACTOR).run()
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
    const findSunday = (time: string): string | null => {
      const today = localNow(zone).date
      for (let offset = 1; offset <= 360; offset += 1) {
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
      organizationId: ORG, productId: PRODUCT, throughDate: addLocalDays(localNow(zone).date, 359), actorId: ACTOR,
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
    await claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 3 })
    await claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-child', partySize: 2 })
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError,
      'a ticket tier does not get its own seat pool',
    )

    // Concurrency: eight parties of one race for three seats.
    await db.prepare("UPDATE product_sessions SET capacity = 8 WHERE id = 'sess-1'").run()
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () =>
      claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-1', productVariantId: 'var-adult', partySize: 1 })))
    const granted = outcomes.filter(outcome => outcome.status === 'fulfilled').length
    assert.equal(granted, 3, `exactly the three remaining seats were granted, got ${granted}`)
    const claimed = await db.prepare("SELECT SUM(party_size) n FROM bookings WHERE product_session_id = 'sess-1' AND status IN ('pending','confirmed','completed')").first<number>('n')
    assert.equal(claimed, 8, 'claims never exceed capacity')

    // Cancelling releases exactly that booking's seats.
    const one = await db.prepare("SELECT id FROM bookings WHERE party_size = 3 LIMIT 1").first<string>('id')
    assert(one)
    await setBookingStatus(db, { organizationId: ORG, bookingId: one, status: 'cancelled', reason: 'guest cancelled' })
    const afterCancel = await db.prepare("SELECT SUM(party_size) n FROM bookings WHERE product_session_id = 'sess-1' AND status IN ('pending','confirmed','completed')").first<number>('n')
    assert.equal(afterCancel, 5, 'cancellation released exactly three seats')
    const [session] = await listSessions(db, { organizationId: ORG, productId: PRODUCT, fromInstant: '2099-01-01T00:00:00.000Z', toInstant: '2099-02-01T00:00:00.000Z' })
    assert.equal(session?.remaining, 3)
    assert.equal(session?.is_full, false)
  } finally { await runtime.dispose() }
})

test('an expired hold releases its seats; an unexpired one does not', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-hold', ?, ?, 'Asia/Bangkok', '2099-01-05T07:00:00.000Z', '2099-01-05T09:00:00.000Z', 2, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, ACTOR, ACTOR).run()
    const future = new Date(Date.now() + 600_000).toISOString()
    await claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-hold', productVariantId: 'var-adult', partySize: 2, holdExpiresAt: future })
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-hold', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError, 'an unexpired hold keeps its seats')

    await db.prepare("UPDATE bookings SET hold_expires_at = '2020-01-01T00:00:00.000Z' WHERE product_session_id = 'sess-hold'").run()
    const claim = await claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-hold', productVariantId: 'var-adult', partySize: 2 })
    assert(claim.bookingId, 'an expired hold releases its seats')
    assert.equal(await expireBookingHolds(db, ORG), 1, 'the sweep marks the abandoned claim cancelled')
  } finally { await runtime.dispose() }
})

test('capacity cannot be reduced below seats already claimed, and a past session cannot be booked', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-cap', ?, ?, 'Asia/Bangkok', '2099-01-05T07:00:00.000Z', '2099-01-05T09:00:00.000Z', 10, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, ACTOR, ACTOR).run()
    await claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-cap', productVariantId: 'var-adult', partySize: 6 })
    await assert.rejects(
      updateSession(db, { organizationId: ORG, sessionId: 'sess-cap', actorId: ACTOR, capacity: 4 }),
      /already has 6 seats claimed/, 'reducing capacity below claimed seats is refused, not silently oversold')
    await updateSession(db, { organizationId: ORG, sessionId: 'sess-cap', actorId: ACTOR, capacity: 6 })

    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('sess-past', ?, ?, 'Asia/Bangkok', '2020-01-05T07:00:00.000Z', '2020-01-05T09:00:00.000Z', 10, 'scheduled', ?, ?)`)
      .bind(ORG, PRODUCT, ACTOR, ACTOR).run()
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-past', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError, 'a session in the past takes no bookings')

    await db.prepare("UPDATE product_sessions SET status = 'cancelled' WHERE id = 'sess-cap'").run()
    await assert.rejects(
      claimSessionCapacity(db, { organizationId: ORG, siteId: SITE, productId: PRODUCT, sessionId: 'sess-cap', productVariantId: 'var-adult', partySize: 1 }),
      CapacityUnavailableError, 'a cancelled session takes no bookings')
  } finally { await runtime.dispose() }
})

test('the occurrence key is the intended local start, not the actual instant', () => {
  assert.equal(occurrenceKey('rule-1', '2026-10-04', '14:00'), 'rule-1:2026-10-04T14:00')
})
