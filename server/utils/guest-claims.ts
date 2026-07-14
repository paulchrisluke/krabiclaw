// Guest/end-customer account linking: lets a signed-in Better Auth `user` claim
// existing tenant-scoped `customers` rows discovered by verified email match.
//
// See docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
//
// Guests never receive `organization`/`member` rows (see server/utils/auth.ts —
// databaseHooks.user.create.after stays a no-op for tenant purposes). Linking a
// `customers` row to a `user` always requires BOTH:
//   1. A verified session email (Better Auth already enforces mailbox ownership
//      via requireEmailVerification / trusted OAuth), and
//   2. A distinct, single-use claim-verification token emailed to that same
//      address and explicitly clicked — proven mailbox ownership at signup time
//      does not by itself authorize attaching someone's historical booking data.
//
// This is a different code path from linkAnonymousCustomerToUser in
// server/utils/customers.ts, which re-points customer rows accrued by the SAME
// anonymous session — continuity of one session's own data, not a stranger's.
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { normalizeCustomerEmail } from '~/server/utils/customers'

const CLAIM_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface ClaimableCustomer {
  customerId: string
  organizationId: string
  organizationName: string
  siteId: string
  siteName: string
  lastBookingAt: string | null
}

export interface LinkedCustomerSummary {
  customerId: string
  organizationId: string
  organizationName: string
  siteId: string
  siteName: string
  loyaltyPointsBalance: number
  lastBookingAt: string | null
  upcomingReservationCount: number
  upcomingExperienceBookingCount: number
}

export type ClaimRequestResult =
  | { ok: true, claimId: string, rawToken: string, customerId: string }
  | { ok: false, reason: 'not_found' | 'already_linked' | 'email_mismatch' }

export type ClaimVerifyResult =
  | { ok: true, customerId: string, userId: string }
  | { ok: false, reason: 'invalid_or_expired' | 'already_claimed_by_other' | 'token_user_mismatch' }

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Candidate customer rows a signed-in user could claim: unclaimed (user_id IS NULL),
// active, matching their verified email — masked to organization/site name only, no
// booking PII, so the pre-claim list never leaks another guest's contact details.
export async function findClaimableCustomersForEmail(
  db: DbClient,
  email: string,
): Promise<ClaimableCustomer[]> {
  const emailNormalized = normalizeCustomerEmail(email)
  if (!emailNormalized) return []

  const rows = await queryAll<{
    id: string
    organization_id: string
    organization_name: string
    site_id: string
    site_name: string | null
    last_booking_at: string | null
  }>(db, `
    SELECT c.id, c.organization_id, o.name AS organization_name,
           c.site_id, COALESCE(s.brand_name, s.slug) AS site_name,
           c.last_booking_at
    FROM customers c
    JOIN organization o ON o.id = c.organization_id
    JOIN sites s ON s.id = c.site_id
    WHERE c.email_normalized = ?
      AND c.user_id IS NULL
      AND c.status = 'active'
    ORDER BY c.last_booking_at DESC
  `, [emailNormalized])

  return (rows ?? []).map((row) => ({
    customerId: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    siteId: row.site_id,
    siteName: row.site_name ?? 'Site',
    lastBookingAt: row.last_booking_at,
  }))
}

