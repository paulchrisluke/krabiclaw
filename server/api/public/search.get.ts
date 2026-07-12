import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { searchPublicResources } from '~/server/utils/public-search'
import { PUBLIC_SEARCH_TYPES, type PublicSearchTypeFilter } from '~/server/utils/platform-search-types'

const IP_HOURLY_LIMIT = 120

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''
  const type = typeof query.type === 'string' ? query.type : 'all'
  const surface = typeof query.surface === 'string' ? query.surface : 'public'
  const orgSlug = typeof query.orgSlug === 'string' ? query.orgSlug : ''
  const siteSlug = typeof query.siteSlug === 'string' ? query.siteSlug : ''
  const locationSlug = typeof query.locationSlug === 'string' ? query.locationSlug : ''
  const validTypes = new Set<string>(PUBLIC_SEARCH_TYPES)
  const validSurfaces = new Set(['public', 'docs', 'blog', 'dashboard', 'help', 'chowbot', 'tenant_blog'])
  const requiresDashboardAuth = surface === 'dashboard' || type === 'dashboard_route'
  const isTenantRequest = event.context.tenantType === 'tenant' && Boolean(event.context.siteId)

  if (!q.trim()) {
    return jsonResponse({ error: 'q is required' }, { status: 400 })
  }
  if (!validTypes.has(type)) {
    return jsonResponse({ error: 'type must be one of all, doc, blog, faq, route, platform_page, dashboard_route' }, { status: 400 })
  }
  if (!validSurfaces.has(surface)) {
    return jsonResponse({ error: 'surface must be one of public, docs, blog, dashboard, help, chowbot, tenant_blog' }, { status: 400 })
  }
  // tenant_blog is a single shared corpus across every tenant, scoped by
  // site_id at query time — without a resolved tenant site there is no safe
  // site_id to scope by, and returning unscoped results would leak every
  // other tenant's blog posts.
  if (surface === 'tenant_blog' && !isTenantRequest) {
    return jsonResponse({ error: 'tenant_blog surface requires a tenant site' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    if (!import.meta.dev) {
      const clientIp = getClientIp(event)
      const hourWindow = Math.floor(Date.now() / 3_600_000)
      const rateLimitOk = await incrementHourlyRateLimit(
        db,
        `rate:public-search:ip:${await hashClientIp(clientIp)}:${hourWindow}`,
        IP_HOURLY_LIMIT,
        3_600_000,
      )
      if (!rateLimitOk) {
        return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })
      }
    }

    if (requiresDashboardAuth) {
      const session = await getAuthSession(event, env)
      if (!session?.user) {
        return jsonResponse({ error: 'Authentication required' }, { status: 401 })
      }
    }

    const results = await searchPublicResources(env, q, {
      type: type as PublicSearchTypeFilter,
      surface: surface as 'public' | 'docs' | 'blog' | 'dashboard' | 'help' | 'chowbot' | 'tenant_blog',
      limit: 10,
      siteId: isTenantRequest ? String(event.context.siteId) : null,
      dashboardContext: requiresDashboardAuth
        ? {
            orgSlug: orgSlug || null,
            siteSlug: siteSlug || null,
            locationSlug: locationSlug || null,
          }
        : undefined,
    })
    return jsonResponse({ query: q, surface, results })
  } catch (error) {
    console.error('Failed to run public search:', error)
    return jsonResponse({ error: 'Failed to search public resources' }, { status: 500 })
  }
})
