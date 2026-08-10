import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'

export interface DevLoginCandidate {
  id: string
  email: string
  role?: string | null
}

interface DevLoginUserAdapter {
  listUsers(
    _limit?: number,
    _offset?: number,
    _sortBy?: { field: string; direction: 'asc' | 'desc' },
  ): Promise<DevLoginCandidate[]>
}

interface DevLoginOrganizationAdapter {
  listOrganizations(_userId: string): Promise<Array<{ id: string }>>
  findMemberByOrgId(_input: { userId: string; organizationId: string }): Promise<{ role?: unknown } | null>
}

export async function selectDevLoginUser(input: {
  internalAdapter: DevLoginUserAdapter
  organizationAdapter: DevLoginOrganizationAdapter
  hasSite: (_organizationIds: string[]) => Promise<boolean>
}): Promise<DevLoginCandidate | null> {
  const pageSize = 50
  let offset = 0
  let firstUser: DevLoginCandidate | null = null
  let firstOrganizationUser: DevLoginCandidate | null = null
  let firstOwnerUser: DevLoginCandidate | null = null
  let siteUser: DevLoginCandidate | null = null

  while (!siteUser) {
    const users = await input.internalAdapter.listUsers(pageSize, offset, { field: 'createdAt', direction: 'asc' })
    if (users.length === 0) break

    for (const candidate of users) {
      if (hasPlatformAdminPermission(candidate.role)) continue
      firstUser ??= candidate

      const organizations = await input.organizationAdapter.listOrganizations(candidate.id)
      if (organizations.length > 0) firstOrganizationUser ??= candidate

      let isOwner = false
      for (const organization of organizations) {
        const membership = await input.organizationAdapter.findMemberByOrgId({
          userId: candidate.id,
          organizationId: organization.id,
        })
        if (membership && String(membership.role) === 'owner') {
          isOwner = true
          break
        }
      }
      if (isOwner) firstOwnerUser ??= candidate

      if (await input.hasSite(organizations.map(organization => organization.id))) {
        siteUser = candidate
        break
      }
    }

    offset += users.length
    if (users.length < pageSize) break
  }

  return siteUser ?? firstOwnerUser ?? firstOrganizationUser ?? firstUser
}