// Step 1 of the explicit claim: the signed-in user selects one candidate customer
// row to claim. This only issues a token and records a pending claim — it never
// links the account by itself. Re-requesting a claim rotates the token.
export async function createClaimRequest(
  db: DbClient,
  input: { customerId: string, userId: string, userEmail: string },
): Promise<ClaimRequestResult> {
  const emailNormalized = normalizeCustomerEmail(input.userEmail)
  if (!emailNormalized) return { ok: false, reason: 'email_mismatch' }

  const customer = await queryFirst<{
    id: string
    organization_id: string
    site_id: string
    user_id: string | null
    email_normalized: string | null
    status: string
  }>(db, `
    SELECT id, organization_id, site_id, user_id, email_normalized, status
    FROM customers
    WHERE id = ?
    LIMIT 1
  `, [input.customerId])

  if (!customer || customer.status !== 'active') return { ok: false, reason: 'not_found' }
  if (customer.user_id) return { ok: false, reason: 'already_linked' }
  if (customer.email_normalized !== emailNormalized) return { ok: false, reason: 'email_mismatch' }

  const rawToken = generateRawToken()
  const tokenHash = await sha256Hex(rawToken)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CLAIM_TOKEN_TTL_MS)
  const claimId = crypto.randomUUID()

  const upserted = await queryFirst<{ id: string }>(db, `
    INSERT INTO customer_claims (
      id, customer_id, user_id, organization_id, site_id, email_at_claim,
      status, token_hash, token_expires_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    ON CONFLICT(customer_id, user_id) DO UPDATE SET
      status = 'pending', token_hash = excluded.token_hash,
      token_expires_at = excluded.token_expires_at,
      email_at_claim = excluded.email_at_claim, verified_at = NULL,
      updated_at = excluded.updated_at
    WHERE customer_claims.status <> 'verified'
    RETURNING id
  `, [
    claimId,
    input.customerId,
    input.userId,
    customer.organization_id,
    customer.site_id,
    input.userEmail,
    tokenHash,
    expiresAt.getTime(),
    now.toISOString(),
    now.toISOString(),
  ])

  if (!upserted) return { ok: false, reason: 'already_linked' }
  return { ok: true, claimId: upserted.id, rawToken, customerId: input.customerId }
}

// Step 2 of the explicit claim: the user clicks the emailed link. Only this call
// actually sets customers.user_id. D1 rejects raw BEGIN/COMMIT, so the two writes
// run sequentially with a compensating rollback of the first write in `catch`.
// `expectedUserId` must be the currently signed-in session's user id — checked
// BEFORE any write, so a leaked/forwarded link can never link a customer row to
// whichever account happens to click it, only to the account the claim was
// actually issued to.
export async function verifyClaimToken(
  db: DbClient,
  rawToken: string,
  expectedUserId: string,
): Promise<ClaimVerifyResult> {
  const tokenHash = await sha256Hex(rawToken)
  const now = new Date()

  const claim = await queryFirst<{
    id: string
    customer_id: string
    user_id: string
    token_hash: string | null
    token_expires_at: number | null
    status: string
  }>(db, `
    SELECT id, customer_id, user_id, token_hash, token_expires_at, status
    FROM customer_claims
    WHERE token_hash = ?
    LIMIT 1
  `, [tokenHash])

  if (!claim || claim.status !== 'pending') return { ok: false, reason: 'invalid_or_expired' }
  if (!claim.token_expires_at || claim.token_expires_at < now.getTime()) {
    await execute(db, `UPDATE customer_claims SET status = 'expired', updated_at = ? WHERE id = ?`, [now.toISOString(), claim.id])
    return { ok: false, reason: 'invalid_or_expired' }
  }
  if (claim.user_id !== expectedUserId) {
    return { ok: false, reason: 'token_user_mismatch' }
  }

  const customer = await queryFirst<{ user_id: string | null }>(db, `
    SELECT user_id FROM customers WHERE id = ? LIMIT 1
  `, [claim.customer_id])

  if (!customer) return { ok: false, reason: 'invalid_or_expired' }
  if (customer.user_id && customer.user_id !== claim.user_id) {
    await execute(db, `UPDATE customer_claims SET status = 'rejected', updated_at = ? WHERE id = ?`, [now.toISOString(), claim.id])
    return { ok: false, reason: 'already_claimed_by_other' }
  }

  // Conditional (compare-and-set) assignment: only claim the row if it is still
  // unclaimed at write time. Without the `AND user_id IS NULL` guard, two pending
  // claims for the same customer (from two different users) could both pass the
  // read-time null check above and race to overwrite each other's assignment.
  const assignment = await execute(db, `
    UPDATE customers SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL
  `, [claim.user_id, now.toISOString(), claim.customer_id])

  const assignedCustomer = Number(assignment.meta.changes ?? 0) > 0
  if (!assignedCustomer) {
    const winner = await queryFirst<{ user_id: string | null }>(db, `SELECT user_id FROM customers WHERE id = ? LIMIT 1`, [claim.customer_id])
    if (winner?.user_id !== claim.user_id) {
      await execute(db, `UPDATE customer_claims SET status = 'rejected', updated_at = ? WHERE id = ?`, [now.toISOString(), claim.id])
      return { ok: false, reason: 'already_claimed_by_other' }
    }
  }

  try {
    const verification = await execute(db, `
      UPDATE customer_claims
      SET status = 'verified', verified_at = ?, token_hash = NULL, token_expires_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'pending' AND token_hash = ?
    `, [now.getTime(), now.toISOString(), claim.id, claim.token_hash])
    if (!Number(verification.meta.changes ?? 0)) {
      if (assignedCustomer) {
        await execute(db, `UPDATE customers SET user_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?`, [now.toISOString(), claim.customer_id, claim.user_id])
      }
      return { ok: false, reason: 'invalid_or_expired' }
    }
  } catch (error) {
    // Compensate: roll back only the assignment we just made (guarded by user_id
    // matching, so we never clobber a different, later-successful assignment).
    if (assignedCustomer) {
      await execute(db, `UPDATE customers SET user_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?`, [now.toISOString(), claim.customer_id, claim.user_id]).catch(() => {})
    }
    throw error
  }

  return { ok: true, customerId: claim.customer_id, userId: claim.user_id }
}

