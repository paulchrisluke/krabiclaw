import { providerUnavailableSql, sessionMemberSql } from '~/server/utils/provider-allocation'
import { PUBLIC_BOOKING_WINDOW_DAYS } from '~/shared/bookings'
import { HTTPError } from 'nitro'
import { requireOrganizationProduct } from '~/server/utils/product-management'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
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
  confirmation_mode: 'instant' | 'review'
  online_payment_required: boolean
  online_timezone: string | null
  calendar_group: string | null
  scheduling_mode: 'legacy' | 'provider'
  assigned_member_id: string | null
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
  /** When the occurrence came into existence, which is when its seats went on sale. */
  created_at: string
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
  const row = await queryFirst<Omit<ProductBookingConfig, 'online_payment_required'> & { online_payment_required: number }>(db, `
    SELECT product_id, organization_id, duration_minutes, default_capacity, confirmation_mode, online_payment_required, online_timezone, calendar_group, scheduling_mode, assigned_member_id
    FROM product_booking_configs WHERE organization_id = ? AND product_id = ?
  `, [organizationId, productId])
  // The absence of a config row means the product does not take bookings. It
  // is not a product with unknown booking settings.
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'This product does not take bookings' })
  return { ...row, online_payment_required: row.online_payment_required === 1 }
}

