import { PUBLIC_BOOKING_WINDOW_DAYS } from '~/shared/bookings'
import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  CAPACITY_CONSUMING_SQL,
  occurrenceKey,
  type BookingStatus,
  type ProductSessionStatus,
} from '~/shared/bookings'
import {
  addLocalDays,
  assertCalendarDate,
  isValidTimezone,
  localDateAt,
  localDateTimeToInstant,
  localNow,
  MINUTE_TIME_PATTERN,
} from '~/utils/timezone'

/**
 * The booking capability.
 *
 * A Product is bookable because it has a `product_booking_configs` row, not
 * because it has a duration or a vertical name. Rules describe when sessions
 * ought to exist; sessions ARE the occurrences and own their time, capacity
 * and state; a booking claims seats on one session. No step is inferred from
 * the absence of another.
 *
 * Location table reservations are a different capability and live in
 * `reservations.ts`. They are not this code under another name: a
 * reservation has no materialized occurrence, because a restaurant does not
 * schedule a dinner the way a studio schedules a class.
 */

const MAX_GENERATION_DAYS = 365
const MAX_CALENDAR_DAYS = 42

function badRequest(message: string): never {
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

export function assertAvailabilityDate(value: string, field = 'date'): void {
  try { assertCalendarDate(value) }
  catch { badRequest(`${field} must be a valid YYYY-MM-DD date`) }
}

export interface ProductBookingConfig {
  product_id: string
  organization_id: string
  duration_minutes: number | null
  default_capacity: number | null
}

export interface ProductAvailabilityRule {
  id: string
  organization_id: string
  product_id: string
  location_id: string | null
  timezone: string
  weekday: number
  start_time: string
  interval_weeks: number
  effective_from_date: string | null
  effective_until_date: string | null
  duration_minutes: number | null
  capacity: number | null
}

export interface ProductSession {
  id: string
  organization_id: string
  product_id: string
  location_id: string | null
  availability_rule_id: string | null
  source_occurrence_key: string | null
  timezone: string
  starts_at: string
  ends_at: string
  capacity: number | null
  status: ProductSessionStatus
}

/** A session with its claimed seats resolved. `remaining` is null when uncapped. */
export interface SessionAvailability extends ProductSession {
  claimed: number
  remaining: number | null
  is_full: boolean
}

export async function requireBookingConfig(
  db: DbClient,
  organizationId: string,
  productId: string,
): Promise<ProductBookingConfig> {
  const row = await queryFirst<ProductBookingConfig>(db, `
    SELECT product_id, organization_id, duration_minutes, default_capacity
    FROM product_booking_configs WHERE organization_id = ? AND product_id = ?
  `, [organizationId, productId])
  // The absence of a config row means the product does not take bookings. It
  // is not a product with unknown booking settings.
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'This product does not take bookings' })
  return row
}

export async function listAvailabilityRules(
  db: DbClient,
  organizationId: string,
  productId: string,
): Promise<ProductAvailabilityRule[]> {
  return queryAll<ProductAvailabilityRule>(db, `
    SELECT id, organization_id, product_id, location_id, timezone, weekday, start_time,
           interval_weeks, effective_from_date, effective_until_date, duration_minutes, capacity
    FROM product_availability_rules
    WHERE organization_id = ? AND product_id = ?
    ORDER BY weekday, start_time, id
  `, [organizationId, productId])
}

function resolvedDuration(rule: ProductAvailabilityRule, config: ProductBookingConfig): number {
  const minutes = rule.duration_minutes ?? config.duration_minutes
  if (minutes === null) {
    throw new HTTPError({
      statusCode: 409,
      statusMessage: 'Set a session length on the product or the rule before generating sessions',
    })
  }
  return minutes
}

/** How a local wall time that does not exist, or exists twice, is handled. */
export interface OccurrenceSkip {
  rule_id: string
  local_date: string
  local_start_time: string
  reason: 'nonexistent_local_time' | 'ambiguous_local_time'
}