// Aggregated booking-history surface: every customers row already linked
// (user_id = userId) across every tenant site, with upcoming-booking counts.
export async function listLinkedCustomersForUser(db: DbClient, userId: string): Promise<LinkedCustomerSummary[]> {
  const rows = await queryAll<{
    id: string
    organization_id: string
    organization_name: string
    site_id: string
    site_name: string | null
    loyalty_points_balance: number
    last_booking_at: string | null
  }>(db, `
    SELECT c.id, c.organization_id, o.name AS organization_name,
           c.site_id, COALESCE(s.brand_name, s.slug) AS site_name,
           c.loyalty_points_balance, c.last_booking_at
    FROM customers c
    JOIN organization o ON o.id = c.organization_id
    JOIN sites s ON s.id = c.site_id
    WHERE c.user_id = ? AND c.status = 'active'
    ORDER BY c.last_booking_at DESC
  `, [userId])

  if (!rows || rows.length === 0) return []

  const today = new Date().toISOString().slice(0, 10)
  const customerIds = rows.map((row) => row.id)
  const placeholders = customerIds.map(() => '?').join(', ')

  // Batched GROUP BY across all linked customers instead of two queries per
  // row — this list can span every tenant site a guest has ever booked at.
  const [reservationCounts, experienceCounts] = await Promise.all([
    queryAll<{ customer_id: string, count: number }>(db, `
      SELECT customer_id, COUNT(*) AS count FROM reservation_submissions
      WHERE customer_id IN (${placeholders}) AND date >= ? AND status != 'cancelled'
      GROUP BY customer_id
    `, [...customerIds, today]),
    queryAll<{ customer_id: string, count: number }>(db, `
      SELECT customer_id, COUNT(*) AS count FROM experience_bookings
      WHERE customer_id IN (${placeholders}) AND booking_date >= ? AND status != 'cancelled'
      GROUP BY customer_id
    `, [...customerIds, today]),
  ])

  const reservationCountByCustomer = new Map((reservationCounts ?? []).map((row) => [row.customer_id, row.count]))
  const experienceCountByCustomer = new Map((experienceCounts ?? []).map((row) => [row.customer_id, row.count]))

  return rows.map((row) => ({
    customerId: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    siteId: row.site_id,
    siteName: row.site_name ?? 'Site',
    loyaltyPointsBalance: row.loyalty_points_balance,
    lastBookingAt: row.last_booking_at,
    upcomingReservationCount: reservationCountByCustomer.get(row.id) ?? 0,
    upcomingExperienceBookingCount: experienceCountByCustomer.get(row.id) ?? 0,
  }))
}

// Display name for the site a candidate customer row belongs to — used to name
// the site in the claim-verification email. Kept alongside the other
// customer-row queries here rather than inline in the API route.
export async function getClaimSiteDisplayName(db: DbClient, customerId: string): Promise<string> {
  const site = await queryFirst<{ brand_name: string | null, slug: string }>(db, `
    SELECT s.brand_name, s.slug
    FROM customers c
    JOIN sites s ON s.id = c.site_id
    WHERE c.id = ?
    LIMIT 1
  `, [customerId])
  return site?.brand_name || site?.slug || 'this site'
}

// Used by the post-login router to decide "operator dashboard" vs "guest surface"
// for a user with no organization membership at all.
export async function userHasLinkedCustomers(db: DbClient, userId: string): Promise<boolean> {
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM customers WHERE user_id = ? AND status = 'active' LIMIT 1
  `, [userId])
  return Boolean(row)
}
