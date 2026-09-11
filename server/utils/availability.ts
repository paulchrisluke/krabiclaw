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

    // Anchor the interval_weeks cadence on the rule's effective start so a
    // fortnightly class keeps its parity no matter when generation runs.
    const anchor = rule.effective_from_date ?? from
    for (let date = from; date <= through; date = addLocalDays(date, 1)) {
      if (new Date(`${date}T00:00:00Z`).getUTCDay() !== rule.weekday) continue
      if (rule.interval_weeks > 1) {
        const weeksSinceAnchor = Math.floor(
          (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / (7 * 86_400_000),
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
export const PUBLIC_BOOKING_WINDOW_DAYS = 31

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
 * The single protected capacity operation.
 *
 * Every booking claim — guest checkout, dashboard, MCP, ChowBot, WhatsApp —
 * goes through here. Session identity alone is not the concurrency control:
 * the insert carries its own capacity predicate, so two concurrent claims for
 * the last seat cannot both succeed. D1 applies each statement atomically, and
 * the second one inserts zero rows and raises.
 *
 * `idempotencyKey` is the caller's own request identity: replaying a claim
 * returns the booking already made instead of claiming a second time.
 */
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
  now: string
}): BatchQuery {
  return {
    query: `
      INSERT INTO bookings (
        id, organization_id, site_id, product_id, product_session_id, product_variant_id,
        customer_id, request_id, party_size, status, hold_expires_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM product_sessions s
        WHERE s.id = ? AND s.organization_id = ? AND s.product_id = ?
          AND s.status = 'scheduled'
          AND s.starts_at > ?
          AND (s.capacity IS NULL OR s.capacity >= ? + COALESCE((
            SELECT SUM(b.party_size) FROM bookings b
            WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
          ), 0))
      )
      ON CONFLICT (id) DO NOTHING
    `,
    params: [
      input.bookingId, input.organizationId, input.siteId, input.productId, input.sessionId, input.productVariantId,
      input.customerId ?? null, input.requestId ?? null, input.partySize, input.holdExpiresAt ?? null, input.now, input.now,
      input.sessionId, input.organizationId, input.productId, input.now, input.partySize, input.now,
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
  idempotencyKey?: string | null
  following?: BatchQuery[]
}): Promise<{ bookingId: string }> {
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1) badRequest('party_size must be a positive integer')

  if (input.requestId) {
    const existing = await queryFirst<{ id: string }>(db, `
      SELECT id FROM bookings WHERE organization_id = ? AND site_id = ? AND request_id = ?
    `, [input.organizationId, input.siteId, input.requestId])
    if (existing) return { bookingId: existing.id }
  }

  const bookingId = input.idempotencyKey ?? crypto.randomUUID()
  const claim = sessionClaimQuery({ ...input, bookingId, now: new Date().toISOString() })
  const results = await executeBatch(db, [claim, ...(input.following ?? [])], { operation: 'Claim session capacity' })
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
  await executeBatch(db, [{
    query: `
      UPDATE product_sessions
      SET starts_at = ?, ends_at = ?, capacity = ?, status = ?, updated_at = ?, updated_by = ?
      WHERE organization_id = ? AND id = ?
    `,
    params: [
      startsAt, endsAt,
      input.capacity === undefined ? session.capacity : input.capacity,
      input.status ?? session.status, now, input.actorId,
      input.organizationId, input.sessionId,
    ],
  }], { operation: 'Update product session' })
}

/** The local calendar date a session falls on, for grouping in a UI. */
export function sessionLocalDate(session: Pick<ProductSession, 'starts_at' | 'timezone'>): string {
  return localDateAt(new Date(session.starts_at), session.timezone)
}

export function assertLocalStartTime(value: string, field = 'start_time'): void {
  if (!MINUTE_TIME_PATTERN.test(value)) badRequest(`${field} must be in "HH:MM" format`)
}