function instantsFor(
  rule: ProductAvailabilityRule,
  localDate: string,
  durationMinutes: number,
): { starts_at: string; ends_at: string } | OccurrenceSkip {
  let start: Date
  try {
    // 'reject' refuses both a gap (the wall time never happens) and a fold
    // (it happens twice). Silently picking one of the two instants would book
    // guests into an hour the merchant did not choose.
    start = localDateTimeToInstant(localDate, rule.start_time, rule.timezone, 'reject')
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    // '@internationalized/date' says "No such absolute time found" for a gap
    // and "Multiple possible absolute times found" for a fold.
    const reason = /multiple|ambiguous/i.test(error.message) ? 'ambiguous_local_time' : 'nonexistent_local_time'
    return { rule_id: rule.id, local_date: localDate, local_start_time: rule.start_time, reason }
  }
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
  }
}

export interface MaterializeSessionsResult {
  created: number
  /** Occurrences already represented by a session — edited, cancelled or rescheduled. */
  existing: number
  skipped: OccurrenceSkip[]
}

/**
 * Generate sessions for every rule of a product, up to `throughDate`.
 *
 * Idempotent by construction. Each occurrence carries the stable
 * `source_occurrence_key` from `shared/bookings`, and insertion relies on the
 * partial unique index over (product_id, source_occurrence_key). Re-running
 * therefore cannot:
 *   - duplicate a session,
 *   - restore one the merchant cancelled (the row still exists),
 *   - overwrite one whose time or capacity was edited (insert does nothing),
 *   - recreate a rescheduled one at its original start (the key is the
 *     intended occurrence, not the actual instant).
 *
 * Bounded: at most MAX_GENERATION_DAYS ahead, so a rule cannot fill the table.
 */
