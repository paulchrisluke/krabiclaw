import { HTTPError } from 'nitro'
import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertSiteWideAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { getSiteAnalyticsReport } from '~/server/utils/site-analytics-report'

export async function loadDashboardSiteAnalytics(
  event: H3Event,
  organizationId: string,
  query: { startDate?: string; endDate?: string },
) {
  if (!organizationId) throw new HTTPError({ statusCode: 400, statusMessage: 'Site ID is required' })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  const site = await loadMemberSiteRow(event, db, env, organizationId, session.user.id)
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  await assertSiteWideAccess(db, memberAccessPrincipal(site.membership, { env, organizationId, event }))
  return await getSiteAnalyticsReport(db, { organizationId, ...query })
}
