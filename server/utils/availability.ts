import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { generateReservationTimes, isStructuredOpeningHours } from '~/shared/reservation-hours'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_NOTE_LENGTH = 1000
const MAX_CALENDAR_DAYS = 42
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export type AvailabilityOwner =
  | { kind: 'location'; locationId: string }
  | { kind: 'experience'; experienceId: string }

export interface AvailabilityOverride {
  id: string
  organization_id: string
  site_id: string
  owner_type: AvailabilityOwner['kind']
  location_id: string | null
  experience_id: string | null
  override_date: string
  time_slot: string
  status: 'open' | 'closed'
  capacity_override: number | null
  note: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface PublicAvailabilitySlot {
  time_slot: string
  capacity: number | null
  booked: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
}

export interface PrivateAvailabilitySlot extends PublicAvailabilitySlot {
  override: Pick<
    AvailabilityOverride,
    'id' | 'status' | 'capacity_override' | 'note' | 'updated_at'
  > | null
}

export interface AvailabilityCalendarBooking {
  id: string
  time_slot: string
  party_size: number
  label: string
  status: string
}

export interface AvailabilityCalendarDay {
  date: string
  slots: PrivateAvailabilitySlot[]
  bookings: AvailabilityCalendarBooking[]
}

export interface AvailabilityCalendarOwner {
  owner: AvailabilityOwner
  label: string
  location_id: string
  timezone: string
  days: AvailabilityCalendarDay[]
}

export interface AvailabilityCalendar {
  from: string
  to: string
  owners: AvailabilityCalendarOwner[]
}

export type AvailabilityChange = {
  override_date: string
  time_slot: string
} & (
  | { directive: 'inherit' }
  | {
      directive: 'set'
      status: 'open' | 'closed'
      capacity_override?: number | null
      note?: string | null
    }
)

type AvailabilityOwnerRecord = {
  id: string
  location_id: string
}

type AvailabilityOverrideProjection = Pick<
  AvailabilityOverride,
  'time_slot' | 'status' | 'capacity_override'
>

type AvailabilityCalendarRow = {
  row_kind: 'owner' | 'override' | 'booking'
  owner_type: AvailabilityOwner['kind']
  owner_id: string
  location_id: string
  label: string | null
  timezone: string | null
  schedule_json: string | null
  default_capacity: number | null
  event_date: string | null
  time_slot: string | null
  status: string | null
  capacity_override: number | null
  note: string | null
  updated_at: string | null
  record_id: string | null
  party_size: number | null
  guest_label: string | null
}

export function assertAvailabilityDate(value: string, field = 'date'): void {
  if (!DATE_PATTERN.test(value)) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be in "YYYY-MM-DD" format` })
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a valid calendar date` })
  }
}

function assertAvailabilityChange(change: AvailabilityChange): void {
  assertAvailabilityDate(change.override_date, 'override_date')
  if (!TIME_SLOT_PATTERN.test(change.time_slot)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'time_slot must be in "HH:MM" format' })
  }
  if (change.directive === 'inherit') return
  if (change.status !== 'open' && change.status !== 'closed') {
    throw new HTTPError({ statusCode: 400, statusMessage: 'status must be "open" or "closed"' })
  }
  const capacity = change.capacity_override
  if (capacity !== null && capacity !== undefined && (!Number.isInteger(capacity) || capacity < 0)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'capacity_override must be a non-negative integer' })
  }
  if ((change.note?.length ?? 0) > MAX_NOTE_LENGTH) {
    throw new HTTPError({ statusCode: 400, statusMessage: `note must not exceed ${MAX_NOTE_LENGTH} characters` })
  }
}

