import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const transferId = String(query.transfer_id || '').trim()
  const token = String(query.token || '').trim()

  if (!transferId && !token) {
    return jsonResponse({ error: 'transfer_id or token is required' }, { status: 400 })
  }

  const transfer = await db.prepare(`
    SELECT *
    FROM site_transfer_requests
    WHERE ${transferId ? 'id = ?' : 'token = ?'}
    LIMIT 1
  `).bind(transferId || token).first()

  if (!transfer) return jsonResponse({ transfer: null, site: null, domains: [] })

  const site = await db.prepare(`
    SELECT id, organization_id, public_url, custom_domain, custom_domain_status
    FROM sites
    WHERE id = ?
    LIMIT 1
  `).bind(String(transfer.site_id)).first()

  const domains = await db.prepare(`
    SELECT id, organization_id, domain, type, role, status
    FROM site_domains
    WHERE site_id = ?
    ORDER BY type ASC, created_at ASC
  `).bind(String(transfer.site_id)).all()

  return jsonResponse({
    transfer,
    site,
    domains: domains.results ?? [],
  })
})
