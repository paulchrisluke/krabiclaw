import { queryFirst } from '~/server/db'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'

export type PostLoginDestination = '/account' | '/dashboard/onboarding' | `/dashboard/${string}`

export interface PostLoginUser {
  id: string
}

export async function resolvePostLoginDestination(
  db: D1Database,
  user: PostLoginUser,
): Promise<PostLoginDestination> {
  const row = await queryFirst<{ slug: string | null }>(db, `
    SELECT o.slug
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY o.createdAt ASC
    LIMIT 1
  `, [user.id])

  const slug = row?.slug
  if (slug) return `/dashboard/${encodeURIComponent(slug)}`

  const isGuest = await userHasLinkedCustomers(db, user.id)
  return isGuest ? '/account' : '/dashboard/onboarding'
}