export async function resolveAvailabilityOwner(
  db: DbClient,
  organizationId: string,
  siteId: string,
  owner: AvailabilityOwner,
): Promise<AvailabilityOwnerRecord> {
  const row = owner.kind === 'location'
    ? await queryFirst<AvailabilityOwnerRecord>(db, `
        SELECT id, id AS location_id
        FROM business_locations
        WHERE organization_id = ? AND site_id = ? AND id = ?
      `, [organizationId, siteId, owner.locationId])
    : await queryFirst<AvailabilityOwnerRecord>(db, `
        SELECT id, location_id
        FROM experiences
        WHERE organization_id = ? AND site_id = ? AND id = ?
      `, [organizationId, siteId, owner.experienceId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Availability owner not found' })
  return row
}

function ownerPredicate(owner: AvailabilityOwner): { sql: string; id: string } {
  return owner.kind === 'location'
    ? { sql: 'owner_type = \'location\' AND location_id = ?', id: owner.locationId }
    : { sql: 'owner_type = \'experience\' AND experience_id = ?', id: owner.experienceId }
}

export async function listAvailabilityOverrides(
  db: DbClient,
  siteId: string,
  owner: AvailabilityOwner,
  range: { from?: string; to?: string } = {},
): Promise<AvailabilityOverride[]> {
  if (range.from) assertAvailabilityDate(range.from, 'from')
  if (range.to) assertAvailabilityDate(range.to, 'to')
  if (range.from && range.to && range.from > range.to) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'from must not be after to' })
  }
  const predicate = ownerPredicate(owner)
  const params: unknown[] = [siteId, predicate.id]
  let sql = `SELECT * FROM availability_overrides WHERE site_id = ? AND ${predicate.sql}`
  if (range.from) {
    sql += ' AND override_date >= ?'
    params.push(range.from)
  }
  if (range.to) {
    sql += ' AND override_date <= ?'
    params.push(range.to)
  }
  sql += ' ORDER BY override_date, time_slot, id'
  return await queryAll<AvailabilityOverride>(db, sql, params)
}

