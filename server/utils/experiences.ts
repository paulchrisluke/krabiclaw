import { resolveLocationTimezone } from '~/server/utils/site-config'

export const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const
export type WeekdayName = (typeof WEEKDAY_NAMES)[number]
export type RecurringSlots = Partial<Record<WeekdayName, string[]>>

const TIME_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_TOTAL_SLOTS = 100

export interface Experience {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  title: string
  slug: string
  tagline: string | null
  body: string | null
  image_asset_id: string | null
  image_url: string | null
  video_asset_id: string | null
  video_url: string | null
  images: Array<{ url: string; kind: 'image' | 'video' }>
  price: string | null
  price_amount: number | null
  duration_minutes: number | null
  max_capacity: number | null
  time_slots: string[] | null
  recurring_slots: RecurringSlots | null
  available_note: string | null
  status: 'active' | 'inactive' | 'sold_out'
  sort_order: number
  featured: boolean
  featured_sort_order: number
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

export const EXPERIENCE_STATUSES = ['active', 'inactive', 'sold_out'] as const
export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number]

interface ExperienceRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  title: string
  slug: string
  tagline: string | null
  body: string | null
  image_asset_id: string | null
  image_url: string | null
  video_asset_id: string | null
  video_url: string | null
  images: string | null
  price: string | null
  price_amount: number | null
  duration_minutes: number | null
  max_capacity: number | null
  time_slots: string | null
  recurring_slots: string | null
  available_note: string | null
  status: string
  sort_order: number
  featured: number
  featured_sort_order: number
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

function parseRow(row: ExperienceRow): Experience {
  let time_slots: string[] | null = null
  if (row.time_slots) {
    try { time_slots = JSON.parse(row.time_slots) } catch { time_slots = null }
  }
  let recurring_slots: RecurringSlots | null = null
  if (row.recurring_slots) {
    try { recurring_slots = JSON.parse(row.recurring_slots) } catch { recurring_slots = null }
  }
  let images: Array<{ url: string; kind: 'image' | 'video' }> = []
  if (row.images) {
    try { 
      const parsed = JSON.parse(row.images) 
      if (Array.isArray(parsed)) {
        images = parsed.filter(item => typeof item === 'object' && item !== null && typeof item.url === 'string' && (item.kind === 'image' || item.kind === 'video'))
      }
    } catch { images = [] }
  }
  // NOTE: Ensure the same validation/normalization is applied in the create/update handlers that write Experience.images so malformed shapes are rejected at source.
  return {
    ...row,
    status: row.status as Experience['status'],
    time_slots,
    recurring_slots,
    images,
    featured: Boolean(row.featured)
  }
}

const SELECT = `
  SELECT e.id, e.organization_id, e.site_id, e.location_id,
         e.title, e.slug, e.tagline, e.body, e.image_asset_id,
         e.video_asset_id, e.images,
         e.price, e.price_amount, e.duration_minutes, e.max_capacity, e.time_slots, e.recurring_slots,
         e.available_note, e.status, e.sort_order,
         e.featured, e.featured_sort_order,
         e.seo_title, e.seo_description, e.created_at, e.updated_at,
         img.public_url AS image_url,
         vid.public_url AS video_url
  FROM experiences e
  LEFT JOIN media_assets img ON img.id = e.image_asset_id AND img.status = 'active'
  LEFT JOIN media_assets vid ON vid.id = e.video_asset_id AND vid.status = 'active'
`

export async function listExperiences(
  db: D1Database,
  siteId: string,
  opts: { activeOnly?: boolean; locationId?: string } = {},
): Promise<Experience[]> {
  let sql = SELECT + ` WHERE e.site_id = ?`
  const params: (string | number)[] = [siteId]

  if (opts.activeOnly) {
    sql += ` AND e.status = 'active'`
  }
  if (opts.locationId) {
    sql += ` AND e.location_id = ?`
    params.push(opts.locationId)
  }
  sql += ` ORDER BY e.sort_order ASC, e.created_at ASC`

  const { results } = await db.prepare(sql).bind(...params).all<ExperienceRow>()
  return (results ?? []).map(parseRow)
}

