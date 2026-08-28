import { HTTPError } from 'nitro'
import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { getSiteAnalyticsReport } from '~/server/utils/site-analytics-report'

export async function loadDashboardSiteAnalytics(
  event: H3Event,
  siteId: string,
  query: { startDate?: string; endDate?: string },
) {
  if (!siteId) throw new HTTPError({ statusCode: 400, statusMessage: 'Site ID is required' })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  await assertSiteWideAccess(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })
  return await getSiteAnalyticsReport(db, { siteId, ...query })
}
