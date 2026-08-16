import type { H3Event } from 'nitro'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export async function requireTenantPageWriteAccess(event: H3Event, siteId: string) {
  const { db, site, session } = await requireSiteAccess(event, siteId, 'context')
  await assertSiteWideAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })
  return { db, site, userId: session.user.id }
}
