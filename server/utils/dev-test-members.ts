import { executeBatch, type DbClient } from '~/server/db'

export type DevTestMemberRole = 'owner' | 'admin' | 'editor' | 'member'

export interface CreateDevTestMemberInput {
  userId: string
  memberId: string
  organizationId: string
  role: DevTestMemberRole
  name: string
  email: string
  now: number
}

export async function createDevTestMember(
  db: DbClient,
  input: CreateDevTestMemberInput,
): Promise<void> {
  const queries = [
    {
      query: `
        INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
        VALUES (?, ?, ?, 1, 'user', ?, ?)
      `,
      params: [input.userId, input.name, input.email, input.now, input.now],
    },
    {
      query: `
        INSERT INTO member (id, organizationId, userId, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `,
      params: [input.memberId, input.organizationId, input.userId, input.role, input.now],
    },
  ]

  if (input.role === 'editor') {
    queries.push({
      query: `
        INSERT OR IGNORE INTO member_access_scope
          (id, member_id, organization_id, site_id, location_id, grant_source)
        SELECT lower(hex(randomblob(16))), ?, ?, id, NULL, 'manual'
        FROM sites
        WHERE organization_id = ?
      `,
      params: [input.memberId, input.organizationId, input.organizationId],
    })
  }

  await executeBatch(db, queries)
}
