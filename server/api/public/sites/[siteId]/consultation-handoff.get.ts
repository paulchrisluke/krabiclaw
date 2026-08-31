import { getRouterParam, sendRedirect } from 'nitro/h3'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const host = event.url.hostname.toLowerCase()
  const previewTenant = event.req.headers.get('x-preview-tenant')
  const site = await queryFirst<{ subdomain: string | null; external_url: string | null }>(db, `
    SELECT s.subdomain, settings.external_url
    FROM sites s
    JOIN site_consultation_settings settings ON settings.site_id = s.id
    WHERE s.id = ?
      AND s.status = 'active'
      AND s.onboarding_status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM site_domains d
          WHERE d.site_id = s.id AND d.status = 'active' AND lower(d.domain) = ?
        )
        OR ((? = 'localhost' OR ? = '127.0.0.1') AND ? = s.subdomain)
      )
    LIMIT 1`, [siteId, host, host, host, previewTenant])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  let destination: URL
  try {
    destination = new URL(site.external_url || '')
    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') throw new Error('invalid protocol')
  } catch {
    return jsonResponse({ error: 'Consultation destination is invalid' }, { status: 500 })
  }

  return sendRedirect(event, destination.toString(), 302)
})
