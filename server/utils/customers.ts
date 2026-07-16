import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { hashIdentifier } from '~/server/utils/hourly-rate-limit'
import { parsePhone, PHONE_METADATA_VERSION } from '~/utils/phone'

export type CustomerSource =
  | 'reservation'
  | 'experience_booking'
  | 'review_request'
  | 'manual'
  | 'stripe'
  | 'import'

export interface FindOrCreateCustomerInput {
  organizationId: string
  siteId: string
  name?: string | null
  email?: string | null
  phone?: string | null
  source: CustomerSource
  bookingAt?: string | null
  userId?: string | null
}

export interface CustomerRow {
  id: string
  organization_id: string
  site_id: string
  user_id: string | null
  stripe_customer_id: string | null
  name: string | null
  email: string | null
  email_normalized: string | null
  email_hash: string | null
  phone: string | null
  phone_normalized: string | null
  phone_metadata_version: string | null
  source: CustomerSource
  status: 'active' | 'merged' | 'suppressed' | 'deleted'
  created?: boolean
}

const CUSTOMER_SELECT = `
  SELECT id, organization_id, site_id, user_id, stripe_customer_id, name, email,
         email_normalized, email_hash, phone, phone_normalized, phone_metadata_version, source, status
  FROM customers
`

export function normalizeCustomerEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

export function normalizeCustomerPhone(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim()
  if (!trimmed) return null
  const parsed = parsePhone(trimmed, { defaultCountry: 'TH' })
  return parsed.valid && parsed.e164 ? parsed.e164 : trimmed
}

/** Metadata version to stamp alongside `normalizeCustomerPhone`'s output — null when the
 * input didn't parse to a valid E.164 number (raw value was kept as a fallback instead). */
export function customerPhoneMetadataVersion(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim()
  if (!trimmed) return null
  return parsePhone(trimmed, { defaultCountry: 'TH' }).valid ? PHONE_METADATA_VERSION : null
}

function isUniqueCustomerConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /unique constraint failed/i.test(message) && message.includes('customers.')
}

async function findExistingCustomer(
  db: DbClient,
  siteId: string,
  emailNormalized: string | null,
  phoneNormalized: string | null,
): Promise<CustomerRow | null> {
  if (emailNormalized) {
    return await queryFirst<CustomerRow>(db, `
      ${CUSTOMER_SELECT}
      WHERE site_id = ? AND email_normalized = ? AND status = 'active'
      LIMIT 1
    `, [siteId, emailNormalized])
  }

  if (phoneNormalized) {
    return await queryFirst<CustomerRow>(db, `
      ${CUSTOMER_SELECT}
      WHERE site_id = ? AND phone_normalized = ? AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `, [siteId, phoneNormalized])
  }

  return null
}

