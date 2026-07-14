// Auth+query wiring for the guest-facing /account surface. Kept separate from
// server/utils/guest-claims.ts (which stays a pure D1-query module, mocked in
// isolation by tests/unit/guest-claims.test.ts) so pulling in getAuthSession's
// full dependency chain (better-auth, whatsapp, admin notifications, ...) here
// doesn't drag that chain into guest-claims.ts's unit tests.
//
// Single source of truth for the auth+query logic behind GET /api/account/claims
// and GET /api/account/bookings, reused as-is by both API routes and the
// corresponding pages' SSR branches (per CLAUDE.md's "nested SSR self-fetch
// loses Cloudflare bindings" rule) so the route and the page can never drift on
// the D1 binding name or auth/visibility rules the way they previously did
// (env.db vs env.DB).
import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  findClaimableCustomersForEmail,
  listLinkedCustomersForUser,
  type ClaimableCustomer,
  type LinkedCustomerSummary,
} from '~/server/utils/guest-claims'

export type AccountSurfaceResult<T> =
  | { status: 'ok', data: T }
  | { status: 'unauthenticated' }
  | { status: 'db_unavailable' }

export async function resolveClaimableCustomersForEvent(event: H3Event): Promise<AccountSurfaceResult<ClaimableCustomer[]>> {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return { status: 'db_unavailable' }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return { status: 'unauthenticated' }
  if (!session.user.emailVerified) return { status: 'ok', data: [] }

  const claimable = await findClaimableCustomersForEmail(db, session.user.email)
  return { status: 'ok', data: claimable }
}

export async function resolveLinkedCustomersForEvent(event: H3Event): Promise<AccountSurfaceResult<LinkedCustomerSummary[]>> {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return { status: 'db_unavailable' }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return { status: 'unauthenticated' }

  const customers = await listLinkedCustomersForUser(db, session.user.id)
  return { status: 'ok', data: customers }
}
