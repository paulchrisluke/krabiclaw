import { queryFirst } from '~/server/db'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'

export type PostLoginDestination = '/admin' | '/account' | '/dashboard/onboarding' | `/dashboard/${string}`

export interface PostLoginUser {
  id: string
}

export interface PostLoginSessionRecord {
  impersonatedBy?: string | null
}

export interface ResolvePostLoginDestinationOptions {
  isPlatformAdmin: boolean
}

export function isImpersonationSession(sessionRecord: PostLoginSessionRecord | null | undefined): boolean {
  return typeof sessionRecord?.impersonatedBy === 'string' && sessionRecord.impersonatedBy.trim().length > 0
}

export async function resolvePostLoginDestination(
  db: D1Database,
  user: PostLoginUser,
  sessionRecord: PostLoginSessionRecord | null | undefined,
  options: ResolvePostLoginDestinationOptions,
): Promise<PostLoginDestination> {
  if (!isImpersonationSession(sessionRecord) && options.isPlatformAdmin) {
    return '/admin'
  }

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

  const isGuest = await userHasLinkedCustomers(db, user.id).catch(() => false)
  return isGuest ? '/account' : '/dashboard/onboarding'
}
