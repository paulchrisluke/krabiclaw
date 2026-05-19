export interface Experience {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  title: string
  slug: string
  tagline: string | null
  body: string | null
  image_asset_id: string | null
  image_url: string | null
  price: string | null
  duration_minutes: number | null
  max_capacity: number | null
  time_slots: string[] | null
  available_note: string | null
  status: 'active' | 'inactive' | 'sold_out'
  sort_order: number
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

interface ExperienceRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  title: string
  slug: string
  tagline: string | null
  body: string | null
  image_asset_id: string | null
  image_url: string | null
  price: string | null
  duration_minutes: number | null
  max_capacity: number | null
  time_slots: string | null
  available_note: string | null
  status: string
  sort_order: number
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
  return { ...row, status: row.status as Experience['status'], time_slots }
}

const SELECT = `
  SELECT e.id, e.organization_id, e.site_id, e.location_id,
         e.title, e.slug, e.tagline, e.body, e.image_asset_id,
         e.price, e.duration_minutes, e.max_capacity, e.time_slots,
         e.available_note, e.status, e.sort_order,
         e.seo_title, e.seo_description, e.created_at, e.updated_at,
         img.public_url AS image_url
  FROM experiences e
  LEFT JOIN media_assets img ON img.id = e.image_asset_id AND img.status = 'active'
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
  price?: string | null
  duration_minutes?: number | null
  max_capacity?: number | null
  time_slots?: string[] | null
  available_note?: string | null
  status?: 'active' | 'inactive' | 'sold_out'
  sort_order?: number
  location_id?: string | null
  seo_title?: string | null
  seo_description?: string | null
}

export async function createExperience(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: CreateExperienceInput,
  userId: string,
): Promise<Experience> {
  const id = crypto.randomUUID()
  const slug = await uniqueSlug(db, siteId, slugify(input.title))
  const now = new Date().toISOString()
  const slotsJson = input.time_slots?.length ? JSON.stringify(input.time_slots) : null

  const result = await db
    .prepare(
      `INSERT INTO experiences
       (id, organization_id, site_id, location_id, title, slug, tagline, body,
        image_asset_id, price, duration_minutes, max_capacity, time_slots,
        available_note, status, sort_order, seo_title, seo_description, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id, organizationId, siteId,
      input.location_id ?? null,
      input.title,
      slug,
      input.tagline ?? null,
      input.body ?? null,
      input.image_asset_id ?? null,
      input.price ?? null,
      input.duration_minutes ?? null,
      input.max_capacity ?? null,
      slotsJson,
      input.available_note ?? null,
      input.status ?? 'active',
      input.sort_order ?? 0,
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
  if (input.price !== undefined) { sets.push('price = ?'); params.push(input.price ?? null) }
  if (input.duration_minutes !== undefined) { sets.push('duration_minutes = ?'); params.push(input.duration_minutes ?? null) }
  if (input.max_capacity !== undefined) { sets.push('max_capacity = ?'); params.push(input.max_capacity ?? null) }
  if (input.time_slots !== undefined) {
    sets.push('time_slots = ?')
    params.push(input.time_slots?.length ? JSON.stringify(input.time_slots) : null)
  }
  if (input.available_note !== undefined) { sets.push('available_note = ?'); params.push(input.available_note ?? null) }
  if (input.status !== undefined) { sets.push('status = ?'); params.push(input.status) }
  if (input.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(input.sort_order) }
  if (input.location_id !== undefined) { sets.push('location_id = ?'); params.push(input.location_id ?? null) }
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