export async function materializeSessions(db: DbClient, input: {
  organizationId: string
  productId: string
  fromDate?: string
  throughDate: string
  actorId: string
}): Promise<MaterializeSessionsResult> {
  const config = await requireBookingConfig(db, input.organizationId, input.productId)
  const rules = await listAvailabilityRules(db, input.organizationId, input.productId)
  if (rules.length === 0) return { created: 0, existing: 0, skipped: [] }

  assertAvailabilityDate(input.throughDate, 'through')
  if (input.fromDate) assertAvailabilityDate(input.fromDate, 'from')

  const now = new Date().toISOString()
  const skipped: OccurrenceSkip[] = []
  const writes: BatchQuery[] = []
  let planned = 0

  for (const rule of rules) {
    if (!isValidTimezone(rule.timezone)) {
      throw new HTTPError({ statusCode: 409, statusMessage: `Rule ${rule.id} has an invalid timezone` })
    }
    const duration = resolvedDuration(rule, config)
    const capacity = rule.capacity ?? config.default_capacity

    // The window is expressed in the rule's own local calendar: a weekly slot
    // is a wall-clock fact, so walking UTC days would drift across DST.
    const today = localNow(rule.timezone).date
    const from = [input.fromDate ?? today, rule.effective_from_date ?? '0000-01-01', today]
      .reduce((latest, value) => (value > latest ? value : latest))
    const through = [input.throughDate, rule.effective_until_date ?? '9999-12-31', addLocalDays(today, MAX_GENERATION_DAYS)]
      .reduce((earliest, value) => (value < earliest ? value : earliest))
    if (from > through) continue

    // A cadence longer than a week counts from the rule's own effective start,
    // which the schema requires it to have. Counting from the generation
    // window instead would move every other Saturday to the other Saturday
    // whenever generation ran on a different day.
    for (let date = from; date <= through; date = addLocalDays(date, 1)) {
      if (new Date(`${date}T00:00:00Z`).getUTCDay() !== rule.weekday) continue
      if (rule.interval_weeks > 1) {
        if (!rule.effective_from_date) throw new HTTPError({ statusCode: 500, statusMessage: `Rule ${rule.id} repeats every ${rule.interval_weeks} weeks with no effective start` })
        const weeksSinceAnchor = Math.floor(
          (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${rule.effective_from_date}T00:00:00Z`)) / (7 * 86_400_000),
        )
        if (weeksSinceAnchor % rule.interval_weeks !== 0) continue
      }
      const resolved = instantsFor(rule, date, duration)
      if ('reason' in resolved) { skipped.push(resolved); continue }
      planned += 1
      writes.push({
        query: `
          INSERT INTO product_sessions (
            id, organization_id, product_id, location_id, availability_rule_id, source_occurrence_key,
            timezone, starts_at, ends_at, capacity, status, created_at, updated_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
          ON CONFLICT (product_id, source_occurrence_key) WHERE source_occurrence_key IS NOT NULL DO NOTHING
        `,
        params: [
          crypto.randomUUID(), input.organizationId, input.productId, rule.location_id, rule.id,
          occurrenceKey(rule.id, date, rule.start_time), rule.timezone,
          resolved.starts_at, resolved.ends_at, capacity, now, now, input.actorId, input.actorId,
        ],
      })
    }
  }

  if (writes.length === 0) return { created: 0, existing: 0, skipped }
  const results = await executeBatch(db, writes, { operation: 'Materialize product sessions' })
  const created = results.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0)
  return { created, existing: planned - created, skipped }
}

export interface WeeklySlotInput {
  weekday: number
  start_time: string
  capacity: number | null
}

/**
 * Replace a product's weekly schedule at one location.
 *
 * The schedule is the set of (weekday, time) slots the merchant runs, each
 * with its own places or the product's default. A slot that stays keeps its
 * rule — and with it every session and booking already hanging off it; a slot
 * that goes cancels its future sessions that nobody has booked, leaves the
 * booked ones as the commitments they are, and then removes the rule. A slot
 * that is new gets a rule and, straight away, its sessions inside the public
 * window: the merchant sees on the site what they just saved, without waiting
 * for the generator's next pass.
 */
export async function replaceWeeklySchedule(db: DbClient, input: {
  organizationId: string
  productId: string
  locationId: string
  timezone: string
  slots: WeeklySlotInput[]
  actorId: string
}): Promise<{ rules: ProductAvailabilityRule[]; sessions: MaterializeSessionsResult; cancelled: number }> {
  if (!isValidTimezone(input.timezone)) badRequest('timezone must be a valid IANA zone')
  const seen = new Set<string>()
  for (const slot of input.slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) badRequest('weekday must be 0 (Sunday) to 6 (Saturday)')
    assertLocalStartTime(slot.start_time)
    if (slot.capacity !== null && (!Number.isSafeInteger(slot.capacity) || slot.capacity < 0)) badRequest('capacity must be a non-negative integer or null')
    const key = `${slot.weekday}:${slot.start_time}`
    if (seen.has(key)) badRequest(`The schedule lists ${slot.start_time} twice on the same day`)
    seen.add(key)
  }
  await requireBookingConfig(db, input.organizationId, input.productId)

  const existing = (await listAvailabilityRules(db, input.organizationId, input.productId))
    .filter(rule => rule.location_id === input.locationId)
  const byKey = new Map(existing.map(rule => [`${rule.weekday}:${rule.start_time}`, rule]))
  const kept = new Set<string>()
  const now = new Date().toISOString()
  const writes: BatchQuery[] = []

  for (const slot of input.slots) {
    const current = byKey.get(`${slot.weekday}:${slot.start_time}`)
    if (current) {
      kept.add(current.id)
      if (current.capacity !== slot.capacity || current.timezone !== input.timezone) {
        writes.push({
          query: `UPDATE product_availability_rules SET capacity = ?, timezone = ?, updated_at = ?, updated_by = ?
                  WHERE organization_id = ? AND id = ?`,
          params: [slot.capacity, input.timezone, now, input.actorId, input.organizationId, current.id],
        })
      }
      continue
    }
    writes.push({
      query: `INSERT INTO product_availability_rules (
                id, organization_id, product_id, location_id, timezone, weekday, start_time, interval_weeks,
                effective_from_date, effective_until_date, duration_minutes, capacity, created_at, updated_at, created_by, updated_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), input.organizationId, input.productId, input.locationId, input.timezone,
        slot.weekday, slot.start_time, slot.capacity, now, now, input.actorId, input.actorId],
    })
  }

  const removed = existing.filter(rule => !kept.has(rule.id))
  for (const rule of removed) {
    // Future sessions nobody holds a seat on go with the slot. A session with
    // a booking stays scheduled: the guest was promised it.
    writes.push({
      query: `UPDATE product_sessions SET status = 'cancelled', updated_at = ?, updated_by = ?
              WHERE organization_id = ? AND availability_rule_id = ? AND status = 'scheduled' AND starts_at > ?
                AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.product_session_id = product_sessions.id AND ${CAPACITY_CONSUMING_SQL})`,
      params: [now, input.actorId, input.organizationId, rule.id, now, now],
    })
    // The rule is the session's provenance, and the schema refuses to delete a
    // rule that sessions still name (product_sessions_rule_scope_fk).
    writes.push({
      query: `UPDATE product_sessions SET availability_rule_id = NULL, updated_at = ?, updated_by = ?
              WHERE organization_id = ? AND availability_rule_id = ?`,
      params: [now, input.actorId, input.organizationId, rule.id],
    })
    writes.push({
      query: 'DELETE FROM product_availability_rules WHERE organization_id = ? AND id = ?',
      params: [input.organizationId, rule.id],
    })
  }

  let cancelled = 0
  if (writes.length) {
    const results = await executeBatch(db, writes, { operation: 'Replace weekly schedule' })
    // Every third write for a removed rule is the cancellation; its count is
    // the sessions that left the calendar.
    const first = writes.length - removed.length * 3
    for (let index = 0; index < removed.length; index += 1) cancelled += results[first + index * 3]?.meta?.changes ?? 0
  }

  const today = localNow(input.timezone).date
  const sessions = await materializeSessions(db, {
    organizationId: input.organizationId, productId: input.productId,
    throughDate: addLocalDays(today, PUBLIC_BOOKING_WINDOW_DAYS), actorId: input.actorId,
  })
  const rules = (await listAvailabilityRules(db, input.organizationId, input.productId))
    .filter(rule => rule.location_id === input.locationId)
  return { rules, sessions, cancelled }
}

export async function listSessions(db: DbClient, input: {
  organizationId: string
  productId?: string
  locationId?: string
  fromInstant: string
  toInstant: string
  statuses?: ProductSessionStatus[]
}): Promise<SessionAvailability[]> {
  const statuses = input.statuses ?? ['scheduled']
  const now = new Date().toISOString()
  return queryAll<SessionAvailability>(db, `
    SELECT s.id, s.organization_id, s.product_id, s.location_id, s.availability_rule_id,
           s.source_occurrence_key, s.timezone, s.starts_at, s.ends_at, s.capacity, s.status,
           COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
           ), 0) AS claimed,
           CASE WHEN s.capacity IS NULL THEN NULL ELSE s.capacity - COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
           ), 0) END AS remaining,
           CASE WHEN s.capacity IS NULL THEN 0 WHEN s.capacity - COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
           ), 0) <= 0 THEN 1 ELSE 0 END AS is_full
    FROM product_sessions s
    WHERE s.organization_id = ?
      AND (? IS NULL OR s.product_id = ?)
      AND (? IS NULL OR s.location_id = ?)
      AND s.starts_at >= ? AND s.starts_at < ?
      AND s.status IN (SELECT value FROM json_each(?))
    ORDER BY s.starts_at, s.id
  `, [
    now, now, now,
    input.organizationId,
    input.productId ?? null, input.productId ?? null,
    input.locationId ?? null, input.locationId ?? null,
    input.fromInstant, input.toInstant, JSON.stringify(statuses),
  ]).then(rows => rows.map(row => ({ ...row, is_full: Boolean(row.is_full) })))
}

/** The public booking window, expressed as instants in the product's timezone. */
export { PUBLIC_BOOKING_WINDOW_DAYS }

export function bookingWindow(timezone: string, days = PUBLIC_BOOKING_WINDOW_DAYS): { fromInstant: string; toInstant: string } {
  if (!isValidTimezone(timezone)) throw new HTTPError({ statusCode: 409, statusMessage: 'Set the timezone before offering bookings' })
  if (days > MAX_CALENDAR_DAYS * 12) badRequest('Booking window is too long')
  const today = localNow(timezone).date
  return {
    fromInstant: new Date().toISOString(),
    toInstant: localDateTimeToInstant(addLocalDays(today, days), '00:00', timezone, 'compatible').toISOString(),
  }
}

export class CapacityUnavailableError extends Error {
  constructor() {
    super('The session no longer has room for this party')
    this.name = 'CapacityUnavailableError'
  }
}

/**
 * The capacity-claiming INSERT, as a query rather than an execution.
 *
 * Exposed so a caller that must move a booking — cancel one claim and take
 * another — can put both in ONE batch. D1 applies a batch in order and
 * atomically, so the release lands before this predicate counts seats, and a
 * failure anywhere leaves the guest's original seat untouched.
 */
export function sessionClaimQuery(input: {
  bookingId: string
  organizationId: string
  siteId: string
  productId: string
  sessionId: string
  productVariantId: string
  partySize: number
  customerId?: string | null
  requestId?: string | null
  holdExpiresAt?: string | null
  /**
   * A booking this claim replaces. Its seats are not counted against the
   * destination's capacity: a guest moving within a full session is not
   * blocked by the seat they are giving up, and one moving into a session
   * that is full without them still is.
   */
  replacingBookingId?: string | null
  /**
   * The request this claim is part of answering, the version it was read at,
   * and the decision key that records the answer.
   *
   * The claim lands only while that request is still exactly what the caller
   * saw *and* nobody has answered the proposal yet. A competing decline
   * records its decision without touching the request, so the version alone
   * would let a losing acceptance take seats it then cannot attach to
   * anything.
   */
  requireUndecided?: { requestId: string; siteId: string; updatedAt: string; decisionDedupeKey: string } | null
  now: string
}): BatchQuery {
  return {
    query: `
      INSERT INTO bookings (
        id, organization_id, site_id, product_id, product_session_id, product_variant_id,
        customer_id, request_id, party_size, status, hold_expires_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
      WHERE ${input.requireUndecided
        ? `EXISTS (SELECT 1 FROM requests WHERE id = ? AND site_id = ? AND updated_at = ?)
           AND NOT EXISTS (SELECT 1 FROM activity_entries WHERE dedupe_key = ?) AND `
        : ''}EXISTS (
        SELECT 1 FROM product_sessions s
        WHERE s.id = ? AND s.organization_id = ? AND s.product_id = ?
          AND s.status = 'scheduled'
          -- The location's own sale switch is part of being bookable: a branch
          -- that has stopped selling this does not take seats for it.
          AND (s.location_id IS NULL OR EXISTS (
            SELECT 1 FROM product_locations pl
             WHERE pl.product_id = s.product_id AND pl.location_id = s.location_id
               AND pl.active = 1 AND pl.published = 1
          ))
          AND s.starts_at > ?
          AND (s.capacity IS NULL OR s.capacity >= ? + COALESCE((
            SELECT SUM(b.party_size) FROM bookings b
            WHERE b.product_session_id = s.id AND b.id IS NOT ? AND ${CAPACITY_CONSUMING_SQL}
          ), 0))
      )
      ON CONFLICT (id) DO NOTHING
    `,
    params: [
      input.bookingId, input.organizationId, input.siteId, input.productId, input.sessionId, input.productVariantId,
      input.customerId ?? null, input.requestId ?? null, input.partySize, input.holdExpiresAt ?? null, input.now, input.now,
      ...(input.requireUndecided
        ? [input.requireUndecided.requestId, input.requireUndecided.siteId, input.requireUndecided.updatedAt, input.requireUndecided.decisionDedupeKey]
        : []),
      input.sessionId, input.organizationId, input.productId, input.now, input.partySize, input.replacingBookingId ?? null, input.now,
    ],
  }
}

/**
 * The single protected capacity operation.
 *
 * Every booking claim — guest checkout, dashboard, MCP, ChowBot, WhatsApp —
 * goes through here or through `sessionClaimQuery`. Session identity alone is
 * not the concurrency control: the insert carries its own capacity predicate,
 * so two concurrent claims for the last seat cannot both succeed. D1 applies
 * each statement atomically, and the second inserts zero rows and raises.
 *
 * A thread already holding a booking returns that booking instead of claiming
 * a second time.
 */
export async function claimSessionCapacity(db: DbClient, input: {
  organizationId: string
  siteId: string
  productId: string
  sessionId: string
  productVariantId: string
  partySize: number
  customerId?: string | null
  requestId?: string | null
  holdExpiresAt?: string | null
  /**
   * The writes that belong to this claim, given the id it minted.
   *
   * They run AFTER the claim, in the same batch, and each one has to carry the
   * claim's existence in its own predicate: a claim that finds no room inserts
   * zero rows and raises nothing, so anything written ahead of it — or written
   * after it unconditionally — commits into a booking that does not exist.
   */
  following?: (_bookingId: string) => BatchQuery[]
}): Promise<{ bookingId: string }> {
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1) badRequest('party_size must be a positive integer')

  if (input.requestId) {
    const existing = await queryFirst<{ id: string }>(db, `
      SELECT id FROM bookings WHERE organization_id = ? AND site_id = ? AND request_id = ?
    `, [input.organizationId, input.siteId, input.requestId])
    if (existing) return { bookingId: existing.id }
  }

  const bookingId = crypto.randomUUID()
  const claim = sessionClaimQuery({ ...input, bookingId, now: new Date().toISOString() })
  const results = await executeBatch(db, [claim, ...(input.following?.(bookingId) ?? [])], { operation: 'Claim session capacity' })
  if ((results[0]?.meta?.changes ?? 0) === 0) throw new CapacityUnavailableError()
  return { bookingId }
}

/**
 * Move a booking to a new state, releasing exactly the seats it held.
 *
 * Cancellation releases this booking's party_size and nothing else, because
 * the seats were never tracked as a counter that could drift — availability is
 * always the sum over live bookings.
 */
export async function setBookingStatus(db: DbClient, input: {
  organizationId: string
  bookingId: string
  status: BookingStatus
  reason?: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  const results = await executeBatch(db, [{
    query: `
      UPDATE bookings SET
        status = ?,
        hold_expires_at = CASE WHEN ? = 'pending' THEN hold_expires_at ELSE NULL END,
        cancelled_at = CASE WHEN ? = 'cancelled' THEN COALESCE(cancelled_at, ?) ELSE NULL END,
        completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END,
        cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE NULL END,
        updated_at = ?
      WHERE organization_id = ? AND id = ?
    `,
    params: [input.status, input.status, input.status, now, input.status, now, input.status, input.reason ?? null, now, input.organizationId, input.bookingId],
  }], { operation: 'Set booking status' })
  if ((results[0]?.meta?.changes ?? 0) === 0) throw new HTTPError({ statusCode: 404, statusMessage: 'Booking not found' })
}

/**
 * Release pending claims whose hold has passed.
 *
 * Expiry is a state change, not a delete: the abandoned claim stays visible in
 * the record and its seats come back because `bookingConsumesCapacity` stops
 * counting it, which the predicate above already reflects. This sweep only
 * makes that explicit so the inbox does not show stale pending threads.
 */
export async function expireBookingHolds(db: DbClient, organizationId: string): Promise<number> {
  const now = new Date().toISOString()
  const results = await executeBatch(db, [{
    query: `
      UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'hold_expired', hold_expires_at = NULL, updated_at = ?
      WHERE organization_id = ? AND status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?
    `,
    params: [now, now, organizationId, now],
  }], { operation: 'Expire booking holds' })
  return results[0]?.meta?.changes ?? 0
}

/**
 * Edit one session: its time, its capacity, or its state.
 *
 * This is what replaces the per-date override map. An override WAS a patch
 * applied on top of a computed schedule; a session IS the schedule, so
 * changing one is an ordinary update to a real row that bookings already
 * point at. Regeneration will not undo it.
 *
 * Editing a session never touches the rule, and editing a rule never touches
 * a session. A series change is an explicit, scoped operation the caller makes
 * over the sessions it names.
 */
export async function updateSession(db: DbClient, input: {
  organizationId: string
  sessionId: string
  actorId: string
  startsAt?: string
  endsAt?: string
  capacity?: number | null
  status?: ProductSessionStatus
}): Promise<void> {
  const session = await queryFirst<ProductSession>(db, `
    SELECT id, organization_id, product_id, location_id, availability_rule_id, source_occurrence_key,
           timezone, starts_at, ends_at, capacity, status
    FROM product_sessions WHERE organization_id = ? AND id = ?
  `, [input.organizationId, input.sessionId])
  if (!session) throw new HTTPError({ statusCode: 404, statusMessage: 'Session not found' })

  const startsAt = input.startsAt ?? session.starts_at
  const endsAt = input.endsAt ?? session.ends_at
  if (endsAt <= startsAt) badRequest('A session must end after it starts')
  if (input.capacity !== undefined && input.capacity !== null && (!Number.isSafeInteger(input.capacity) || input.capacity < 0)) {
    badRequest('capacity must be a non-negative integer or null')
  }

  // Reducing capacity below the seats already claimed would make the session
  // silently oversold. Refuse, and let the merchant cancel bookings first.
  if (input.capacity !== undefined && input.capacity !== null) {
    const claimed = await queryFirst<{ claimed: number }>(db, `
      SELECT COALESCE(SUM(b.party_size), 0) AS claimed FROM bookings b
      WHERE b.product_session_id = ? AND ${CAPACITY_CONSUMING_SQL}
    `, [input.sessionId, new Date().toISOString()])
    if ((claimed?.claimed ?? 0) > input.capacity) {
      throw new HTTPError({
        statusCode: 409,
        statusMessage: `This session already has ${claimed?.claimed} seats claimed; cancel bookings before reducing capacity to ${input.capacity}`,
      })
    }
  }

  const now = new Date().toISOString()
  // The read above is a courtesy: it gives the merchant a message naming the
  // seats in the way. The write carries the same predicate, so a booking that
  // lands between the two cannot leave the session oversold.
  const capacity = input.capacity === undefined ? session.capacity : input.capacity
  const guard = capacity === null
    ? ''
    : `AND ? >= COALESCE((SELECT SUM(b.party_size) FROM bookings b WHERE b.product_session_id = product_sessions.id AND ${CAPACITY_CONSUMING_SQL}), 0)`
  const written = await executeBatch(db, [{
    query: `
      UPDATE product_sessions
      SET starts_at = ?, ends_at = ?, capacity = ?, status = ?, updated_at = ?, updated_by = ?
      WHERE organization_id = ? AND id = ? ${guard}
    `,
    params: [
      startsAt, endsAt, capacity,
      input.status ?? session.status, now, input.actorId,
      input.organizationId, input.sessionId,
      ...(capacity === null ? [] : [capacity, now]),
    ],
  }], { operation: 'Update product session' })
  if (written[0]?.meta?.changes === 0) {
    throw new HTTPError({
      statusCode: 409,
      statusMessage: capacity === null
        // No capacity predicate to fail, so the row itself is gone: it was
        // deleted between the read above and this write.
        ? 'This session is no longer there; reload the calendar'
        : `This session took more seats while you were editing it; cancel bookings before reducing capacity to ${capacity}`,
    })
  }
}

/** The local calendar date a session falls on, for grouping in a UI. */
export function sessionLocalDate(session: Pick<ProductSession, 'starts_at' | 'timezone'>): string {
  return localDateAt(new Date(session.starts_at), session.timezone)
}

export function assertLocalStartTime(value: string, field = 'start_time'): void {
  if (!MINUTE_TIME_PATTERN.test(value)) badRequest(`${field} must be in "HH:MM" format`)
}
