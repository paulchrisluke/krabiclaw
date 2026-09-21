import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertSiteContextAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { searchPublicResources } from '~/server/utils/public-search'

// The dashboard's one search: a member's own business, scoped to the site the
// palette is open on, plus the platform's guides and help answers. The site is
// the route's, resolved and checked against the member's access the way every
// dashboard read is; it is never a filter the client names on its own.
export default defineHandler(async (event) => {
  const q = typeof getQuery(event).q === 'string' ? String(getQuery(event).q).trim() : ''
  if (!q) return jsonResponse({ error: 'q is required' }, { status: 400 })

  const context = await getDashboardContext(event, { requireSite: true })
  if (!context.organization || !context.site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  await assertSiteContextAccess(context.db, memberAccessPrincipal(context.organization, { env: context.env, siteId: context.site.id }))

  const results = await searchPublicResources(context.env, q, { surface: 'dashboard', siteId: context.site.id, limit: 10 })
  return jsonResponse({ query: q, results })
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
