import type { H3Event } from 'nitro'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export async function requireTenantPageWriteAccess(event: H3Event, siteId: string) {
  const { env, db, site, session } = await requireSiteAccess(event, siteId, 'context')
  await assertSiteWideAccess(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })
  return { env, db, site, userId: session.user.id }
}