export async function getExperienceBySlug(
  db: D1Database,
  siteId: string,
  slug: string,
): Promise<Experience | null> {
  const row = await db
    .prepare(SELECT + ` WHERE e.site_id = ? AND e.slug = ? LIMIT 1`)
    .bind(siteId, slug)
    .first<ExperienceRow>()
  return row ? parseRow(row) : null
}

export async function getExperienceById(
  db: D1Database,
  siteId: string,
  id: string,
): Promise<Experience | null> {
  const row = await db
    .prepare(SELECT + ` WHERE e.site_id = ? AND e.id = ? LIMIT 1`)
    .bind(siteId, id)
    .first<ExperienceRow>()
  return row ? parseRow(row) : null
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || `experience-${Date.now()}`
}

async function uniqueSlug(db: D1Database, siteId: string, base: string, excludeId?: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const existing = await db
      .prepare(`SELECT id FROM experiences WHERE site_id = ? AND slug = ? LIMIT 1`)
      .bind(siteId, candidate)
      .first<{ id: string }>()
    if (!existing || existing.id === excludeId) return candidate
  }
  return `${base}-${Date.now()}`
}

export interface CreateExperienceInput {
  title: string
  tagline?: string | null
  body?: string | null
  image_asset_id?: string | null
  video_asset_id?: string | null
  images?: Array<{ url: string; kind: 'image' | 'video' }>
  price?: string | null
  price_amount?: number | null
  duration_minutes?: number | null
  max_capacity?: number | null
  time_slots?: string[] | null
  recurring_slots?: RecurringSlots | null
  available_note?: string | null
  status?: ExperienceStatus
  sort_order?: number
  featured?: boolean
  featured_sort_order?: number
  location_id: string
  seo_title?: string | null
  seo_description?: string | null
}

function assertExperienceStatus(value: unknown, fieldName: string): ExperienceStatus {
  if (typeof value !== 'string' || !EXPERIENCE_STATUSES.includes(value as ExperienceStatus)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} must be one of: ${EXPERIENCE_STATUSES.join(', ')}`,
    })
  }
  return value as ExperienceStatus
}

function assertFiniteNonNegative(value: number | null | undefined, field: string): void {
  if (value == null) return
  if (!Number.isFinite(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a finite non-negative number` })
  }
}

function assertRecurringSlots(value: RecurringSlots | null | undefined): RecurringSlots | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'recurring_slots must be an object keyed by weekday name' })
  }
  let total = 0
  for (const key of Object.keys(value)) {
    if (!WEEKDAY_NAMES.includes(key as WeekdayName)) {
      throw createError({ statusCode: 400, statusMessage: `recurring_slots key "${key}" must be one of: ${WEEKDAY_NAMES.join(', ')}` })
    }
    const slots = (value as Record<string, unknown>)[key]
    if (!Array.isArray(slots)) {
      throw createError({ statusCode: 400, statusMessage: `recurring_slots.${key} must be an array of "HH:MM" strings` })
    }
    for (const slot of slots) {
      if (typeof slot !== 'string' || !TIME_SLOT_PATTERN.test(slot)) {
        throw createError({ statusCode: 400, statusMessage: `recurring_slots.${key} contains an invalid time slot: ${String(slot)}` })
      }
    }
    total += slots.length
  }
  if (total > MAX_TOTAL_SLOTS) {
    throw createError({ statusCode: 400, statusMessage: `recurring_slots may not exceed ${MAX_TOTAL_SLOTS} total time slots` })
  }
  return value
}

/**
 * Returns the time slots that apply on a given calendar date.
 * If `recurring_slots` is set it is the sole source of truth (missing weekday = no slots that day);
 * otherwise falls back to the legacy flat `time_slots` list, applying every day — unchanged behavior
 * for experiences created before recurring patterns existed.
 */
export function resolveEffectiveTimeSlots(experience: Experience, dateStr: string): string[] {
  if (experience.recurring_slots) {
    // new Date('YYYY-MM-DD') parses as UTC midnight; using UTC day index keeps this a pure
    // calendar-date lookup independent of wall-clock time or the experience's timezone.
    const weekdayIndex = new Date(`${dateStr}T00:00:00Z`).getUTCDay()
    const weekday = WEEKDAY_NAMES[(weekdayIndex + 6) % 7]!
    return experience.recurring_slots[weekday] ?? []
  }
  return experience.time_slots ?? []
}

