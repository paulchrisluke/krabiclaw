import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { setCanonicalDomain } from '~/server/utils/domains'

interface DomainPatchBody {
  role?: 'canonical'
  status?: 'disabled'
}

interface SiteDomainRow {
  id: string
  site_id: string
  organization_id: string
  domain: string
  type: 'custom' | 'subdomain'
  role: 'canonical' | 'secondary'
  status: string
  created_at: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  let body: DomainPatchBody
  try {
    body = await readBody<DomainPatchBody>(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!siteId || !domainId) return jsonResponse({ error: 'Site ID and domain ID are required' }, { status: 400 })
  if (body.role && body.status) {
    return jsonResponse({ error: 'Provide only one of role or status' }, { status: 400 })
  }
  if (body.role && body.role !== 'canonical') {
    return jsonResponse({ error: 'Unsupported role value' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id, m.role as member_role
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; member_role: 'owner' | 'admin' }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    if (body.role === 'canonical') {
      const actorRole = site.member_role
      const domain = await setCanonicalDomain(db, siteId, domainId, actorRole, session.user.id)
      return jsonResponse({ success: true, domain })
    }

    if (body.status === 'disabled') {
      const now = new Date().toISOString()
      await db.exec('BEGIN IMMEDIATE TRANSACTION')
      let domain: SiteDomainRow | null = null
      let promotedDomain: SiteDomainRow | null = null
      try {
        const existing = await db.prepare(`
          SELECT *
          FROM site_domains
          WHERE id = ? AND site_id = ? AND type = 'custom'
          LIMIT 1
        `).bind(domainId, siteId).first() as SiteDomainRow | null
        if (!existing) {
          await db.exec('ROLLBACK')
          return jsonResponse({ error: 'Domain not found' }, { status: 404 })
        }

        await db.prepare(`
          UPDATE site_domains
          SET status = 'disabled', role = 'secondary', updated_at = ?
          WHERE id = ? AND site_id = ? AND type = 'custom'
        `).bind(now, domainId, siteId).run()

        if (existing.role === 'canonical') {
          promotedDomain = await db.prepare(`
            SELECT *
            FROM site_domains
            WHERE site_id = ?
              AND type = 'custom'
              AND status = 'active'
              AND id != ?
            ORDER BY created_at ASC
            LIMIT 1
          `).bind(siteId, domainId).first() as SiteDomainRow | null

          if (promotedDomain) {
            await db.prepare(`
              UPDATE site_domains
              SET role = 'canonical', updated_at = ?
              WHERE id = ?
            `).bind(now, promotedDomain.id).run()
            await db.prepare(`
              UPDATE sites
              SET public_url = ?, custom_domain = ?, custom_domain_status = 'active', updated_at = ?
              WHERE id = ? AND organization_id = ?
            `).bind(`https://${promotedDomain.domain}`, promotedDomain.domain, now, siteId, site.organization_id).run()
          } else {
            await db.prepare(`
              UPDATE sites
              SET public_url = NULL, custom_domain = NULL, custom_domain_status = 'none', updated_at = ?
              WHERE id = ? AND organization_id = ?
            `).bind(now, siteId, site.organization_id).run()
          }
        }

        domain = await db.prepare(`
          SELECT * FROM site_domains
          WHERE id = ? AND site_id = ? AND type = 'custom'
          LIMIT 1
        `).bind(domainId, siteId).first() as SiteDomainRow | null
        await db.exec('COMMIT')
      } catch (error) {
        await db.exec('ROLLBACK')
        throw error
      }

      if (!domain) return jsonResponse({ error: 'Domain not found' }, { status: 404 })
      return jsonResponse({ success: true, domain, promotedDomain: promotedDomain || null })
    }

    return jsonResponse({ error: 'No supported update provided' }, { status: 400 })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('domain_update_failed', {
      siteId,
      domainId,
      userId: session.user.id,
      body,
      error: normalizedError.message,
      stack: normalizedError.stack || null
    })
    return jsonResponse({ error: 'Failed to update domain' }, { status: 500 })
  }
})
