import { execute, queryFirst, type DbClient } from '~/server/db'
import { hashIdentifier } from '~/server/utils/hourly-rate-limit'
import { normalizePhone } from '~/server/utils/whatsapp'

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
  source: CustomerSource
  status: 'active' | 'merged' | 'suppressed' | 'deleted'
  created?: boolean
}

const CUSTOMER_SELECT = `
  SELECT id, organization_id, site_id, user_id, stripe_customer_id, name, email,
         email_normalized, email_hash, phone, phone_normalized, source, status
  FROM customers
`

export function normalizeCustomerEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

export function normalizeCustomerPhone(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim()
  if (!trimmed) return null
  try {
    return normalizePhone(trimmed)
  } catch {
    return trimmed
  }
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
      WHERE site_id = ? AND email_normalized = ? AND status != 'deleted'
      LIMIT 1
    `, [siteId, emailNormalized])
  }

  if (phoneNormalized) {
    return await queryFirst<CustomerRow>(db, `
      ${CUSTOMER_SELECT}
      WHERE site_id = ? AND phone_normalized = ? AND status != 'deleted'
      ORDER BY created_at ASC
      LIMIT 1
    `, [siteId, phoneNormalized])
  }

  return null
}

export async function findOrCreateCustomer(
  db: DbClient,
  input: FindOrCreateCustomerInput,
): Promise<CustomerRow> {
  const email = input.email?.trim() || null
  const emailNormalized = normalizeCustomerEmail(email)
  const phone = input.phone?.trim() || null
  const phoneNormalized = normalizeCustomerPhone(phone)
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
        id, organization_id, site_id, name, email, email_normalized, email_hash,
        phone, phone_normalized, source, status, last_booking_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `, [
      id,
      input.organizationId,
      input.siteId,
      name,
      email,
      emailNormalized,
      emailHash,
      phone,
      phoneNormalized,
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
    source: input.source,
    status: 'active',
    created: true,
  }
}

export async function recordCustomerBooking(
  db: DbClient,
  customerId: string,
  input: FindOrCreateCustomerInput,
): Promise<void> {
  const email = input.email?.trim() || null
  const emailNormalized = normalizeCustomerEmail(email)
  const phone = input.phone?.trim() || null
  const phoneNormalized = normalizeCustomerPhone(phone)
  const emailHash = emailNormalized ? await hashIdentifier(emailNormalized) : null
  const name = input.name?.trim() || null
  const bookingAt = input.bookingAt ?? new Date().toISOString()

  await execute(db, `
    UPDATE customers
    SET name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email),
        email_normalized = COALESCE(?, email_normalized),
        email_hash = COALESCE(?, email_hash),
        phone = COALESCE(NULLIF(?, ''), phone),
        phone_normalized = COALESCE(?, phone_normalized),
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
    input.source,
    bookingAt,
    new Date().toISOString(),
    customerId,
  ])
}

export async function deleteCustomerIfUnlinked(db: DbClient, customerId: string): Promise<void> {
  await execute(db, `
    DELETE FROM customers
    WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM reservation_submissions WHERE customer_id = customers.id)
      AND NOT EXISTS (SELECT 1 FROM experience_bookings WHERE customer_id = customers.id)
  `, [customerId])
}