/**
 * Generates a list of "HH:MM" slots from start to end (inclusive) at a fixed interval.
 * Pure helper used by CMS/MCP auto-generation — not a persisted shape on its own.
 */
export function generateSlots(startTime: string, endTime: string, intervalMinutes: number): string[] {
  if (!TIME_SLOT_PATTERN.test(startTime) || !TIME_SLOT_PATTERN.test(endTime)) {
    throw createError({ statusCode: 400, statusMessage: 'start and end times must be in "HH:MM" format' })
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 240) {
    throw createError({ statusCode: 400, statusMessage: 'interval_minutes must be an integer between 5 and 240' })
  }
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number) as [number, number]
    return h * 60 + m
  }
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  if (end < start) {
    throw createError({ statusCode: 400, statusMessage: 'end time must not be before start time' })
  }
  const slots: string[] = []
  for (let t = start; t <= end; t += intervalMinutes) {
    const h = Math.floor(t / 60).toString().padStart(2, '0')
    const m = (t % 60).toString().padStart(2, '0')
    slots.push(`${h}:${m}`)
    if (slots.length > MAX_TOTAL_SLOTS) {
      throw createError({ statusCode: 400, statusMessage: `interval is too small — generated more than ${MAX_TOTAL_SLOTS} slots` })
    }
  }
  return slots
}

/**
 * Resolves the IANA timezone an experience's slots/dates should be interpreted in:
 * the pinned location's timezone, else the site's default_timezone, else UTC.
 */
export async function resolveExperienceTimezone(
  db: D1Database,
  organizationId: string,
  siteId: string,
  experience: Experience,
): Promise<string> {
  return resolveLocationTimezone(db, organizationId, siteId, experience.location_id)
}

