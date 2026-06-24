// POST /api/analytics/track - Public endpoint for client-side pageview/duration pings.
// Pageviews are also recorded server-side for the initial request by
// server/middleware/zz-pageview-tracking.ts; this endpoint covers SPA route
// changes (router.afterEach) and the visibilitychange/sendBeacon duration ping.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, queryFirst } from '~/server/db'
import {
  getClientIp,
  getCloudflareGeo,
  getOrCreateSessionId,
  getOrCreateVisitorId,
  hashIp,
  insertPageviewEvent,
  isTrackablePath
} from '~/server/utils/pageview-tracking'

interface PageviewRequest {
  siteId: string
  pagePath: string
  referrer?: string
  userAgent?: string
  durationSeconds?: number
  eventType?: 'pageview' | 'duration'
}

const MAX_SITE_ID_LEN = 128
const MAX_PATH_LEN = 2048
const MAX_REFERRER_LEN = 2048
const MAX_UA_LEN = 1024
const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_SECONDS = 60

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const body = await readBody(event) as PageviewRequest

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse(
        { error: 'Invalid analytics payload' },
        { status: 400 }
      )
    }

    const eventType = body.eventType === 'duration' ? 'duration' : 'pageview'

    const rawDuration = (body as unknown as Record<string, unknown>).durationSeconds
    let durationSeconds: number | null = null
    if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
      const parsed = Number(rawDuration)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return jsonResponse(
          { error: 'durationSeconds must be a non-negative number' },
          { status: 400 }
        )
      }
      durationSeconds = parsed
    }

    if (eventType === 'duration' && durationSeconds === null) {
      return jsonResponse({ error: 'durationSeconds is required for duration pings' }, { status: 400 })
    }

    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : ''
    const pagePath = typeof body.pagePath === 'string' ? body.pagePath.trim() : ''
    const referrer = typeof body.referrer === 'string' ? body.referrer.trim() : undefined
    const userAgent = typeof body.userAgent === 'string' ? body.userAgent.trim() : undefined

    if (!siteId || !pagePath) {
      return jsonResponse(
        { error: 'Missing required fields: siteId, pagePath' },
        { status: 400 }
      )
    }

    if (!isTrackablePath(pagePath)) {
      return jsonResponse({ ok: true })
    }

    if (
      siteId.length > MAX_SITE_ID_LEN ||
      pagePath.length > MAX_PATH_LEN ||
      (referrer && referrer.length > MAX_REFERRER_LEN) ||
      (userAgent && userAgent.length > MAX_UA_LEN)
    ) {
      return jsonResponse(
        { error: 'One or more fields exceed maximum allowed length' },
        { status: 400 }
      )
    }

    // Validate that the site exists
    const site = await queryFirst<{ id: string }>(db, `SELECT id FROM sites WHERE id = ?`, [siteId])

    if (!site) {
      return jsonResponse(
        { error: 'Site not found' },
        { status: 404 }
      )
    }

    const clientIp = getClientIp(event)
    const ipHash = await hashIp(clientIp)
    const now = new Date().toISOString()
    const windowEndsAt = new Date(Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString()
    const rateKey = `analytics-track:${siteId}:${ipHash}`

    // Atomic upsert/increment for IP-based rate limiting in a fixed window.
    await execute(db, `
      INSERT INTO rate_limits (key, count, updated_at, expires_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE
          WHEN COALESCE(rate_limits.expires_at, '') <= excluded.updated_at THEN 1
          ELSE rate_limits.count + 1
        END,
        updated_at = excluded.updated_at,
        expires_at = CASE
          WHEN COALESCE(rate_limits.expires_at, '') <= excluded.updated_at THEN excluded.expires_at
          ELSE rate_limits.expires_at
        END
    `, [rateKey, now, windowEndsAt])

    const rateState = await queryFirst<ApiRecord>(
      db,
      `SELECT count, expires_at FROM rate_limits WHERE key = ? LIMIT 1`,
      [rateKey],
    )

    const currentCount = Number(rateState?.count || 0)
    const expiresAt = typeof rateState?.expires_at === 'string' ? rateState.expires_at : ''
    if (currentCount > RATE_LIMIT_MAX && expiresAt > now) {
      return jsonResponse(
        { error: 'Too many requests' },
        { status: 429 }
      )
    }

    const visitorId = getOrCreateVisitorId(event)
    const sessionId = getOrCreateSessionId(event)

    if (eventType === 'duration') {
      // Final/duration ping updates the most recent event for this exact page
      // (not just "most recent in session") — the beacon for the page being left
      // and the fetch for the next page's pageview are both in flight at once and
      // can resolve out of order, so matching on page_path avoids attaching the
      // duration to whichever row happens to land last.
      await execute(db, `
        UPDATE site_pageview_events
        SET duration_seconds = ?
        WHERE id = (
          SELECT id FROM site_pageview_events
          WHERE site_id = ? AND session_id = ? AND page_path = ?
          ORDER BY created_at DESC
          LIMIT 1
        )
      `, [durationSeconds, siteId, sessionId, pagePath])

      return jsonResponse({ ok: true })
    }

    const geo = getCloudflareGeo(event)

    await insertPageviewEvent(db, {
      siteId,
      pagePath,
      referrer: referrer || null,
      userAgent: userAgent || null,
      ipHash,
      sessionId,
      visitorId,
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null
    })

    return jsonResponse({ ok: true })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Analytics track error:', err.message)
    return jsonResponse(
      { error: 'Failed to log pageview' },
      { status: 500 }
    )
  }
})
