import type { CloudflareEnv } from '~/server/utils/auth'
import { listUserOrganizations } from '~/server/utils/member-access'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'

export type PostLoginDestination = '/admin' | '/dashboard/account/profile' | `/dashboard/${string}`

export interface PostLoginUser {
  id: string
  role?: string | null
}

export async function resolvePostLoginDestination(
  env: CloudflareEnv,
  user: PostLoginUser,
): Promise<PostLoginDestination> {
  if (hasPlatformAdminPermission(user.role)) return '/admin'

  const organizations = await listUserOrganizations(env, user.id)
  const organization = organizations
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0]

  if (organization) return `/dashboard/${encodeURIComponent(organization.slug)}`

  return '/dashboard/account/profile'
}