export async function createExperience(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: CreateExperienceInput,
  userId: string,
): Promise<Experience> {
  if (!input.location_id) {
    throw createError({ statusCode: 400, statusMessage: 'location_id is required' })
  }
  assertFiniteNonNegative(input.price_amount, 'price_amount')
  assertFiniteNonNegative(input.duration_minutes, 'duration_minutes')
  const id = crypto.randomUUID()
  const slug = await uniqueSlug(db, siteId, slugify(input.title))
  const now = new Date().toISOString()
  const slotsJson = input.time_slots?.length ? JSON.stringify(input.time_slots) : null
  const validRecurringSlots = assertRecurringSlots(input.recurring_slots)
  const recurringSlotsJson = validRecurringSlots ? JSON.stringify(validRecurringSlots) : null
  const imagesJson = input.images?.length ? JSON.stringify(input.images) : null
  const status = input.status !== undefined ? assertExperienceStatus(input.status, 'status') : 'active'

  const result = await db
    .prepare(
      `INSERT INTO experiences
       (id, organization_id, site_id, location_id, title, slug, tagline, body,
        image_asset_id, video_asset_id, images, price, price_amount, duration_minutes, max_capacity, time_slots, recurring_slots,
        available_note, status, sort_order, featured, featured_sort_order,
        seo_title, seo_description, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id, organizationId, siteId,
      input.location_id,
      input.title,
      slug,
      input.tagline ?? null,
      input.body ?? null,
      input.image_asset_id ?? null,
      input.video_asset_id ?? null,
      imagesJson,
      input.price ?? null,
      input.price_amount ?? null,
      input.duration_minutes ?? null,
      input.max_capacity ?? null,
      slotsJson,
      recurringSlotsJson,
      input.available_note ?? null,
      status,
      input.sort_order ?? 0,
      input.featured ? 1 : 0,
      input.featured_sort_order ?? 0,
      input.seo_title ?? null,
      input.seo_description ?? null,
      now, now, userId,
    )
    .run()

  if (!result || !result.success) {
    throw new Error('Failed to create experience in the database.')
  }

  const created = await getExperienceById(db, siteId, id)
  if (!created) {
    throw new Error(`Failed to retrieve newly created experience with ID: ${id}`)
  }
  return created
}

export type UpdateExperienceInput = Partial<CreateExperienceInput> & { slug?: string }

export async function updateExperience(
  db: D1Database,
  siteId: string,
  id: string,
  input: UpdateExperienceInput,
): Promise<Experience | null> {
  assertFiniteNonNegative(input.price_amount, 'price_amount')
  assertFiniteNonNegative(input.duration_minutes, 'duration_minutes')
  const sets: string[] = []
  const params: (string | number | null)[] = []

  if (input.title !== undefined) {
    sets.push('title = ?')
    params.push(input.title)
    if (!input.slug) {
      const newSlug = await uniqueSlug(db, siteId, slugify(input.title), id)
      sets.push('slug = ?')
      params.push(newSlug)
    }
  }
  if (input.slug !== undefined) { sets.push('slug = ?'); params.push(input.slug) }
  if (input.tagline !== undefined) { sets.push('tagline = ?'); params.push(input.tagline ?? null) }
  if (input.body !== undefined) { sets.push('body = ?'); params.push(input.body ?? null) }
  if (input.image_asset_id !== undefined) { sets.push('image_asset_id = ?'); params.push(input.image_asset_id ?? null) }
  if (input.video_asset_id !== undefined) { sets.push('video_asset_id = ?'); params.push(input.video_asset_id ?? null) }
  if (input.images !== undefined) {
    sets.push('images = ?')
    params.push(input.images?.length ? JSON.stringify(input.images) : null)
  }
  if (input.price !== undefined) { sets.push('price = ?'); params.push(input.price ?? null) }
  if (input.price_amount !== undefined) { sets.push('price_amount = ?'); params.push(input.price_amount ?? null) }
  if (input.duration_minutes !== undefined) { sets.push('duration_minutes = ?'); params.push(input.duration_minutes ?? null) }
  if (input.max_capacity !== undefined) { sets.push('max_capacity = ?'); params.push(input.max_capacity ?? null) }
  if (input.time_slots !== undefined) {
    sets.push('time_slots = ?')
    params.push(input.time_slots?.length ? JSON.stringify(input.time_slots) : null)
  }
  if (input.recurring_slots !== undefined) {
    const validRecurringSlots = assertRecurringSlots(input.recurring_slots)
    sets.push('recurring_slots = ?')
    params.push(validRecurringSlots ? JSON.stringify(validRecurringSlots) : null)
  }
  if (input.available_note !== undefined) { sets.push('available_note = ?'); params.push(input.available_note ?? null) }
  if (input.status !== undefined) {
    sets.push('status = ?')
    params.push(assertExperienceStatus(input.status, 'status'))
  }
  if (input.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(input.sort_order) }
  if (input.featured !== undefined) { sets.push('featured = ?'); params.push(input.featured ? 1 : 0) }
  if (input.featured_sort_order !== undefined) { sets.push('featured_sort_order = ?'); params.push(input.featured_sort_order) }
  if (input.location_id !== undefined) {
    if (!input.location_id) {
      throw createError({ statusCode: 400, statusMessage: 'location_id cannot be cleared' })
    }
    sets.push('location_id = ?')
    params.push(input.location_id)
  }
  if (input.seo_title !== undefined) { sets.push('seo_title = ?'); params.push(input.seo_title ?? null) }
  if (input.seo_description !== undefined) { sets.push('seo_description = ?'); params.push(input.seo_description ?? null) }

  if (sets.length === 0) return getExperienceById(db, siteId, id)

  sets.push('updated_at = ?')
  params.push(new Date().toISOString())
  params.push(siteId, id)

  await db
    .prepare(`UPDATE experiences SET ${sets.join(', ')} WHERE site_id = ? AND id = ?`)
    .bind(...params)
    .run()

  return getExperienceById(db, siteId, id)
}

export async function deleteExperience(
  db: D1Database,
  siteId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM experiences WHERE site_id = ? AND id = ?`)
    .bind(siteId, id)
    .run()
  return Boolean(result.meta.changes)
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export interface ExperienceBooking {
  id: string
  experience_id: string
  organization_id: string
  site_id: string
  guest_name: string
  guest_email: string
  guest_phone: string | null
  party_size: number
  booking_date: string
  time_slot: string
  status: 'pending' | 'confirmed' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
}

export async function createExperienceBooking(
  db: D1Database,
  input: Omit<ExperienceBooking, 'id' | 'created_at' | 'updated_at'> & { ip_hash?: string },
): Promise<ExperienceBooking> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `INSERT INTO experience_bookings
       (id, experience_id, organization_id, site_id, guest_name, guest_email, guest_phone,
        party_size, booking_date, time_slot, status, notes, ip_hash, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id, input.experience_id, input.organization_id, input.site_id,
      input.guest_name, input.guest_email, input.guest_phone ?? null,
      input.party_size, input.booking_date, input.time_slot,
      input.status ?? 'pending', input.notes ?? null, input.ip_hash ?? null,
      now, now,
    )
    .run()

  if (!result || !result.success) {
    throw new Error('Failed to insert experience booking into the database.')
  }

  return { ...input, id, status: (input.status ?? 'pending') as ExperienceBooking['status'], created_at: now, updated_at: now }
}

export async function listExperienceBookings(
  db: D1Database,
  siteId: string,
  experienceId: string,
): Promise<ExperienceBooking[]> {
  const { results } = await db
    .prepare(
      `SELECT id, experience_id, organization_id, site_id, guest_name, guest_email,
              guest_phone, party_size, booking_date, time_slot, status, notes, created_at, updated_at
       FROM experience_bookings
       WHERE site_id = ? AND experience_id = ?
       ORDER BY booking_date ASC, time_slot ASC, created_at ASC`,
    )
    .bind(siteId, experienceId)
    .all<ExperienceBooking>()
  return results ?? []
}

export async function updateBookingStatus(
  db: D1Database,
  siteId: string,
  experienceId: string,
  bookingId: string,
  status: 'pending' | 'confirmed' | 'cancelled',
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE experience_bookings SET status = ?, updated_at = ?
       WHERE site_id = ? AND experience_id = ? AND id = ?`,
    )
    .bind(status, new Date().toISOString(), siteId, experienceId, bookingId)
    .run()
  return Boolean(result.meta.changes)
}

