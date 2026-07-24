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
        INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
        SELECT 'site:' || id, COALESCE(brand_name, id), organization_id, ?
        FROM sites
        WHERE organization_id = ?
      `,
      params: [input.now, input.organizationId],
    })
    queries.push({
      query: `
        UPDATE sites
        SET team_id = 'site:' || id
        WHERE organization_id = ? AND team_id IS NULL
      `,
      params: [input.organizationId],
    })
    queries.push({
      query: `
        INSERT OR IGNORE INTO teamMember (id, teamId, userId, membershipKey, createdAt)
        SELECT lower(hex(randomblob(16))), team_id, ?, team_id || ':' || ?, ?
        FROM sites
        WHERE organization_id = ? AND team_id IS NOT NULL
      `,
      params: [input.userId, input.userId, input.now, input.organizationId],
    })
  }

  await executeBatch(db, queries)
}
