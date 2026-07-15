// Shared org lookup for the admin "invite owner into existing org" picker.
// Backs GET /api/admin/organizations. Kept in server/utils so the query logic
// is unit-testable without spinning up a route/D1 binding (see
// tests/unit/admin-org-search.test.ts, which mocks server/db/index.ts).
import type { DbClient } from '~/server/db'
import { queryAll } from '~/server/db'

export interface AdminOrgSearchResult {
  id: string
  name: string
  slug: string | null
  hasOwner: boolean
}

interface AdminOrgSearchRow {
  id: string
  name: string
  slug: string | null
  has_owner: number
}

const MAX_RESULTS = 20

/**
 * Finds organizations by slug/name for the admin invite picker. An empty
 * query returns the most recently created orgs (useful for browsing orgs
 * just provisioned by `client:import --apply`, which have no owner yet).
 * `hasOwner` lets the UI warn before the user picks an org the backend
 * would reject with 409 "Organization already has an owner".
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
            EXISTS(
              SELECT 1 FROM member m WHERE m.organizationId = o.id AND m.role = 'owner'
            ) AS has_owner
          FROM organization o
          WHERE o.slug LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\'
          ORDER BY o.createdAt DESC
          LIMIT ?
        `,
        [`%${escapeLike(trimmed)}%`, `%${escapeLike(trimmed)}%`, MAX_RESULTS],
      )
    : await queryAll<AdminOrgSearchRow>(
        db,
        `
          SELECT
            o.id AS id,
            o.name AS name,
            o.slug AS slug,
            EXISTS(
              SELECT 1 FROM member m WHERE m.organizationId = o.id AND m.role = 'owner'
            ) AS has_owner
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
  }))
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}