// ── Slot overrides & availability ───────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface SlotOverride {
  id: string
  experience_id: string
  organization_id: string
  site_id: string
  override_date: string
  time_slot: string
  status: 'closed' | 'open'
  capacity_override: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface SlotAvailability {
  time_slot: string
  capacity: number | null
  booked: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
}

function assertDateStr(value: string, field: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be in "YYYY-MM-DD" format` })
  }
  // Parse and validate the actual date values
  const parts = value.split('-')
  const yearStr = parts[0]!
  const monthStr = parts[1]!
  const dayStr = parts[2]!
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)

  if (month < 1 || month > 12) {
    throw createError({ statusCode: 400, statusMessage: `${field} has invalid month: must be between 1 and 12` })
  }

  // Check if the day is valid for the given month and year
  const daysInMonth = new Date(year, month, 0).getDate()
  if (day < 1 || day > daysInMonth) {
    throw createError({ statusCode: 400, statusMessage: `${field} has invalid day: must be between 1 and ${daysInMonth} for the given month and year` })
  }

  // Verify the date is actually valid by constructing it and checking if components match
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw createError({ statusCode: 400, statusMessage: `${field} is not a valid date` })
  }
}

export async function listSlotOverrides(
  db: D1Database,
  siteId: string,
  experienceId: string,
  opts: { fromDate?: string; toDate?: string } = {},
): Promise<SlotOverride[]> {
  let sql = `SELECT id, experience_id, organization_id, site_id, override_date, time_slot,
                    status, capacity_override, note, created_at, updated_at
             FROM experience_slot_overrides
             WHERE site_id = ? AND experience_id = ?`
  const params: (string)[] = [siteId, experienceId]
  if (opts.fromDate) {
    assertDateStr(opts.fromDate, 'from')
    sql += ` AND override_date >= ?`
    params.push(opts.fromDate)
  }
  if (opts.toDate) {
    assertDateStr(opts.toDate, 'to')
    sql += ` AND override_date <= ?`
    params.push(opts.toDate)
  }
  sql += ` ORDER BY override_date ASC, time_slot ASC`
  const { results } = await db.prepare(sql).bind(...params).all<SlotOverride>()
  return results ?? []
}

export async function upsertSlotOverride(
  db: D1Database,
  organizationId: string,
  siteId: string,
  experienceId: string,
  input: {
    override_date: string
    time_slot: string
    status: 'closed' | 'open'
    capacity_override?: number | null
    note?: string | null
  },
  userId: string,
): Promise<SlotOverride> {
  assertDateStr(input.override_date, 'override_date')
  if (!TIME_SLOT_PATTERN.test(input.time_slot)) {
    throw createError({ statusCode: 400, statusMessage: 'time_slot must be in "HH:MM" format' })
  }
  if (input.status !== 'closed' && input.status !== 'open') {
    throw createError({ statusCode: 400, statusMessage: 'status must be "closed" or "open"' })
  }
  assertFiniteNonNegative(input.capacity_override, 'capacity_override')

  // Verify that the experience belongs to the provided site
  const experience = await db
    .prepare(`SELECT id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`)
    .bind(experienceId, siteId)
    .first<{ id: string }>()
  if (!experience) {
    throw createError({ statusCode: 404, statusMessage: 'Experience not found or does not belong to this site' })
  }

  const now = new Date().toISOString()
  const existing = await db
    .prepare(`SELECT id FROM experience_slot_overrides WHERE experience_id = ? AND override_date = ? AND time_slot = ? LIMIT 1`)
    .bind(experienceId, input.override_date, input.time_slot)
    .first<{ id: string }>()

  const id = existing?.id ?? crypto.randomUUID()

  await db
    .prepare(
      `INSERT INTO experience_slot_overrides
       (id, experience_id, organization_id, site_id, override_date, time_slot, status, capacity_override, note, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(experience_id, override_date, time_slot) DO UPDATE SET
         status = excluded.status,
         capacity_override = excluded.capacity_override,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id, experienceId, organizationId, siteId,
      input.override_date, input.time_slot, input.status,
      input.capacity_override ?? null, input.note ?? null,
      now, now, userId,
    )
    .run()

  const row = await db
    .prepare(
      `SELECT id, experience_id, organization_id, site_id, override_date, time_slot,
              status, capacity_override, note, created_at, updated_at
       FROM experience_slot_overrides
       WHERE experience_id = ? AND override_date = ? AND time_slot = ?`,
    )
    .bind(experienceId, input.override_date, input.time_slot)
    .first<SlotOverride>()
  if (!row) throw new Error('Failed to read back slot override after upsert.')
  return row
}

