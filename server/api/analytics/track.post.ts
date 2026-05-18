// POST /api/analytics/track - Public endpoint to log pageview events
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import type { H3Event } from 'h3'

interface PageviewRequest {
  siteId: string
  sessionId: string
  pagePath: string
  referrer?: string
  userAgent?: string
  durationSeconds?: number
}

const MAX_SITE_ID_LEN = 128
const MAX_SESSION_ID_LEN = 128
const MAX_PATH_LEN = 2048
const MAX_REFERRER_LEN = 2048
const MAX_UA_LEN = 1024
const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_SECONDS = 60

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

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

    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const pagePath = typeof body.pagePath === 'string' ? body.pagePath.trim() : ''
    const referrer = typeof body.referrer === 'string' ? body.referrer.trim() : undefined
    const userAgent = typeof body.userAgent === 'string' ? body.userAgent.trim() : undefined

    // Validate required fields
    if (!siteId || !sessionId || !pagePath) {
      return jsonResponse(
        { error: 'Missing required fields: siteId, sessionId, pagePath' },
        { status: 400 }
      )
    }

    if (
      siteId.length > MAX_SITE_ID_LEN ||
      sessionId.length > MAX_SESSION_ID_LEN ||
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
    const site = await db.prepare(
      `SELECT id FROM sites WHERE id = ?`
    ).bind(siteId).first()

    if (!site) {
      return jsonResponse(
        { error: 'Site not found' },
        { status: 404 }
      )
    }

    // Extract client IP for hashing (never store raw IP)
    const clientIp = getClientIP(event) || 'unknown'
    const ipHash = await hashIp(clientIp)
    const now = new Date().toISOString()
    const windowEndsAt = new Date(Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString()
    const rateKey = `analytics-track:${siteId}:${ipHash}`

    // Atomic upsert/increment for IP-based rate limiting in a fixed window.
    await db.prepare(`
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
    `).bind(rateKey, now, windowEndsAt).run()

    const rateState = await db.prepare(
      `SELECT count, expires_at FROM rate_limits WHERE key = ? LIMIT 1`
    ).bind(rateKey).first<ApiRecord>()

    const currentCount = Number(rateState?.count || 0)
    const expiresAt = typeof rateState?.expires_at === 'string' ? rateState.expires_at : ''
    if (currentCount > RATE_LIMIT_MAX && expiresAt > now) {
      return jsonResponse(
        { error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Insert pageview event
    const eventId = crypto.randomUUID()
    await db.prepare(`
      INSERT INTO site_pageview_events (
        id, site_id, page_path, referrer, user_agent, 
        ip_hash, session_id, duration_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      siteId,
      pagePath,
      referrer || null,
      userAgent || null,
      ipHash,
      sessionId,
      durationSeconds ?? null,
      now
    ).run()

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

function getClientIP(event: H3Event): string | null {
  // Try CF header first (Cloudflare Pages)
  const cfIp = getHeader(event, 'cf-connecting-ip')
  if (cfIp) return cfIp

  // Fall back to x-forwarded-for
  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    return first ? first.trim() : null
  }

  // Fall back to request connection
  return event.node?.req?.socket?.remoteAddress || null
}

async function hashIp(ip: string): Promise<string> {
  // Simple hash for IP anonymization; in production consider crypto-js or similar
  const encoder = new TextEncoder()
  const data = encoder.encode(ip)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