function calendarDateKeys(from: string, to: string): string[] {
  assertAvailabilityDate(from, 'from')
  assertAvailabilityDate(to, 'to')
  if (from > to) throw new HTTPError({ statusCode: 400, statusMessage: 'from must not be after to' })
  const dates: string[] = []
  const cursor = new Date(`${from}T00:00:00.000Z`)
  while (cursor.toISOString().slice(0, 10) <= to) {
    dates.push(cursor.toISOString().slice(0, 10))
    if (dates.length > MAX_CALENDAR_DAYS) {
      throw new HTTPError({ statusCode: 400, statusMessage: `Calendar ranges may not exceed ${MAX_CALENDAR_DAYS} days` })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function resolveExperienceScheduleSlots(
  experience: {
    recurring_slots: Partial<Record<(typeof WEEKDAYS)[number], string[]>> | null
    time_slots: string[] | null
  },
  date: string,
): string[] {
  if (!experience.recurring_slots) return experience.time_slots ?? []
  const weekdayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  const weekday = WEEKDAYS[(weekdayIndex + 6) % 7]!
  return experience.recurring_slots[weekday] ?? []
}

function parsedJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  return JSON.parse(value) as T
}

export async function readAvailabilityCalendar(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    locationId: string
    range: { from: string; to: string }
    owner?: AvailabilityOwner
  },
): Promise<AvailabilityCalendar> {
  const dates = calendarDateKeys(input.range.from, input.range.to)
  const rows = await queryAll<AvailabilityCalendarRow>(db, `
    WITH default_timezone AS (
      SELECT value
      FROM site_config
      WHERE organization_id = ? AND site_id = ? AND key = 'default_timezone'
      LIMIT 1
    ), selected_owners AS (
      SELECT
        'location' AS owner_type,
        l.id AS owner_id,
        l.id AS location_id,
        l.title || ' reservations' AS label,
        COALESCE(l.timezone, (SELECT value FROM default_timezone), 'UTC') AS timezone,
        l.opening_hours AS schedule_json,
        l.max_capacity AS default_capacity
      FROM business_locations l
      WHERE l.organization_id = ? AND l.site_id = ? AND l.id = ?
      UNION ALL
      SELECT
        'experience' AS owner_type,
        e.id AS owner_id,
        e.location_id,
        p.name AS label,
        COALESCE(l.timezone, (SELECT value FROM default_timezone), 'UTC') AS timezone,
        json_object('time_slots', e.time_slots, 'recurring_slots', e.recurring_slots) AS schedule_json,
        e.max_capacity AS default_capacity
      FROM experiences e
      JOIN products p ON p.id = e.id AND p.site_id = e.site_id
      JOIN business_locations l ON l.id = e.location_id AND l.site_id = e.site_id
      WHERE e.organization_id = ? AND e.site_id = ? AND e.location_id = ?
    )
    SELECT
      'owner' AS row_kind,
      owner_type, owner_id, location_id, label, timezone, schedule_json, default_capacity,
      NULL AS event_date, NULL AS time_slot, NULL AS status, NULL AS capacity_override,
      NULL AS note, NULL AS updated_at, NULL AS record_id, NULL AS party_size, NULL AS guest_label
    FROM selected_owners
    UNION ALL
    SELECT
      'override' AS row_kind,
      o.owner_type, o.owner_id, o.location_id, o.label, o.timezone, o.schedule_json, o.default_capacity,
      ao.override_date AS event_date, ao.time_slot, ao.status, ao.capacity_override,
      ao.note, ao.updated_at, ao.id AS record_id, NULL AS party_size, NULL AS guest_label
    FROM selected_owners o
    JOIN availability_overrides ao
      ON ao.site_id = ?
     AND ao.owner_type = o.owner_type
     AND ((o.owner_type = 'location' AND ao.location_id = o.owner_id)
       OR (o.owner_type = 'experience' AND ao.experience_id = o.owner_id))
    WHERE ao.override_date BETWEEN ? AND ?
    UNION ALL
    SELECT
      'booking' AS row_kind,
      o.owner_type, o.owner_id, o.location_id, o.label, o.timezone, o.schedule_json, o.default_capacity,
      b.booking_date AS event_date, b.time_slot, b.status, NULL AS capacity_override,
      NULL AS note, b.updated_at, b.id AS record_id, b.party_size, b.guest_name AS guest_label
    FROM selected_owners o
    JOIN experience_bookings b
      ON o.owner_type = 'experience' AND b.experience_id = o.owner_id AND b.site_id = ?
    WHERE b.booking_date BETWEEN ? AND ? AND b.status IN ('pending', 'confirmed')
    UNION ALL
    SELECT
      'booking' AS row_kind,
      o.owner_type, o.owner_id, o.location_id, o.label, o.timezone, o.schedule_json, o.default_capacity,
      r.date AS event_date, r.time AS time_slot, r.status, NULL AS capacity_override,
      NULL AS note, r.updated_at, r.id AS record_id,
      CASE WHEN r.guests = '8+' THEN 8 ELSE CAST(r.guests AS INTEGER) END AS party_size,
      r.name AS guest_label
    FROM selected_owners o
    JOIN reservation_submissions r
      ON o.owner_type = 'location' AND r.location_id = o.owner_id AND r.site_id = ?
    WHERE r.date BETWEEN ? AND ? AND r.status != 'cancelled'
    ORDER BY owner_type, owner_id, row_kind, event_date, time_slot, record_id
  `, [
    input.organizationId, input.siteId,
    input.organizationId, input.siteId, input.locationId,
    input.organizationId, input.siteId, input.locationId,
    input.siteId, input.range.from, input.range.to,
    input.siteId, input.range.from, input.range.to,
    input.siteId, input.range.from, input.range.to,
  ])
  const requestedOwnerKey = input.owner
    ? `${input.owner.kind}:${input.owner.kind === 'location' ? input.owner.locationId : input.owner.experienceId}`
    : null
  const ownerRows = rows.filter(row => {
    if (row.row_kind !== 'owner') return false
    return !requestedOwnerKey || `${row.owner_type}:${row.owner_id}` === requestedOwnerKey
  })
  const owners = ownerRows.map<AvailabilityCalendarOwner>((ownerRow) => {
    const ownerKey = `${ownerRow.owner_type}:${ownerRow.owner_id}`
    const eventRows = rows.filter(row =>
      row.row_kind !== 'owner' && `${row.owner_type}:${row.owner_id}` === ownerKey)
    const owner: AvailabilityOwner = ownerRow.owner_type === 'location'
      ? { kind: 'location', locationId: ownerRow.owner_id }
      : { kind: 'experience', experienceId: ownerRow.owner_id }
    const days = dates.map<AvailabilityCalendarDay>((date) => {
      const dayRows = eventRows.filter(row => row.event_date === date)
      const bookingRows = dayRows.filter(row => row.row_kind === 'booking' && row.time_slot && row.record_id)
      const overrideRows = dayRows.filter(row => row.row_kind === 'override' && row.time_slot && row.record_id)
      let scheduledSlots: string[]
      if (ownerRow.owner_type === 'location') {
        const openingHours = parsedJson<unknown>(ownerRow.schedule_json, null)
        scheduledSlots = isStructuredOpeningHours(openingHours)
          ? generateReservationTimes(openingHours, date)
          : []
      } else {
        const schedule = parsedJson<{ time_slots: string | null; recurring_slots: string | null }>(
          ownerRow.schedule_json,
          { time_slots: null, recurring_slots: null },
        )
        scheduledSlots = resolveExperienceScheduleSlots({
          time_slots: parsedJson<string[] | null>(schedule.time_slots, null),
          recurring_slots: parsedJson<Partial<Record<(typeof WEEKDAYS)[number], string[]>> | null>(schedule.recurring_slots, null),
        }, date)
      }
      const bookingSlots = bookingRows.map(row => row.time_slot!)
      const bookedBySlot = new Map<string, number>()
      for (const booking of bookingRows) {
        bookedBySlot.set(booking.time_slot!, (bookedBySlot.get(booking.time_slot!) ?? 0) + (booking.party_size ?? 0))
      }
      const publicSlots = materializeAvailabilitySlots({
        scheduledSlots: [...new Set([...scheduledSlots, ...bookingSlots, ...overrideRows.map(row => row.time_slot!)])],
        overrides: overrideRows.map(row => ({
          time_slot: row.time_slot!,
          status: row.status as 'open' | 'closed',
          capacity_override: row.capacity_override,
        })),
        bookedBySlot,
        defaultCapacity: ownerRow.default_capacity,
      })
      const overrideBySlot = new Map(overrideRows.map(row => [row.time_slot!, row]))
      return {
        date,
        slots: publicSlots.map(slot => {
          const override = overrideBySlot.get(slot.time_slot)
          return {
            ...slot,
            override: override ? {
              id: override.record_id!,
              status: override.status as 'open' | 'closed',
              capacity_override: override.capacity_override,
              note: override.note,
              updated_at: override.updated_at!,
            } : null,
          }
        }),
        bookings: bookingRows.map(row => ({
          id: row.record_id!,
          time_slot: row.time_slot!,
          party_size: row.party_size ?? 0,
          label: row.guest_label ?? 'Guest',
          status: row.status ?? 'unknown',
        })),
      }
    })
    return {
      owner,
      label: ownerRow.label ?? ownerRow.owner_id,
      location_id: ownerRow.location_id,
      timezone: ownerRow.timezone ?? 'UTC',
      days,
    }
  })
  if (input.owner && owners.length === 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Availability owner not found at this location' })
  }
  return { from: input.range.from, to: input.range.to, owners }
}

export async function setAvailability(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    owner: AvailabilityOwner
    changes: AvailabilityChange[]
    actorUserId: string
  },
): Promise<AvailabilityOverride[]> {
  if (input.changes.length === 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'At least one availability change is required' })
  }
  const seen = new Set<string>()
  for (const change of input.changes) {
    assertAvailabilityChange(change)
    const key = `${change.override_date}|${change.time_slot}`
    if (seen.has(key)) throw new HTTPError({ statusCode: 400, statusMessage: `Duplicate availability change for ${key}` })
    seen.add(key)
  }
  await resolveAvailabilityOwner(db, input.organizationId, input.siteId, input.owner)

  const now = new Date().toISOString()
  const setRows = input.changes.flatMap(change => change.directive === 'set' ? [{
    id: crypto.randomUUID(),
    override_date: change.override_date,
    time_slot: change.time_slot,
    status: change.status,
    capacity_override: change.capacity_override ?? null,
    note: change.note?.trim() || null,
  }] : [])
  const inheritRows = input.changes.flatMap(change => change.directive === 'inherit' ? [{
    override_date: change.override_date,
    time_slot: change.time_slot,
  }] : [])
  const owner = ownerPredicate(input.owner)
  const ownerColumns = input.owner.kind === 'location'
    ? { location: '?', experience: 'NULL', conflict: '(location_id, override_date, time_slot) WHERE owner_type = \'location\'' }
    : { location: 'NULL', experience: '?', conflict: '(experience_id, override_date, time_slot) WHERE owner_type = \'experience\'' }
  const writes: BatchQuery[] = []
  if (setRows.length > 0) {
    writes.push({
      query: `
        INSERT INTO availability_overrides (
          id, organization_id, site_id, owner_type, location_id, experience_id,
          override_date, time_slot, status, capacity_override, note, created_at, updated_at, created_by
        )
        SELECT
          json_extract(value, '$.id'), ?, ?, ?, ${ownerColumns.location}, ${ownerColumns.experience},
          json_extract(value, '$.override_date'), json_extract(value, '$.time_slot'),
          json_extract(value, '$.status'), json_extract(value, '$.capacity_override'),
          json_extract(value, '$.note'), ?, ?, ?
        FROM json_each(?) WHERE 1
        ON CONFLICT ${ownerColumns.conflict} DO UPDATE SET
          status = excluded.status,
          capacity_override = excluded.capacity_override,
          note = excluded.note,
          updated_at = excluded.updated_at
      `,
      params: [
        input.organizationId, input.siteId, input.owner.kind, owner.id,
        now, now, input.actorUserId, JSON.stringify(setRows),
      ],
    })
  }
  if (inheritRows.length > 0) {
    writes.push({
      query: `
        DELETE FROM availability_overrides
        WHERE site_id = ? AND ${owner.sql}
          AND EXISTS (
            SELECT 1 FROM json_each(?) change
            WHERE json_extract(change.value, '$.override_date') = availability_overrides.override_date
              AND json_extract(change.value, '$.time_slot') = availability_overrides.time_slot
          )
      `,
      params: [input.siteId, owner.id, JSON.stringify(inheritRows)],
    })
  }
  await executeBatch(db, writes, { operation: 'Set availability' })

  const dates = input.changes.map(change => change.override_date).sort()
  return await listAvailabilityOverrides(db, input.siteId, input.owner, {
    from: dates[0],
    to: dates.at(-1),
  })
}

export function materializeAvailabilitySlots(input: {
  scheduledSlots: string[]
  overrides: AvailabilityOverrideProjection[]
  bookedBySlot: ReadonlyMap<string, number>
  defaultCapacity: number | null
}): PublicAvailabilitySlot[] {
  const overrideBySlot = new Map(input.overrides.map(override => [override.time_slot, override]))
  const oneOffOpenSlots = input.overrides
    .filter(override => override.status === 'open' && !input.scheduledSlots.includes(override.time_slot))
    .map(override => override.time_slot)
  const effectiveSlots = [...new Set([...input.scheduledSlots, ...oneOffOpenSlots])].sort()
  return effectiveSlots.map((time_slot) => {
    const override = overrideBySlot.get(time_slot)
    const capacity = override?.capacity_override ?? input.defaultCapacity
    const booked = input.bookedBySlot.get(time_slot) ?? 0
    const remaining = capacity === null ? null : capacity - booked
    return {
      time_slot,
      capacity,
      booked,
      remaining,
      is_closed: override?.status === 'closed',
      is_full: remaining !== null && remaining <= 0,
    }
  })
}