export async function deleteSlotOverride(
  db: D1Database,
  siteId: string,
  experienceId: string,
  overrideId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM experience_slot_overrides WHERE site_id = ? AND experience_id = ? AND id = ?`)
    .bind(siteId, experienceId, overrideId)
    .run()
  return Boolean(result.meta.changes)
}

/**
 * Computes remaining capacity per effective time slot for an experience on a given date,
 * merging booked totals (from experience_bookings) with any manual slot override.
 * This is the single function every surface (public booking, editor CMS, MCP) must call —
 * no capacity logic should be duplicated elsewhere.
 */
export async function getSlotAvailability(
  db: D1Database,
  siteId: string,
  experience: Experience,
  dateStr: string,
): Promise<SlotAvailability[]> {
  assertDateStr(dateStr, 'date')
  const effectiveSlots = resolveEffectiveTimeSlots(experience, dateStr)
  if (effectiveSlots.length === 0) return []

  const { results: bookingRows } = await db
    .prepare(
      `SELECT time_slot, SUM(party_size) AS booked
       FROM experience_bookings
       WHERE site_id = ? AND experience_id = ? AND booking_date = ? AND status IN ('pending', 'confirmed')
       GROUP BY time_slot`,
    )
    .bind(siteId, experience.id, dateStr)
    .all<{ time_slot: string; booked: number }>()
  const bookedMap = Object.fromEntries((bookingRows ?? []).map((r) => [r.time_slot, r.booked]))

  const { results: overrideRows } = await db
    .prepare(
      `SELECT time_slot, status, capacity_override
       FROM experience_slot_overrides
       WHERE site_id = ? AND experience_id = ? AND override_date = ?`,
    )
    .bind(siteId, experience.id, dateStr)
    .all<{ time_slot: string; status: 'closed' | 'open'; capacity_override: number | null }>()
  const overrideMap = Object.fromEntries((overrideRows ?? []).map((r) => [r.time_slot, r]))

  return effectiveSlots.map((slot) => {
    const override = overrideMap[slot]
    const capacity = override?.capacity_override ?? experience.max_capacity ?? null
    const booked = bookedMap[slot] ?? 0
    const remaining = capacity == null ? null : capacity - booked
    const is_closed = override?.status === 'closed'
    const is_full = remaining !== null && remaining <= 0
    return { time_slot: slot, capacity, booked, remaining, is_closed, is_full }
  })
}
