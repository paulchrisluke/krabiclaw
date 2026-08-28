import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, queryFirst } from '~/server/db'
import { getClientIp } from '~/server/utils/hourly-rate-limit'
import {
  getCloudflareGeo,
  getOrCreateSessionId,
  getOrCreateVisitorId,
  getSiteInternalHosts,
  hashIp,
  isCanonicalEventId,
  isKnownBot,
  isKnownTenantPublicPath,
  isTrackablePath,
  recordPlatformPageview,
  recordTenantPageview,
  resolveLocationIdFromPath,
  resolvePageviewTenantPageIdentity,
  updatePlatformPageviewDuration,
  updateTenantPageviewDuration,
  SESSION_COOKIE,
} from '~/server/utils/pageview-tracking'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { normalizeReferrerHost, sanitizeAttributionParams } from '~/utils/analytics-attribution'
import { defineHandler } from 'nitro'
import { getCookie, readBody } from 'nitro/h3'

interface PageviewRequest {
  eventId?: unknown
  eventType?: unknown
  pagePath?: unknown
  locale?: unknown
  referrerHost?: unknown
  attribution?: unknown
  durationSeconds?: unknown
}

const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_SECONDS = 60

export default defineHandler(async (event) => {
  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const body = await readBody(event) as PageviewRequest
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid analytics payload' }, { status: 400 })
    }

    const eventType = body.eventType === 'duration' ? 'duration' : body.eventType === 'pageview' ? 'pageview' : null
    if (!eventType || !isCanonicalEventId(body.eventId)) {
      return jsonResponse({ error: 'eventId and a valid eventType are required' }, { status: 400 })
    }

    const pagePath = typeof body.pagePath === 'string' ? body.pagePath.trim() : ''
    if (!isTrackablePath(pagePath)) return jsonResponse({ error: 'Page path is not trackable' }, { status: 400 })

    const tenantType = event.context.tenantType
    const isTenant = tenantType === TENANT_TYPES.TENANT
    const isPlatform = tenantType === TENANT_TYPES.PLATFORM
    const siteId = typeof event.context.siteId === 'string' ? event.context.siteId : ''
    const organizationId = typeof event.context.organizationId === 'string' ? event.context.organizationId : ''
    if ((!isTenant && !isPlatform) || (isTenant && (!siteId || !organizationId))) {
      return jsonResponse({ error: 'Active tenant or platform context is required' }, { status: 400 })
    }
    const userAgent = (event.req.headers.get('user-agent') || '').slice(0, 1024)
    if (isKnownBot(userAgent)) return jsonResponse({ ok: true, ignored: true })

    const rawDuration = Number(body.durationSeconds)
    const durationSeconds = Number.isFinite(rawDuration) && rawDuration >= 0 && rawDuration <= 86_400
      ? Math.round(rawDuration)
      : null
    if (eventType === 'duration' && durationSeconds === null) {
      return jsonResponse({ error: 'durationSeconds must be between 0 and 86400' }, { status: 400 })
    }

    const rawLocale = typeof body.locale === 'string' ? body.locale.trim() : ''
    const locale = rawLocale ? normalizeLocale(rawLocale) : null
    if (isTenant && rawLocale && !locale) {
      return jsonResponse({ error: 'locale must be a valid BCP-47 locale' }, { status: 400 })
    }

    const ipHash = await hashIp(getClientIp(event))
    const now = new Date().toISOString()
    const windowEndsAt = new Date(Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString()
    const rateKey = `analytics-track:${isPlatform ? 'platform' : siteId}:${ipHash}`
    await execute(db, `INSERT INTO rate_limits (key, count, updated_at, expires_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN COALESCE(rate_limits.expires_at, '') <= excluded.updated_at THEN 1 ELSE rate_limits.count + 1 END,
        updated_at = excluded.updated_at,
        expires_at = CASE WHEN COALESCE(rate_limits.expires_at, '') <= excluded.updated_at THEN excluded.expires_at ELSE rate_limits.expires_at END`,
    [rateKey, now, windowEndsAt])
    const rateState = await queryFirst<{ count: number; expires_at: string }>(db, 'SELECT count, expires_at FROM rate_limits WHERE key = ? LIMIT 1', [rateKey])
    if (Number(rateState?.count || 0) > RATE_LIMIT_MAX && String(rateState?.expires_at || '') > now) {
      return jsonResponse({ error: 'Too many requests' }, { status: 429 })
    }

    if (eventType === 'duration') {
      const sessionId = getCookie(event, SESSION_COOKIE)
      if (!isCanonicalEventId(sessionId)) {
        return jsonResponse({ error: 'A valid analytics session is required' }, { status: 400 })
      }
      if (isTenant) {
        await updateTenantPageviewDuration(db, { eventId: body.eventId, siteId, sessionId, durationSeconds: durationSeconds!, now })
      } else {
        await updatePlatformPageviewDuration(db, { eventId: body.eventId, sessionId, durationSeconds: durationSeconds! })
      }
      return jsonResponse({ ok: true })
    }

    const visitorId = getOrCreateVisitorId(event)
    const sessionId = getOrCreateSessionId(event)

    const referrerHost = typeof body.referrerHost === 'string'
      ? normalizeReferrerHost(`https://${body.referrerHost}`)
      : null
    const geo = getCloudflareGeo(event)
    if (isPlatform) {
      await recordPlatformPageview(db, {
        eventId: body.eventId,
        pagePath,
        referrerHost,
        userAgent,
        ipHash,
        sessionId,
        visitorId,
        country: geo.country ?? null,
        region: geo.region ?? null,
        city: geo.city ?? null,
        now,
      })
    } else {
      const [locationId, page, internalHosts] = await Promise.all([
        resolveLocationIdFromPath(db, siteId, pagePath),
        resolvePageviewTenantPageIdentity(db, siteId, pagePath, locale),
        getSiteInternalHosts(db, siteId, event.url.hostname),
      ])
      const site = event.context.site as { theme?: string | null; vertical?: string | null } | undefined
      if (!page && !isKnownTenantPublicPath(pagePath, {
        theme: site?.theme,
        themeId: event.context.themeId as string | null | undefined,
        vertical: site?.vertical,
      })) {
        return jsonResponse({ error: 'Page path is not a published tenant route' }, { status: 400 })
      }
      await recordTenantPageview(db, {
        eventId: body.eventId,
        organizationId,
        siteId,
        pagePath,
        locale,
        referrerHost,
        attribution: sanitizeAttributionParams(body.attribution),
        internalHosts,
        userAgent,
        ipHash,
        sessionId,
        visitorId,
        country: geo.country ?? null,
        region: geo.region ?? null,
        city: geo.city ?? null,
        locationId,
        pageId: page?.page_id ?? null,
        pageType: page?.page_type ?? null,
        recipe: page?.recipe ?? null,
        now,
      })
    }
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('Analytics track error:', error instanceof Error ? error.message : String(error))
    return jsonResponse({ error: 'Failed to log analytics event' }, { status: 500 })
  }
})
