import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { setCanonicalDomain } from '~/server/utils/domains'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  const body = await readBody(event) as { role?: 'canonical' | 'secondary'; status?: 'disabled' }
  if (!siteId || !domainId) return jsonResponse({ error: 'Site ID and domain ID are required' }, { status: 400 })
  if (body.role && body.status) {
    return jsonResponse({ error: 'Provide only one of role or status' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, m.role as member_role
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    if (body.role === 'canonical') {
      const actorRole = site.member_role || 'unknown'
      const domain = await setCanonicalDomain(db, siteId, domainId, actorRole, session.user.id)
      return jsonResponse({ success: true, domain })
    }

    if (body.status === 'disabled') {
      const now = new Date().toISOString()
      await db.prepare(`
        UPDATE site_domains
        SET status = 'disabled', role = 'secondary', updated_at = ?
        WHERE id = ? AND site_id = ? AND type = 'custom'
      `).bind(now, domainId, siteId).run()
      const domain = await db.prepare(`
        SELECT * FROM site_domains
        WHERE id = ? AND site_id = ? AND type = 'custom'
        LIMIT 1
      `).bind(domainId, siteId).first()
      if (!domain) return jsonResponse({ error: 'Domain not found' }, { status: 404 })
      return jsonResponse({ success: true, domain })
    }

    return jsonResponse({ error: 'No supported update provided' }, { status: 400 })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to update domain' }, { status: 500 })
  }
})
