import { getRouterParam, sendRedirect } from 'nitro/h3'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getOrCreateSessionId } from '~/server/utils/pageview-tracking'
import { recordSiteConversionEvent } from '~/server/utils/site-conversions'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
  const site = await queryFirst<{ organization_id: string; subdomain: string | null; external_url: string | null }>(db, `
    SELECT s.organization_id, s.subdomain, settings.external_url
    FROM sites s JOIN site_consultation_settings settings ON settings.site_id = s.id
    WHERE s.id = ? AND s.status = 'active' AND s.onboarding_status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const host = event.url.hostname.toLowerCase()
  const previewTenant = event.req.headers.get('x-preview-tenant')
  const domains = await queryAll<{ domain: string }>(db, `SELECT domain FROM site_domains WHERE site_id = ? AND status = 'active'`, [siteId])
  const matchesHost = domains.some(row => row.domain.toLowerCase() === host)
    || ((host === 'localhost' || host === '127.0.0.1') && previewTenant === site.subdomain)
  if (!matchesHost) return jsonResponse({ error: 'Site does not match the active tenant host' }, { status: 404 })

  let destination: URL
  try {
    destination = new URL(site.external_url || '')
    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') throw new Error('invalid protocol')
  } catch {
    return jsonResponse({ error: 'Consultation destination is invalid' }, { status: 500 })
  }

  const sessionId = getOrCreateSessionId(event)
  try {
    await recordSiteConversionEvent(db, event, {
      organizationId: site.organization_id,
      siteId,
      eventName: 'consultation_cta_click',
      stage: 'external_booking_handoff',
      pageType: 'schedule',
      pagePath: '/schedule',
      ctaDestination: destination.hostname.toLowerCase(),
    })
    const session = await queryFirst<Record<string, unknown>>(db, `SELECT last_touch_source, last_touch_medium, last_touch_campaign, last_touch_term, last_touch_content FROM site_analytics_sessions WHERE site_id = ? AND session_id = ? LIMIT 1`, [siteId, sessionId])
    if (session && !(session.last_touch_source === 'Direct' && session.last_touch_medium === '(none)')) {
      const fields = [
        ['utm_source', session.last_touch_source], ['utm_medium', session.last_touch_medium],
        ['utm_campaign', session.last_touch_campaign], ['utm_term', session.last_touch_term], ['utm_content', session.last_touch_content],
      ] as const
      for (const [name, value] of fields) if (typeof value === 'string' && value) destination.searchParams.set(name, value)
    }
  } catch (error) {
    console.error('consultation_handoff_conversion_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
  }
  return sendRedirect(event, destination.toString(), 302)
})
