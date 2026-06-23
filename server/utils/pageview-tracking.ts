// Shared pageview tracking: cookie format + D1 insert, used by both the
// server-side SSR middleware and the client-side /api/analytics/track endpoint.
//
// Cookie contract (canonical — anonymous, not Better Auth):
//   kc_visitor_id — long-lived anonymous device ID, 2yr TTL, HttpOnly, SameSite=Lax
//   kc_session_id — short-lived visit ID, 30min sliding TTL, HttpOnly, SameSite=Lax
import { getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'

export const VISITOR_COOKIE = 'kc_visitor_id'
export const SESSION_COOKIE = 'kc_session_id'

const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2 // 2 years
const SESSION_MAX_AGE_SECONDS = 60 * 30 // 30 minutes, sliding

interface CookieOptions {
  secure?: boolean
}

function cookieAttrs(maxAgeSeconds: number, opts: CookieOptions = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: opts.secure ?? true,
    path: '/',
    maxAge: maxAgeSeconds
  }
}

export function getOrCreateVisitorId(event: H3Event): string {
  const existing = getCookie(event, VISITOR_COOKIE)
  if (existing) return existing

  const visitorId = crypto.randomUUID()
  setCookie(event, VISITOR_COOKIE, visitorId, cookieAttrs(VISITOR_MAX_AGE_SECONDS))
  return visitorId
}

export function getOrCreateSessionId(event: H3Event): string {
  const existing = getCookie(event, SESSION_COOKIE)
  const sessionId = existing || crypto.randomUUID()
  // Always refresh — sliding 30min window from the most recent activity.
  setCookie(event, SESSION_COOKIE, sessionId, cookieAttrs(SESSION_MAX_AGE_SECONDS))
  return sessionId
}

export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(ip)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function getClientIp(event: H3Event): string {
  const cfIp = getHeader(event, 'cf-connecting-ip')
  if (cfIp) return cfIp

  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    if (first) return first.trim()
  }

  return event.node?.req?.socket?.remoteAddress || 'unknown'
}

interface CloudflareGeo {
  country?: string
  region?: string
  city?: string
}

export function getCloudflareGeo(event: H3Event): CloudflareGeo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfReq = (event.context.cloudflare as any)?.request as (Request & { cf?: CloudflareGeo }) | undefined
  const cf = cfReq?.cf
  if (cf) {
    return { country: cf.country, region: cf.region, city: cf.city }
  }

  // Fallback for environments where the raw request isn't exposed (e.g. local dev).
  const country = getHeader(event, 'cf-ipcountry')
  return country && country !== 'XX' ? { country } : {}
}

export interface PageviewEventInput {
  siteId: string
  locationId?: string | null
  pagePath: string
  referrer?: string | null
  userAgent?: string | null
  ipHash: string
  sessionId: string
  visitorId: string
  durationSeconds?: number | null
  country?: string | null
  region?: string | null
  city?: string | null
}

export async function insertPageviewEvent(db: D1Database, input: PageviewEventInput): Promise<void> {
  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO site_pageview_events (
      id, site_id, location_id, page_path, referrer, user_agent,
      ip_hash, session_id, visitor_id, duration_seconds,
      country, region, city, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId,
    input.siteId,
    input.locationId ?? null,
    input.pagePath,
    input.referrer ?? null,
    input.userAgent ?? null,
    input.ipHash,
    input.sessionId,
    input.visitorId,
    input.durationSeconds ?? null,
    input.country ?? null,
    input.region ?? null,
    input.city ?? null,
    now
  ).run()
}

// Paths that should never generate a pageview event, regardless of caller.
export const PAGEVIEW_SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/_nuxt/', '/assets/', '/_ipx/', '/favicon'
]

export function isTrackablePath(pathname: string): boolean {
  if (PAGEVIEW_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return false
  // Skip anything that looks like a static asset (has a file extension).
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return false
  return true
}