/** Shared capability writer: omissions retain saved defaults; null clears and capacity zero closes seats. */
export async function setProductBookingConfig(db: DbClient, input: {
  organizationId: string; productId: string; actorId: string; env?: import('~/server/utils/auth').CloudflareEnv
  patch: { duration_minutes?: unknown; default_capacity?: unknown; confirmation_mode?: unknown; online_payment_required?: unknown; online_timezone?: unknown; calendar_group?: unknown; scheduling_mode?: unknown; assigned_member_id?: unknown }
}): Promise<ProductBookingConfig> {
  await requireOrganizationProduct(db, input)
  const patch = input.patch
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) badRequest('Invalid request body')
  const fields = ['duration_minutes', 'default_capacity', 'confirmation_mode', 'online_payment_required', 'online_timezone', 'calendar_group', 'scheduling_mode', 'assigned_member_id'] as const
  if (Object.keys(patch).some(key => !fields.includes(key as typeof fields[number]))) badRequest('Unknown booking configuration field')
  for (const field of ['duration_minutes', 'default_capacity'] as const) {
    const value = patch[field]
    if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) badRequest(`${field} must be a non-negative integer or null`)
  }
  if (patch.duration_minutes === 0) badRequest('duration_minutes must be positive')
  if (patch.confirmation_mode !== undefined && patch.confirmation_mode !== 'instant' && patch.confirmation_mode !== 'review') badRequest('confirmation_mode must be instant or review')
  if (patch.online_payment_required !== undefined && typeof patch.online_payment_required !== 'boolean') badRequest('online_payment_required must be boolean')
  if (patch.online_timezone !== undefined && patch.online_timezone !== null && (typeof patch.online_timezone !== 'string' || !isValidTimezone(patch.online_timezone))) badRequest('online_timezone must be an IANA timezone or null')
  if (patch.calendar_group !== undefined && patch.calendar_group !== null && (typeof patch.calendar_group !== 'string' || !patch.calendar_group.trim() || patch.calendar_group.length > 64)) badRequest('calendar_group must be a nonempty string of at most 64 characters or null')
  const current = await queryFirst<{ online_timezone: string | null; calendar_group: string | null; scheduling_mode:string }>(db, 'SELECT online_timezone, calendar_group, scheduling_mode FROM product_booking_configs WHERE organization_id = ? AND product_id = ?', [input.organizationId, input.productId])
  const timezone = patch.online_timezone === undefined ? current?.online_timezone ?? null : patch.online_timezone
  const group = patch.calendar_group === undefined ? current?.calendar_group ?? null : patch.calendar_group
  if (group && !timezone) badRequest('Set an online timezone before enrolling a single calendar')
  if (patch.scheduling_mode !== undefined && !['legacy', 'provider'].includes(String(patch.scheduling_mode))) badRequest('Invalid scheduling mode')
  if (patch.assigned_member_id !== undefined && patch.assigned_member_id !== null && typeof patch.assigned_member_id !== 'string') badRequest('Invalid member ID')
  if (patch.scheduling_mode !== undefined || patch.assigned_member_id !== undefined) {
    const { requireSchedulingAccess } = await import('~/server/domain/member-scheduling')
    const existing = await queryFirst<{assigned_member_id:string|null;scheduling_mode:string}>(db,'SELECT assigned_member_id,scheduling_mode FROM product_booking_configs WHERE product_id=? AND organization_id=?',[input.productId,input.organizationId])
    const assigned=patch.assigned_member_id===undefined?existing?.assigned_member_id??null:patch.assigned_member_id as string|null
    // All callers of this shared writer must authenticate provider changes.
    const { resolveOrganizationMembership, assertRoleAllows }=await import('~/server/utils/member-access')
    const env=input.env
    if(!env)throw new HTTPError({statusCode:403,message:'Authenticated provider configuration required'})
    const membership=await resolveOrganizationMembership(env,{organizationId:input.organizationId,userId:input.actorId})
    if(!membership)throw new HTTPError({statusCode:403,message:'Organization membership required'})
    await assertRoleAllows({...membership,permissions:{products:['update']}})
    if(assigned)await requireSchedulingAccess({env,userId:input.actorId,organizationId:input.organizationId},assigned,true)
    if((patch.scheduling_mode??existing?.scheduling_mode)==='provider' && !assigned)badRequest('Assign a member before enabling provider scheduling; legacy mode supports organization scheduling')
  }
  const now = new Date().toISOString()
  const written = await executeBatch(db, [{
    query: `INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, confirmation_mode, online_payment_required, online_timezone, calendar_group, scheduling_mode, assigned_member_id, created_at, updated_at, created_by, updated_by)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (?<>'provider' OR NOT EXISTS (SELECT 1 FROM bookings b JOIN product_sessions s ON s.id=b.product_session_id WHERE b.organization_id=? AND b.product_id=? AND b.assigned_member_id IS NULL AND b.status IN ('pending','confirmed') AND s.ends_at>?) AND NOT EXISTS(SELECT 1 FROM payment_checkout_holds h WHERE h.organization_id=? AND h.product_id=? AND h.assigned_member_id IS NULL AND h.status='active' AND h.expires_at>?)) AND (?='provider' OR ? IS NULL OR NOT EXISTS (
        SELECT 1 FROM bookings own_booking
        JOIN product_sessions own_session ON own_session.id = own_booking.product_session_id AND own_session.location_id IS NULL
        JOIN product_sessions other_session ON other_session.organization_id = own_session.organization_id AND other_session.location_id IS NULL
          AND other_session.starts_at < own_session.ends_at AND other_session.ends_at > own_session.starts_at
        JOIN bookings other_booking ON other_booking.product_session_id = other_session.id AND other_booking.id <> own_booking.id
        LEFT JOIN product_booking_configs other_config ON other_config.product_id = other_session.product_id
        WHERE own_booking.organization_id = ? AND own_booking.product_id = ?
          AND own_booking.status IN ('pending', 'confirmed') AND other_booking.status IN ('pending', 'confirmed')
          AND (other_session.product_id = own_session.product_id OR other_config.calendar_group = ?)
      ))
      ON CONFLICT (product_id) DO UPDATE SET
        ${fields.map(field => `${field} = CASE WHEN ? THEN excluded.${field} ELSE product_booking_configs.${field} END`).join(', ')},
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
      WHERE product_booking_configs.organization_id = excluded.organization_id`,
    params: [input.productId, input.organizationId, patch.duration_minutes ?? null, patch.default_capacity ?? null,
      patch.confirmation_mode ?? 'instant', patch.online_payment_required === true ? 1 : 0, patch.online_timezone ?? null, patch.calendar_group ?? null, patch.scheduling_mode ?? 'legacy', patch.assigned_member_id ?? null,
      now, now, input.actorId, input.actorId, patch.scheduling_mode ?? current?.scheduling_mode ?? 'legacy', input.organizationId, input.productId, now, input.organizationId, input.productId, now, patch.scheduling_mode ?? current?.scheduling_mode ?? 'legacy', patch.calendar_group ?? null, input.organizationId, input.productId, patch.calendar_group ?? null,
      ...fields.map(field => patch[field] !== undefined ? 1 : 0)],
  }, publicResourceCacheInvalidationQuery(input.organizationId, 'product-booking-config')], { operation: 'Set product booking config' })
  if (!written[0]?.meta?.changes) throw new HTTPError({ statusCode: 409, statusMessage: 'Existing appointments overlap this single calendar; resolve them before changing enrollment' })
  return requireBookingConfig(db, input.organizationId, input.productId)
}

