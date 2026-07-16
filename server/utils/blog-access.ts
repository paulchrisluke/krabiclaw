import type { H3Event } from 'h3'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope, LOCATION_MANAGER_ROLE } from '~/server/utils/member-access'

export async function requireBlogAccess(event: H3Event, siteId: string) {
  const access = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', LOCATION_MANAGER_ROLE])
  if (access.site.member_role === LOCATION_MANAGER_ROLE) {
    await assertMemberScope(access.db, {
      memberId: access.site.member_id,
      role: access.site.member_role,
      organizationId: access.site.organization_id,
      siteId,
    })
  }
  return access
}
