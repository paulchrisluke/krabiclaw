import { queryFirst } from '~/server/db'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'

export type PostLoginDestination = '/account' | '/admin' | '/dashboard/onboarding' | `/dashboard/${string}`

export interface PostLoginUser {
  id: string
  role?: string | null
}

export async function resolvePostLoginDestination(
  db: D1Database,
  user: PostLoginUser,
): Promise<PostLoginDestination> {
  if (hasPlatformAdminPermission(user.role)) return '/admin'

  const row = await queryFirst<{ slug: string }>(db, `
    SELECT o.slug
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY o.createdAt ASC
    LIMIT 1
  `, [user.id])

  if (row) return `/dashboard/${encodeURIComponent(row.slug)}`

  const isGuest = await userHasLinkedCustomers(db, user.id)
  return isGuest ? '/account' : '/dashboard/onboarding'
}