async function hasCustomerEmailConflict(
  db: DbClient,
  siteId: string,
  emailNormalized: string | null,
  customerId: string,
): Promise<boolean> {
  if (!emailNormalized) return false

  const existing = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM customers
    WHERE site_id = ?
      AND email_normalized = ?
      AND id != ?
    LIMIT 1
  `, [siteId, emailNormalized, customerId])

  return Boolean(existing)
}

export async function findOrCreateCustomer(
  db: DbClient,
  input: FindOrCreateCustomerInput,
): Promise<CustomerRow> {
  const email = input.email?.trim() || null
  const emailNormalized = normalizeCustomerEmail(email)
  const phone = input.phone?.trim() || null
  const phoneNormalized = normalizeCustomerPhone(phone)
  const phoneMetadataVersion = customerPhoneMetadataVersion(phone)
  const emailHash = emailNormalized ? await hashIdentifier(emailNormalized) : null
  const name = input.name?.trim() || null
  const bookingAt = input.bookingAt ?? new Date().toISOString()

  const existing = await findExistingCustomer(db, input.siteId, emailNormalized, phoneNormalized)
  if (existing) {
    return {
      ...existing,
      created: false,
    }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await execute(db, `
      INSERT INTO customers (
        id, organization_id, site_id, user_id, name, email, email_normalized, email_hash,
        phone, phone_normalized, phone_metadata_version, source, status, last_booking_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `, [
      id,
      input.organizationId,
      input.siteId,
      input.userId ?? null,
      name,
      email,
      emailNormalized,
      emailHash,
      phone,
      phoneNormalized,
      phoneMetadataVersion,
      input.source,
      bookingAt,
      now,
      now,
    ])
  } catch (error) {
    if (!isUniqueCustomerConflict(error)) throw error
    const racedCustomer = await findExistingCustomer(db, input.siteId, emailNormalized, phoneNormalized)
    if (racedCustomer) return { ...racedCustomer, created: false }
    throw error
  }

  return {
    id,
    organization_id: input.organizationId,
    site_id: input.siteId,
    user_id: null,
    stripe_customer_id: null,
    name,
    email,
    email_normalized: emailNormalized,
    email_hash: emailHash,
    phone,
    phone_normalized: phoneNormalized,
    phone_metadata_version: phoneMetadataVersion,
    source: input.source,
    status: 'active',
    created: true,
  }
}

async function updateCustomerBooking(
  db: DbClient,
  customerId: string,
  input: FindOrCreateCustomerInput,
  includeEmail: boolean,
): Promise<void> {
  const email = input.email?.trim() || null
  const emailNormalized = normalizeCustomerEmail(email)
  const phone = input.phone?.trim() || null
  const phoneNormalized = normalizeCustomerPhone(phone)
  const phoneMetadataVersion = customerPhoneMetadataVersion(phone)
  const emailHash = includeEmail && emailNormalized ? await hashIdentifier(emailNormalized) : null
  const name = input.name?.trim() || null
  const bookingAt = input.bookingAt ?? new Date().toISOString()

  if (includeEmail) {
    await execute(db, `
      UPDATE customers
      SET name = COALESCE(NULLIF(?, ''), name),
          email = COALESCE(NULLIF(?, ''), email),
          email_normalized = COALESCE(?, email_normalized),
          email_hash = COALESCE(?, email_hash),
          phone = COALESCE(NULLIF(?, ''), phone),
          phone_normalized = COALESCE(?, phone_normalized),
          phone_metadata_version = COALESCE(?, phone_metadata_version),
          source = CASE WHEN source = 'manual' THEN source ELSE ? END,
          last_booking_at = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      name,
      email,
      emailNormalized,
      emailHash,
      phone,
      phoneNormalized,
      phoneMetadataVersion,
      input.source,
      bookingAt,
      new Date().toISOString(),
      customerId,
    ])
    return
  }

  await execute(db, `
    UPDATE customers
    SET name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(NULLIF(?, ''), phone),
        phone_normalized = COALESCE(?, phone_normalized),
        phone_metadata_version = COALESCE(?, phone_metadata_version),
        source = CASE WHEN source = 'manual' THEN source ELSE ? END,
        last_booking_at = ?,
        updated_at = ?
    WHERE id = ?
  `, [
    name,
    phone,
    phoneNormalized,
    phoneMetadataVersion,
    input.source,
    bookingAt,
    new Date().toISOString(),
    customerId,
  ])
}

export async function recordCustomerBooking(
  db: DbClient,
  customerId: string,
  input: FindOrCreateCustomerInput,
): Promise<void> {
  const email = input.email?.trim() || null
  const emailNormalized = normalizeCustomerEmail(email)
  const includeEmail = !(await hasCustomerEmailConflict(db, input.siteId, emailNormalized, customerId))

  try {
    await updateCustomerBooking(db, customerId, input, includeEmail)
  } catch (error) {
    if (!includeEmail || !isUniqueCustomerConflict(error)) throw error
    await updateCustomerBooking(db, customerId, input, false)
  }
}

export async function deleteCustomerIfUnlinked(db: DbClient, customerId: string): Promise<void> {
  await execute(db, `
    DELETE FROM customers
    WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM reservation_submissions WHERE customer_id = customers.id)
      AND NOT EXISTS (SELECT 1 FROM experience_bookings WHERE customer_id = customers.id)
  `, [customerId])
}

// Called when a Better Auth anonymous session links to a real user account. Re-points each
// customer row the anonymous session accrued to the real user — unless that site already has a
// customer row for the real user, in which case the anonymous row is marked 'merged' instead of
// repointed, so a site never ends up with two active customer rows sharing the same user_id.
export async function linkAnonymousCustomerToUser(
  db: DbClient,
  anonymousUserId: string,
  realUserId: string,
): Promise<void> {
  const anonymousRows = await queryAll<{ id: string; site_id: string }>(db, `
    SELECT id, site_id FROM customers WHERE user_id = ? AND status != 'deleted'
  `, [anonymousUserId])
  if (!anonymousRows || anonymousRows.length === 0) return

  const now = new Date().toISOString()
  for (const row of anonymousRows) {
    const existingForRealUser = await queryFirst<{ id: string }>(db, `
      SELECT id
      FROM customers
      WHERE site_id = ?
        AND user_id = ?
        AND id != ?
        AND status = 'active'
      LIMIT 1
    `, [row.site_id, realUserId, row.id])

    if (existingForRealUser) {
      await execute(db, `
        UPDATE customers SET status = 'merged', updated_at = ? WHERE id = ?
      `, [now, row.id])
    } else {
      await execute(db, `
        UPDATE customers SET user_id = ?, updated_at = ? WHERE id = ?
      `, [realUserId, now, row.id])
    }
  }
}