export async function deleteProductBookingConfig(db: DbClient, input: { organizationId: string; productId: string }): Promise<void> {
  await requireOrganizationProduct(db, input)
  const booked = await queryFirst<{ n: number }>(db, 'SELECT count(*) AS n FROM bookings WHERE organization_id = ? AND product_id = ?', [input.organizationId, input.productId])
  if ((booked?.n ?? 0) > 0) throw new HTTPError({ statusCode: 409, statusMessage: 'This product has bookings. Leave bookings on and turn the product off instead.' })
  await executeBatch(db, [{
    query: `DELETE FROM product_booking_configs WHERE organization_id = ? AND product_id = ?
      AND NOT EXISTS (SELECT 1 FROM bookings WHERE organization_id = ? AND product_id = ?)`,
    params: [input.organizationId, input.productId, input.organizationId, input.productId],
  }, publicResourceCacheInvalidationQuery(input.organizationId, 'product-booking-config-delete')], { operation: 'Remove product booking config' })
  const remaining = await queryFirst<{ product_id: string }>(db, 'SELECT product_id FROM product_booking_configs WHERE organization_id = ? AND product_id = ?', [input.organizationId, input.productId])
  if (remaining) throw new HTTPError({ statusCode: 409, statusMessage: 'The booking configuration changed while it was being removed' })
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
  locationId?: string | null
  fromDate?: string
  throughDate: string
  actorId: string
}): Promise<MaterializeSessionsResult> {
  const config = await requireBookingConfig(db, input.organizationId, input.productId)
  const rules = (await listAvailabilityRules(db, input.organizationId, input.productId))
    .filter(rule => input.locationId === undefined || rule.location_id === input.locationId)
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
      // A slot that was removed and added back meets its own old sessions at
      // the same instant: the removal cancelled the unbooked ones and left the
      // booked ones scheduled, and cut every one of them loose from the rule.
      // Detached generated sessions without booking history retain the existing
      // re-adoption behavior. Any booking, including cancelled history, protects
      // every actual fact and the occurrence identity. The predicate is inside
      // the UPSERT, so a claim arriving during generation protects the row too.
      // A live rule's session or a hand-made session is also left alone.
      writes.push({
        query: `
          INSERT INTO product_sessions (
            id, organization_id, product_id, location_id, availability_rule_id, source_occurrence_key,
            timezone, starts_at, ends_at, capacity, status, created_at, updated_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
          ON CONFLICT (product_id, source_occurrence_key) WHERE source_occurrence_key IS NOT NULL DO NOTHING
          ON CONFLICT (product_id, location_id, starts_at) WHERE location_id IS NOT NULL DO UPDATE SET
            availability_rule_id = excluded.availability_rule_id, source_occurrence_key = excluded.source_occurrence_key,
            status = CASE WHEN product_sessions.status = 'cancelled' THEN 'scheduled' ELSE product_sessions.status END,
            ends_at = excluded.ends_at, capacity = excluded.capacity, timezone = excluded.timezone,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by
            WHERE product_sessions.availability_rule_id IS NULL AND product_sessions.source_occurrence_key IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.organization_id = product_sessions.organization_id AND b.product_session_id = product_sessions.id)
          ON CONFLICT (product_id, starts_at) WHERE location_id IS NULL DO UPDATE SET
            availability_rule_id = excluded.availability_rule_id, source_occurrence_key = excluded.source_occurrence_key,
            status = CASE WHEN product_sessions.status = 'cancelled' THEN 'scheduled' ELSE product_sessions.status END,
            ends_at = excluded.ends_at, capacity = excluded.capacity, timezone = excluded.timezone,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by
            WHERE product_sessions.availability_rule_id IS NULL AND product_sessions.source_occurrence_key IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.organization_id = product_sessions.organization_id AND b.product_session_id = product_sessions.id)
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
}

/**
 * Replace a product's weekly schedule at one location.
 *
 * The schedule is the set of (weekday, time) slots the merchant runs, using
 * the Product's duration and capacity. A slot that stays keeps its
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
  locationId: string | null
  timezone?: string
  slots: unknown
  actorId: string
}): Promise<{ rules: ProductAvailabilityRule[]; sessions: MaterializeSessionsResult; cancelled: number }> {
  await requireOrganizationProduct(db, input)
  const config = await requireBookingConfig(db, input.organizationId, input.productId)
  const location = input.locationId === null ? { timezone: config.online_timezone } : await queryFirst<{ timezone: string | null }>(db, 'SELECT timezone FROM business_locations WHERE organization_id = ? AND id = ?', [input.organizationId, input.locationId])
  if (!location) throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  if (!isValidTimezone(location.timezone)) throw new HTTPError({ statusCode: 409, statusMessage: 'Set the configured online or location timezone before scheduling sessions' })
  const timezone = location.timezone
  if (input.timezone !== undefined && input.timezone !== timezone) badRequest('timezone must match the configured timezone')
  if (!Array.isArray(input.slots)) badRequest('slots must be an array')
  const slots: WeeklySlotInput[] = input.slots.map(entry => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) badRequest('each slot must be an object')
    if (typeof entry.weekday !== 'number' || typeof entry.start_time !== 'string') badRequest('each slot needs a weekday and a start_time')
    if (Object.keys(entry).some(key => key !== 'weekday' && key !== 'start_time')) badRequest('slots support only weekday and start_time; set duration and capacity on the product')
    return { weekday: entry.weekday, start_time: entry.start_time }
  })
  const seen = new Set<string>()
  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) badRequest('weekday must be 0 (Sunday) to 6 (Saturday)')
    assertLocalStartTime(slot.start_time)
    const key = `${slot.weekday}:${slot.start_time}`
    if (seen.has(key)) badRequest(`The schedule lists ${slot.start_time} twice on the same day`)
    seen.add(key)
  }
  // Weekly slots carry no duration of their own; they read the product's.
  if (slots.length && config.duration_minutes === null) badRequest('Set the session duration before adding a weekly schedule')

  const existing = (await listAvailabilityRules(db, input.organizationId, input.productId))
    .filter(rule => rule.location_id === input.locationId)
  const byKey = new Map(existing.map(rule => [`${rule.weekday}:${rule.start_time}`, rule]))
  const kept = new Set<string>()
  const now = new Date().toISOString()
  const writes: BatchQuery[] = []

  for (const slot of slots) {
    const current = byKey.get(`${slot.weekday}:${slot.start_time}`)
    if (current) {
      kept.add(current.id)
      if (current.timezone !== timezone) {
        writes.push({
          query: `UPDATE product_availability_rules SET timezone = ?, updated_at = ?, updated_by = ? WHERE organization_id = ? AND id = ?`,
          params: [timezone, now, input.actorId, input.organizationId, current.id],
        })
      }
      continue
    }
    writes.push({
      query: `INSERT INTO product_availability_rules (
                id, organization_id, product_id, location_id, timezone, weekday, start_time, created_at, updated_at, created_by, updated_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), input.organizationId, input.productId, input.locationId, timezone,
        slot.weekday, slot.start_time, now, now, input.actorId, input.actorId],
    })
  }

  const removed = existing.filter(rule => !kept.has(rule.id))
  for (const rule of removed) {
    // Only sessions with no booking history go with the slot. Cancelled
    // bookings still belong to that session's history and protect its facts.
    writes.push({
      query: `UPDATE product_sessions SET status = 'cancelled', updated_at = ?, updated_by = ?
              WHERE organization_id = ? AND availability_rule_id = ? AND status = 'scheduled' AND starts_at > ?
                AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.organization_id = product_sessions.organization_id AND b.product_session_id = product_sessions.id)`,
      params: [now, input.actorId, input.organizationId, rule.id, now],
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

  const today = localNow(timezone).date
  const sessions = await materializeSessions(db, {
    organizationId: input.organizationId, productId: input.productId, locationId: input.locationId,
    throughDate: addLocalDays(today, PUBLIC_BOOKING_WINDOW_DAYS), actorId: input.actorId,
  })
  const rules = (await listAvailabilityRules(db, input.organizationId, input.productId))
    .filter(rule => rule.location_id === input.locationId)
  await executeBatch(db, [publicResourceCacheInvalidationQuery(input.organizationId, 'product-weekly-schedule')])
  return { rules, sessions, cancelled }
}

/** Explicit tenant-scoped online calendar enrollment; intervals are half open. */
export function onlineCalendarConflictSql(sessionAlias: string, replacingBookingSql = 'NULL', excludingSessionSql = 'NULL', convertingPaymentSql = 'NULL'): string {
  return `(${sessionMemberSql(sessionAlias)} IS NULL AND (EXISTS (
    SELECT 1 FROM product_booking_configs own
      JOIN product_booking_configs peer ON peer.organization_id = own.organization_id
        AND peer.calendar_group = own.calendar_group
      JOIN product_sessions occupied ON occupied.product_id = peer.product_id
        AND occupied.organization_id = own.organization_id
      JOIN bookings b ON b.product_session_id = occupied.id
    WHERE own.product_id = ${sessionAlias}.product_id
      AND own.organization_id = ${sessionAlias}.organization_id AND own.calendar_group IS NOT NULL
      AND occupied.starts_at < ${sessionAlias}.ends_at AND occupied.ends_at > ${sessionAlias}.starts_at
      AND b.id IS NOT ${replacingBookingSql} AND occupied.id IS NOT ${excludingSessionSql} AND ${CAPACITY_CONSUMING_SQL}
  ) OR EXISTS (
    SELECT 1 FROM payment_checkout_holds h JOIN product_booking_configs own
      ON own.product_id = ${sessionAlias}.product_id AND own.organization_id = ${sessionAlias}.organization_id
    WHERE h.organization_id = ${sessionAlias}.organization_id AND own.calendar_group IS NOT NULL
      AND h.calendar_group = own.calendar_group AND h.status = 'active'
      AND h.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND h.payment_id IS NOT ${convertingPaymentSql} AND h.session_id IS NOT ${excludingSessionSql}
      AND h.starts_at < ${sessionAlias}.ends_at AND h.ends_at > ${sessionAlias}.starts_at
  )))`
}

export function sessionHeldCapacitySql(sessionAlias: string, convertingPaymentSql = 'NULL'): string {
  return `COALESCE((SELECT SUM(h.quantity) FROM payment_checkout_holds h
    WHERE h.session_id = ${sessionAlias}.id AND h.organization_id = ${sessionAlias}.organization_id
      AND h.status = 'active' AND h.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND h.payment_id IS NOT ${convertingPaymentSql}), 0)`
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
  return queryAll<SessionAvailability>(db, `
    SELECT s.id, s.organization_id, s.product_id, s.location_id, s.availability_rule_id,
           s.source_occurrence_key, s.timezone, s.starts_at, s.ends_at, s.capacity, s.status, s.created_at,
           COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
           ), 0) + ${sessionHeldCapacitySql('s')} AS claimed,
           CASE WHEN (${onlineCalendarConflictSql('s')} OR ${providerUnavailableSql('s')}) THEN 0 WHEN s.capacity IS NULL THEN NULL ELSE s.capacity - ${sessionHeldCapacitySql('s')} - COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.product_session_id = s.id AND ${CAPACITY_CONSUMING_SQL}
           ), 0) END AS remaining,
           CASE WHEN (${onlineCalendarConflictSql('s')} OR ${providerUnavailableSql('s')}) THEN 1 WHEN s.capacity IS NULL THEN 0 WHEN s.capacity - ${sessionHeldCapacitySql('s')} - COALESCE((
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
export interface SessionAllocationInput {
  organizationId: string; productId: string; sessionId: string; partySize: number; now: string
  replacingBookingId?: string | null
  /** Only authenticated capture reconciliation supplies this; public callers cannot exclude holds. */
  capturedPaymentId?: string
  /** Authenticated automatic capture time; delivery time still checks current capacity. */
  capturedAt?: string
  requireUndecided?: { requestId: string; organizationId: string; updatedAt: string; decisionDedupeKey: string } | null
}

export function sessionAllocationPredicate(input: SessionAllocationInput): BatchQuery {
  return { query: `${input.capturedPaymentId ? `EXISTS (SELECT 1 FROM payment_checkout_holds h JOIN payments p ON p.id=h.payment_id WHERE p.id=? AND p.organization_id=? AND p.state='captured' AND p.refunded_amount=0 AND h.status IN ('active','released') AND h.expires_at>? AND h.session_id=? AND h.quantity=? AND h.organization_id=p.organization_id AND h.amount=p.amount AND h.currency=p.currency) AND ` : ''}${input.requireUndecided
        ? `EXISTS (SELECT 1 FROM requests WHERE id = ? AND organization_id = ? AND updated_at = ?)
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
          AND NOT ${onlineCalendarConflictSql('s', '?', 'NULL', '?')}
          AND NOT ${providerUnavailableSql('s', '?', '?')}
          ${input.capturedPaymentId ? 'AND EXISTS(SELECT 1 FROM payment_checkout_holds held WHERE held.payment_id=? AND held.assigned_member_id IS ' + sessionMemberSql('s') + ')' : ''}
          AND (s.capacity IS NULL OR s.capacity >= ? + ${sessionHeldCapacitySql('s','?')} + COALESCE((
            SELECT SUM(b.party_size) FROM bookings b
            WHERE b.product_session_id = s.id AND b.id IS NOT ? AND ${CAPACITY_CONSUMING_SQL}
          ), 0))
      )`, params: [
      ...(input.capturedPaymentId ? [input.capturedPaymentId,input.organizationId,input.capturedAt ?? input.now,input.sessionId,input.partySize] : []),
      ...(input.requireUndecided
        ? [input.requireUndecided.requestId, input.requireUndecided.organizationId, input.requireUndecided.updatedAt, input.requireUndecided.decisionDedupeKey]
        : []),
      input.sessionId, input.organizationId, input.productId, input.now, input.replacingBookingId ?? null, input.capturedPaymentId ?? null, input.replacingBookingId ?? null, input.capturedPaymentId ?? null, ...(input.capturedPaymentId ? [input.capturedPaymentId] : []), input.partySize, input.capturedPaymentId ?? null, input.replacingBookingId ?? null,
  ] }
}

/** Move the same operational Booking ID, preserving its review and payment identity. */
export function sessionMoveQuery(input: SessionAllocationInput & { bookingId: string }): BatchQuery {
  const allocation = sessionAllocationPredicate({ ...input, replacingBookingId: input.bookingId })
  return {
    query: `UPDATE bookings SET assigned_member_id = (SELECT ${sessionMemberSql('destination')} FROM product_sessions destination WHERE destination.id=? AND destination.organization_id=?), product_session_id = ?, party_size = ?, updated_at = ?
      WHERE id = ? AND organization_id = ? AND product_id = ? AND status IN ('pending', 'confirmed')
        AND ${allocation.query}`,
    params: [input.sessionId, input.organizationId, input.sessionId, input.partySize, input.now, input.bookingId, input.organizationId, input.productId, ...allocation.params!],
  }
}

export function sessionClaimQuery(input: {
  bookingId: string
  organizationId: string
  productId: string
  sessionId: string
  productVariantId: string
  partySize: number
  /** The Better Auth user the booking belongs to. */
  userId?: string | null
  requestId?: string | null
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
  requireUndecided?: { requestId: string; organizationId: string; updatedAt: string; decisionDedupeKey: string } | null
  capturedPaymentId?: string
  /** Authenticated automatic capture time; delivery time still checks current capacity. */
  capturedAt?: string
  now: string
}): BatchQuery {
  return {
    query: `
      INSERT INTO bookings (
        id, organization_id, product_id, product_session_id, product_variant_id,
        user_id, request_id, party_size, status, created_at, updated_at, assigned_member_id
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT status FROM bookings WHERE id = ?),
          (SELECT CASE WHEN confirmation_mode = 'review' THEN 'pending' ELSE 'confirmed' END
           FROM product_booking_configs WHERE product_id = ? AND organization_id = ?)), ?, ?,
        (SELECT ${sessionMemberSql('assigned')} FROM product_sessions assigned WHERE assigned.id=? AND assigned.organization_id=?)
      WHERE ${sessionAllocationPredicate(input).query}
        AND EXISTS(SELECT 1 FROM product_variants v WHERE v.id=? AND v.product_id=? AND v.organization_id=? AND v.active=1)
      ON CONFLICT (id) DO NOTHING
    `,
    params: [
      input.bookingId, input.organizationId, input.productId, input.sessionId, input.productVariantId,
      input.userId ?? null, input.requestId ?? null, input.partySize, input.replacingBookingId ?? null, input.productId, input.organizationId, input.now, input.now, input.sessionId, input.organizationId,
      ...sessionAllocationPredicate(input).params!, input.productVariantId,input.productId,input.organizationId,
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
  productId: string
  sessionId: string
  productVariantId: string
  partySize: number
  /** The Better Auth user the booking belongs to. */
  userId?: string | null
  requestId?: string | null
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
    const existing = await queryFirst<{ id: string; product_id: string; product_session_id: string; product_variant_id: string; party_size: number }>(db, `
      SELECT id, product_id, product_session_id, product_variant_id, party_size FROM bookings WHERE organization_id = ? AND request_id = ?
    `, [input.organizationId, input.requestId])
    if (existing) {
      if (existing.product_id !== input.productId || existing.product_session_id !== input.sessionId || existing.product_variant_id !== input.productVariantId || existing.party_size !== input.partySize) throw new HTTPError({ statusCode: 409, statusMessage: 'This request already holds a different booking' })
      return { bookingId: existing.id }
    }
  }

  const bookingId = crypto.randomUUID()
  const claim = sessionClaimQuery({ ...input, bookingId, now: new Date().toISOString() })
  const results = await executeBatch(db, [claim, sessionAssignmentQuery(input.sessionId, input.organizationId, bookingId), ...(input.following?.(bookingId) ?? [])], { operation: 'Claim session capacity' })
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
        cancelled_at = CASE WHEN ? = 'cancelled' THEN COALESCE(cancelled_at, ?) ELSE NULL END,
        cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE NULL END,
        updated_at = ?
      WHERE organization_id = ? AND id = ?
        AND (status = ? OR (status = 'pending' AND ? = 'confirmed') OR (? = 'cancelled' AND status IN ('pending', 'confirmed')))
    `,
    params: [input.status, input.status, now, input.status, input.reason ?? null, now, input.organizationId, input.bookingId, input.status, input.status, input.status],
  }], { operation: 'Set booking status' })
  if ((results[0]?.meta?.changes ?? 0) === 0) throw new HTTPError({ statusCode: 404, statusMessage: 'Booking not found' })
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
      SELECT COALESCE((SELECT SUM(b.party_size) FROM bookings b WHERE b.product_session_id=s.id AND ${CAPACITY_CONSUMING_SQL}),0) + ${sessionHeldCapacitySql('s')} AS claimed FROM product_sessions s WHERE s.id=?
    `, [input.sessionId])
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
    : `AND ? >= COALESCE((SELECT SUM(b.party_size) FROM bookings b WHERE b.product_session_id = product_sessions.id AND ${CAPACITY_CONSUMING_SQL}), 0) + (SELECT ${sessionHeldCapacitySql('held')} FROM product_sessions held WHERE held.id=product_sessions.id)`
  const written = await executeBatch(db, [{
    query: `
      UPDATE product_sessions
      SET starts_at = ?, ends_at = ?, capacity = ?, status = ?, updated_at = ?, updated_by = ?
      WHERE organization_id = ? AND id = ? ${guard}
        AND (${sessionMemberSql('product_sessions')} IS NULL OR (starts_at=? AND ends_at=? AND status=?) OR (
          NOT EXISTS(SELECT 1 FROM bookings b WHERE b.product_session_id=product_sessions.id AND ${CAPACITY_CONSUMING_SQL})
          AND NOT EXISTS(SELECT 1 FROM payment_checkout_holds h WHERE h.session_id=product_sessions.id AND h.status='active' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))))
        AND (NOT EXISTS (SELECT 1 FROM bookings b WHERE b.product_session_id = product_sessions.id AND ${CAPACITY_CONSUMING_SQL})
          OR NOT EXISTS (SELECT 1 FROM (SELECT product_sessions.id AS id, product_sessions.assigned_member_id AS assigned_member_id, product_sessions.organization_id AS organization_id, product_sessions.product_id AS product_id, product_sessions.location_id AS location_id, ? AS starts_at, ? AS ends_at) proposed
            WHERE ${onlineCalendarConflictSql('proposed', 'NULL', 'product_sessions.id')} OR ${providerUnavailableSql('proposed')}))
    `,
    params: [
      startsAt, endsAt, capacity,
      input.status ?? session.status, now, input.actorId,
      input.organizationId, input.sessionId,
      ...(capacity === null ? [] : [capacity]), startsAt, endsAt, input.status ?? session.status, startsAt, endsAt,
    ],
  }], { operation: 'Update product session' })
  if (written[0]?.meta?.changes === 0) {
    throw new HTTPError({
      statusCode: 409,
      statusMessage: 'This session changed, has live bookings, or overlaps an occupied online calendar; reload and resolve the conflict',
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

/** Persist the Session commitment inside the same D1 batch as its first claim. */
export function sessionAssignmentQuery(sessionId:string, organizationId:string, bookingId:string):BatchQuery {
 return {query:'UPDATE product_sessions SET assigned_member_id=(SELECT assigned_member_id FROM bookings WHERE id=?) WHERE id=? AND organization_id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND product_session_id=product_sessions.id)',params:[bookingId,sessionId,organizationId,bookingId]}
}
