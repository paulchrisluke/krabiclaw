import type { CloudflareEnv } from '~/server/utils/auth'
import { listUserOrganizations, resolveUserOrganization } from '~/server/utils/member-access'

export type PostLoginDestination = `/dashboard/${string}`

export interface PostLoginPrincipal {
  userId: string
  // Better Auth's session-wide active organization (organization plugin,
  // POST /organization/set-active). Site creation sets it to the organization
  // just acted in, so the next post-login lands there.
  activeOrganizationId: string | null
}

export async function resolvePostLoginDestination(
  env: CloudflareEnv,
  { userId, activeOrganizationId }: PostLoginPrincipal,
): Promise<PostLoginDestination> {
  if (activeOrganizationId) {
    // Membership-checked: a stale active organization the user was removed from
    // must not route them into a dashboard they can no longer open.
    const active = await resolveUserOrganization(env, { userId, organizationId: activeOrganizationId })
    if (active) return `/dashboard/${encodeURIComponent(active.slug)}`
  }

  const organizations = await listUserOrganizations(env, userId)
  const organization = organizations
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0]

  if (organization) return `/dashboard/${encodeURIComponent(organization.slug)}`

  return '/dashboard/onboarding'
}
