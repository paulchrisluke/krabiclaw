// Shared org lookup for the admin "invite owner into existing org" picker.
// Backs GET /api/admin/organizations. Kept in server/utils so the query logic
// is unit-testable without spinning up a route/D1 binding (see
// tests/unit/admin-org-search.test.ts, which mocks server/db/index.ts).
import type { DbClient } from '~/server/db'
import { queryAll } from '~/server/db'
import { escapeLikePattern } from '~/server/utils/public-search'

export interface AdminOrgSearchResult {
  id: string
  name: string
  slug: string | null
  hasOwner: boolean
  hasPendingInvitation: boolean
}

interface AdminOrgSearchRow {
  id: string
  name: string
  slug: string | null
  has_owner: number
  has_pending_invitation: number
}

const MAX_RESULTS = 20

// Kept logically equivalent to the owner-conflict checks in
// server/api/admin/invite/client.post.ts (existingOwner + existingPendingInvitation
// queries there) — this is a read-only "will this 409?" preview for the picker, while
// the route does its own authoritative check at write time, so the two aren't merged
// into one shared function.
const HAS_OWNER_OR_PENDING_INVITE_SQL = `
  EXISTS(
    SELECT 1 FROM member m WHERE m.organizationId = o.id AND m.role = 'owner'
  ) AS has_owner,
  EXISTS(
    SELECT 1 FROM invitation i WHERE i.organizationId = o.id AND i.role = 'owner' AND i.status = 'pending'
  ) AS has_pending_invitation
`

/**
 * Finds organizations by slug/name for the admin invite picker. An empty
 * query returns the most recently created orgs (useful for browsing orgs
 * just provisioned by `client:import --apply`, which have no owner yet).
 * `hasOwner`/`hasPendingInvitation` let the UI warn before the user picks an
 * org the backend would reject with a 409 — "Organization already has an
 * owner" or "Organization already has a pending owner invitation"
 * respectively (see server/api/admin/invite/client.post.ts).
 */
export async function searchOrganizationsForInvite(
  db: DbClient,
  query: string,
): Promise<AdminOrgSearchResult[]> {
  const trimmed = query.trim()

  const rows = trimmed
    ? await queryAll<AdminOrgSearchRow>(
        db,
        `
          SELECT
            o.id AS id,
            o.name AS name,
            o.slug AS slug,
            ${HAS_OWNER_OR_PENDING_INVITE_SQL}
          FROM organization o
          WHERE o.slug LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\'
          ORDER BY o.createdAt DESC
          LIMIT ?
        `,
        [`%${escapeLikePattern(trimmed)}%`, `%${escapeLikePattern(trimmed)}%`, MAX_RESULTS],
      )
    : await queryAll<AdminOrgSearchRow>(
        db,
        `
          SELECT
            o.id AS id,
            o.name AS name,
            o.slug AS slug,
            ${HAS_OWNER_OR_PENDING_INVITE_SQL}
          FROM organization o
          ORDER BY o.createdAt DESC
          LIMIT ?
        `,
        [MAX_RESULTS],
      )

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    hasOwner: Boolean(row.has_owner),
    hasPendingInvitation: Boolean(row.has_pending_invitation),
  }))
}
